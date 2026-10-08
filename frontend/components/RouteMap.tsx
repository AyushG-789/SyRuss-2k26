"use client";

// Leaflet touches `window`, so this file is only ever loaded with next/dynamic { ssr: false }.
import "leaflet/dist/leaflet.css";
import { createLeafletContext, LeafletContext, type LeafletContextInterface } from "@react-leaflet/core";
import { Map as LeafletMap } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { lines, stations } from "@/lib/api";
import { evidenceSummary, eventPosition, eventTitle, legColor, pct, STATUS_STYLE } from "@/lib/format";
import { legPath, type LatLon } from "@/lib/geo";
import type { DisruptionEvent, Place, RouteCard } from "@/lib/types";

const MUMBAI: LatLon = [19.05, 72.87];

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

export default function RouteMap({
  card = null,
  origin = null,
  destination = null,
  events = [],
  showNetwork = false,
  here = null,
}: {
  card?: RouteCard | null;
  origin?: Place | null;
  destination?: Place | null;
  events?: DisruptionEvent[];
  /** Draw every rail/metro line faintly in its own colour (journey planner canvas). */
  showNetwork?: boolean;
  /** Live position marker (trip tracking). */
  here?: LatLon | null;
}) {
  const paths = useMemo(
    () => (card ? card.legs.map((leg) => ({ leg, path: legPath(leg, origin, destination) })) : []),
    [card, origin, destination],
  );
  const network = useMemo(
    () =>
      showNetwork
        ? Object.entries(lines)
            .filter(([, l]) => l.mode !== "bus")
            .map(([id, l]) => ({ id, color: l.color, name: l.name, path: l.stations.map((s) => [stations[s].lat, stations[s].lon] as LatLon) }))
        : [],
    [showNetwork],
  );
  // Stable reference so the map only re-fits when what we're showing changes.
  const fitPoints = useMemo(() => {
    const all = paths.flatMap((p) => p.path);
    if (all.length > 1) return all;
    const ends = [origin, destination].filter(Boolean).map((p) => [p!.lat, p!.lon] as LatLon);
    if (ends.length) return ends;
    return showNetwork ? network.flatMap((n) => n.path) : [MUMBAI];
  }, [paths, origin, destination, showNetwork, network]);

  return (
    <MapContainer center={MUMBAI} zoom={11} className="h-full w-full" style={{ minHeight: 320 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTo points={fitPoints} />

      {network.map((n) => (
        <Polyline key={n.id} positions={n.path} pathOptions={{ color: n.color, weight: 4, opacity: card ? 0.25 : 0.7 }}>
          <Tooltip sticky>{n.name}</Tooltip>
        </Polyline>
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
            }}
          >
            <Tooltip sticky>
              {leg.depart}–{leg.arrive} · {leg.duration_min} min{leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}
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
              {style.label} · {pct(ev.confidence)} · {evidenceSummary(ev)}
              <br />
              <span style={{ opacity: 0.7 }}>
                First seen {ev.first_seen}, last {ev.last_seen}
              </span>
            </Popup>
          </CircleMarker>
        );
      })}

      {origin && (
        <CircleMarker center={[origin.lat, origin.lon]} radius={8} pathOptions={{ color: "#006948", fillColor: "#ffffff", fillOpacity: 1, weight: 3 }}>
          <Tooltip>Start: {origin.label}</Tooltip>
        </CircleMarker>
      )}
      {destination && (
        <CircleMarker center={[destination.lat, destination.lon]} radius={8} pathOptions={{ color: "#8d4b00", fillColor: "#b15f00", fillOpacity: 1, weight: 3 }}>
          <Tooltip>End: {destination.label}</Tooltip>
        </CircleMarker>
      )}
      {here && (
        <CircleMarker center={here} radius={9} pathOptions={{ color: "#ffffff", fillColor: "#006948", fillOpacity: 1, weight: 4 }}>
          <Tooltip permanent direction="top">You are here</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
