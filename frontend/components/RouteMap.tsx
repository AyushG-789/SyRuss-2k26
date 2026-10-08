"use client";

// Leaflet touches `window`, so this file is only ever loaded with next/dynamic { ssr: false }.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { lines, stations } from "@/lib/api";
import {
  evidenceSummary,
  eventPosition,
  legColor,
  pct,
  STATUS_STYLE,
  TYPE_LABEL,
} from "@/lib/format";
import type { DisruptionEvent, Leg, Place, RouteCard } from "@/lib/types";

type LatLon = [number, number];

function point(id: string, origin: Place, destination: Place): LatLon | null {
  if (id === "origin") return [origin.lat, origin.lon];
  if (id === "destination") return [destination.lat, destination.lon];
  const s = stations[id];
  return s ? [s.lat, s.lon] : null;
}

/** Transit legs follow the line's stations; everything else is a straight segment. */
function legPath(leg: Leg, origin: Place, destination: Place): LatLon[] {
  const line = leg.line_id ? lines[leg.line_id] : undefined;
  if (line) {
    const a = line.stations.indexOf(leg.from_id);
    const b = line.stations.indexOf(leg.to_id);
    if (a >= 0 && b >= 0) {
      const ids = a <= b ? line.stations.slice(a, b + 1) : line.stations.slice(b, a + 1).reverse();
      return ids.map((id) => [stations[id].lat, stations[id].lon]);
    }
  }
  const from = point(leg.from_id, origin, destination);
  const to = point(leg.to_id, origin, destination);
  return from && to ? [from, to] : [];
}

function FitTo({ points }: { points: LatLon[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function RouteMap({
  card,
  origin,
  destination,
  events,
}: {
  card: RouteCard | null;
  origin: Place;
  destination: Place;
  events: DisruptionEvent[];
}) {
  const paths = useMemo(
    () => (card ? card.legs.map((leg) => ({ leg, path: legPath(leg, origin, destination) })) : []),
    [card, origin, destination],
  );
  // Stable reference so the map only re-fits when the selected route changes.
  const fitPoints = useMemo(() => {
    const all = paths.flatMap((p) => p.path);
    return all.length > 1 ? all : [[origin.lat, origin.lon] as LatLon, [destination.lat, destination.lon] as LatLon];
  }, [paths, origin, destination]);

  return (
    <MapContainer
      center={[origin.lat, origin.lon]}
      zoom={12}
      scrollWheelZoom
      className="h-full w-full"
      style={{ minHeight: 320 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTo points={fitPoints} />

      {paths.map(({ leg, path }, i) =>
        path.length > 1 ? (
          <Polyline
            key={`${card?.plan_id}-${i}`}
            positions={path}
            pathOptions={{
              color: legColor(leg),
              weight: leg.mode === "walk" ? 4 : 6,
              opacity: 0.9,
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
              <strong>{TYPE_LABEL[ev.type] ?? ev.type}</strong> · {style.label} ({pct(ev.confidence)})
              <br />
              {evidenceSummary(ev)}
              <br />
              <span style={{ opacity: 0.7 }}>
                First seen {ev.first_seen}, last {ev.last_seen}
              </span>
            </Popup>
          </CircleMarker>
        );
      })}

      <CircleMarker center={[origin.lat, origin.lon]} radius={7} pathOptions={{ color: "#0f766e", fillColor: "#ffffff", fillOpacity: 1, weight: 3 }}>
        <Tooltip>Start: {origin.label}</Tooltip>
      </CircleMarker>
      <CircleMarker center={[destination.lat, destination.lon]} radius={7} pathOptions={{ color: "#0f766e", fillColor: "#0f766e", fillOpacity: 1, weight: 3 }}>
        <Tooltip>End: {destination.label}</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
