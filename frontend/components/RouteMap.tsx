"use client";

// Leaflet touches `window`, so this file is only ever loaded with next/dynamic { ssr: false }.
import "leaflet/dist/leaflet.css";
import { createLeafletContext, LeafletContext, type LeafletContextInterface } from "@react-leaflet/core";
import { divIcon, Map as LeafletMap } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { lines, stations } from "@/lib/api";
import { evidenceSummary, eventPosition, eventTitle, legColor, pct, STATUS_STYLE } from "@/lib/format";
import { legPath, type LatLon } from "@/lib/geo";
import { useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/RouteMap";
import { useProfile } from "@/lib/profile";
import { type NetworkLayer, WALK_COLOR } from "@/lib/mapLayers";
import { MAP_COLORS } from "@/lib/theme";
import type { DisruptionEvent, Place, RouteCard } from "@/lib/types";

const MUMBAI: LatLon = [19.05, 72.87];

/** A numbered stop on a day plan (1, 2, 3…) — or "S" for where the day starts. */
export interface MapStop {
  lat: number;
  lon: number;
  label: string;
  /** Shown in the pin: a number, or "S" for the start. */
  badge: string;
  sub?: string;
  active?: boolean;
}

type MapColors = (typeof MAP_COLORS)["light"];

function stopIcon(badge: string, active: boolean, start: boolean, c: MapColors) {
  const bg = start ? c.start : active ? c.accent : c.brand;
  const size = active ? 34 : 28;
  return divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:${c.pinText};display:grid;place-items:center;font:700 ${active ? 15 : 13}px/1 'Plus Jakarta Sans',system-ui,sans-serif;border:3px solid ${c.ring};box-shadow:0 2px 6px rgba(0,0,0,.35)">${badge}</div>`,
  });
}

// react-leaflet's MapContainer destroys the Leaflet map whenever its effects are cleaned up. Next 16
// (cacheComponents) keeps visited pages alive but hidden, and Fast Refresh re-runs effects, so the
// layers then get re-added to a destroyed map ("this.getPane() is undefined"). This container only
// destroys the map once its <div> has really left the page, and re-measures when shown again.
function MapContainer({ center, zoom, className, style, children }: {
  center: LatLon; zoom: number; className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const [context, setContext] = useState<LeafletContextInterface | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || nodeRef.current) return;
    nodeRef.current = node;
    const map = new LeafletMap(node, { scrollWheelZoom: true }).setView(center, zoom);
    setContext(createLeafletContext(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create the map once, like react-leaflet
  }, []);
  useEffect(() => {
    if (!context) return;
    const { map } = context;
    map.invalidateSize();
    return () => {
      setTimeout(() => {
        if (!nodeRef.current?.isConnected) map.remove();
      }, 0);
    };
  }, [context]);
  return (
    <div ref={mapRef} className={className} style={style}>
      {context && <LeafletContext value={context}>{children}</LeafletContext>}
    </div>
  );
}

function FitTo({ points }: { points: LatLon[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0], 14);
  }, [map, points]);
  return null;
}


/** Whole rail + metro network, used to frame the map (stays the same when layers change). */
const RAIL_POINTS: LatLon[] = Object.entries(lines).filter(([, l]) => l.mode !== "bus").flatMap(([, l]) => l.stations.map((s) => [stations[s].lat, stations[s].lon] as LatLon));

const metres = (a: LatLon, b: LatLon) => {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180, dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

/** Walking links: stations of different lines close enough to walk between (≤ 450 m). */
const WALK_LINKS: { key: string; a: string; b: string; path: [LatLon, LatLon]; min: number }[] = (() => {
  const lineOf = new Map<string, Set<string>>();
  for (const [lid, l] of Object.entries(lines)) for (const sid of l.stations) {
    if (!lineOf.has(sid)) lineOf.set(sid, new Set());
    lineOf.get(sid)!.add(lid);
  }
  const ids = [...lineOf.keys()].filter((id) => stations[id] && stations[id].mode !== "bus");
  const out: { key: string; a: string; b: string; path: [LatLon, LatLon]; min: number }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = stations[ids[i]], B = stations[ids[j]];
    if ([...lineOf.get(ids[i])!].some((l) => lineOf.get(ids[j])!.has(l))) continue; // same line: not a walk
    const pa: LatLon = [A.lat, A.lon], pb: LatLon = [B.lat, B.lon];
    const m = metres(pa, pb);
    if (m <= 450) out.push({ key: `${ids[i]}-${ids[j]}`, a: A.name, b: B.name, path: [pa, pb], min: Math.max(1, Math.round(m / 80)) });
  }
  return out;
})();

/** Lets a solid line "draw itself": with pathLength = 1 the CSS dash animation fits any length. */
function drawIn(e: { target: { getElement?: () => Element | undefined } }) {
  e.target.getElement?.()?.setAttribute("pathLength", "1");
}

export default function RouteMap({
  card = null,
  origin = null,
  destination = null,
  events = [],
  showNetwork = false,
  layers,
  here = null,
  stops = [],
  onStopClick,
}: {
  card?: RouteCard | null;
  origin?: Place | null;
  destination?: Place | null;
  events?: DisruptionEvent[];
  /** Draw every rail/metro line faintly in its own colour (journey planner canvas). */
  showNetwork?: boolean;
  /** Pick which network layers to draw (overrides showNetwork): metro, local, BEST bus, walking links. */
  layers?: Partial<Record<NetworkLayer, boolean>>;
  /** Live position marker (trip tracking). */
  here?: LatLon | null;
  /** Numbered stops of a day plan; the map fits to all of them. */
  stops?: MapStop[];
  onStopClick?: (index: number) => void;
}) {
  const c = MAP_COLORS[useProfile().appearance];
  const t = useT(M);
  const paths = useMemo(
    () => (card ? card.legs.map((leg) => ({ leg, path: legPath(leg, origin, destination) })) : []),
    [card, origin, destination],
  );
  const on = useMemo<Partial<Record<NetworkLayer, boolean>>>(
    () => layers ?? (showNetwork ? { metro: true, local: true } : {}),
    [layers, showNetwork],
  );
  const network = useMemo(
    () => Object.entries(lines)
      .filter(([, l]) => on[l.mode as NetworkLayer])
      .map(([id, l]) => ({
        id, color: l.color, bus: l.mode === "bus",
        name: l.name.replace(/\s*\(TODO number\)/, ""),
        path: l.stations.filter((s) => stations[s]).map((s) => [stations[s].lat, stations[s].lon] as LatLon),
      })),
    [on],
  );
  const framed = showNetwork || layers !== undefined;
  // Stable reference so the map only re-fits when what we're showing changes.
  const stopsKey = stops.map((p) => `${p.lat},${p.lon}`).join("|");
  const fitPoints = useMemo(() => {
    if (stopsKey) return stopsKey.split("|").map((k) => k.split(",").map(Number) as LatLon);
    const all = paths.flatMap((p) => p.path);
    if (all.length > 1) return all;
    const ends = [origin, destination].filter(Boolean).map((p) => [p!.lat, p!.lon] as LatLon);
    if (ends.length) return ends;
    return framed ? RAIL_POINTS : [MUMBAI];
  }, [stopsKey, paths, origin, destination, framed]);

  return (
    <MapContainer center={MUMBAI} zoom={11} className="h-full w-full" style={{ minHeight: 320 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTo points={fitPoints} />

      {network.map((n) => (
        <Polyline key={n.id} positions={n.path}
          pathOptions={{ color: n.color, weight: n.bus ? 3 : 4, opacity: card ? (layers ? 0.6 : 0.25) : n.bus ? 0.7 : 0.8, dashArray: n.bus ? "6 6" : undefined }}>
          <Tooltip sticky>{n.name}</Tooltip>
        </Polyline>
      ))}
      {on.walk && WALK_LINKS.map((w) => (
        <Polyline key={w.key} positions={w.path} pathOptions={{ color: WALK_COLOR, weight: 4, opacity: 0.9, dashArray: "2 6" }}>
          <Tooltip sticky>{t("walkLink", { a: w.a, b: w.b, min: w.min })}</Tooltip>
        </Polyline>
      ))}
      {on.walk && WALK_LINKS.map((w) => (
        <CircleMarker key={`${w.key}-dot`} center={w.path[0]} radius={4} pathOptions={{ color: WALK_COLOR, fillColor: WALK_COLOR, fillOpacity: 1, weight: 1 }} />
      ))}

      {paths.map(({ leg, path }, i) =>
        path.length > 1 ? (
          <Polyline
            key={`${card?.plan_id}-${i}`}
            positions={path}
            pathOptions={{
              color: legColor(leg),
              weight: leg.mode === "walk" ? 4 : 6,
              opacity: 0.95,
              dashArray: leg.mode === "walk" ? "4 8" : leg.line_id ? undefined : "10 6",
              // Solid train / metro / bus legs draw themselves in once (see .route-draw in globals.css).
              className: leg.mode !== "walk" && leg.line_id ? "route-draw" : undefined,
            }}
            eventHandlers={leg.mode !== "walk" && leg.line_id ? { add: drawIn } : undefined}
          >
            <Tooltip sticky>
              {leg.depart}–{leg.arrive} · {t("legMin", { n: leg.duration_min })}{leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}
            </Tooltip>
          </Polyline>
        ) : null,
      )}

      {events.map((ev) => {
        const pos = eventPosition(ev);
        if (!pos) return null;
        const style = STATUS_STYLE[ev.status];
        return (
          <CircleMarker
            key={ev.event_id}
            center={pos}
            radius={ev.status === "confirmed" ? 11 : 8}
            pathOptions={{ color: style.color, fillColor: style.color, fillOpacity: 0.35, weight: 2 }}
          >
            <Popup>
              <strong>{eventTitle(ev)}</strong>
              <br />
              {style.label} · {t("sure", { pct: pct(ev.confidence) })} · {evidenceSummary(ev)}
              <br />
              <span style={{ opacity: 0.7 }}>
                {t("seen", { first: ev.first_seen, last: ev.last_seen })}
              </span>
            </Popup>
          </CircleMarker>
        );
      })}

      {stops.length > 1 && (
        <Polyline positions={stops.map((p) => [p.lat, p.lon] as LatLon)} pathOptions={{ color: c.brand, weight: 2, opacity: 0.55, dashArray: "2 8" }} />
      )}
      {stops.map((p, i) => (
        <Marker key={`${p.badge}-${p.lat}-${p.lon}`} position={[p.lat, p.lon]} icon={stopIcon(p.badge, !!p.active, p.badge === "S", c)}
          zIndexOffset={p.active ? 1000 : 0} eventHandlers={onStopClick ? { click: () => onStopClick(i) } : undefined}>
          <Tooltip direction="top" offset={[0, -14]}>
            <b>{p.badge === "S" ? t("start") : `${p.badge}.`} {p.label}</b>{p.sub ? <><br />{p.sub}</> : null}
          </Tooltip>
        </Marker>
      ))}

      {origin && stops.length === 0 && (
        <CircleMarker center={[origin.lat, origin.lon]} radius={8} pathOptions={{ color: c.brand, fillColor: c.ring, fillOpacity: 1, weight: 3 }}>
          <Tooltip>{t("startAt", { label: origin.label })}</Tooltip>
        </CircleMarker>
      )}
      {destination && stops.length === 0 && (
        <CircleMarker center={[destination.lat, destination.lon]} radius={8} pathOptions={{ color: c.accent, fillColor: c.accentFill, fillOpacity: 1, weight: 3 }}>
          <Tooltip>{t("endAt", { label: destination.label })}</Tooltip>
        </CircleMarker>
      )}
      {here && (
        <CircleMarker center={here} radius={9} pathOptions={{ color: c.ring, fillColor: c.brand, fillOpacity: 1, weight: 4 }}>
          <Tooltip permanent direction="top">{t("here")}</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
