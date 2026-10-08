// Geometry helpers for drawing legs and placing the live "you are here" marker.

import { lines, stations } from "./api";
import type { Leg, Place, RouteCard } from "./types";

export type LatLon = [number, number];

export function pointFor(id: string, origin: Place | null, destination: Place | null): LatLon | null {
  if (id === "origin") return origin ? [origin.lat, origin.lon] : null;
  if (id === "destination") return destination ? [destination.lat, destination.lon] : null;
  const s = stations[id];
  return s ? [s.lat, s.lon] : null;
}

/** Transit legs follow the line's stations; everything else is a straight segment. */
export function legPath(leg: Leg, origin: Place | null, destination: Place | null): LatLon[] {
  const line = leg.line_id ? lines[leg.line_id] : undefined;
  if (line) {
    const a = line.stations.indexOf(leg.from_id);
    const b = line.stations.indexOf(leg.to_id);
    if (a >= 0 && b >= 0) {
      const ids = a <= b ? line.stations.slice(a, b + 1) : line.stations.slice(b, a + 1).reverse();
      return ids.map((id) => [stations[id].lat, stations[id].lon]);
    }
  }
  const from = pointFor(leg.from_id, origin, destination);
  const to = pointFor(leg.to_id, origin, destination);
  return from && to ? [from, to] : [];
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Point `t` (0..1) of the way along a polyline. */
function along(path: LatLon[], t: number): LatLon {
  if (path.length === 1) return path[0];
  const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? d / seg[i] : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    }
    d -= seg[i];
  }
  return path[path.length - 1];
}

/** Where the traveller is at demo time `now` on `card` (null before start / after arrival). */
export function positionAt(card: RouteCard, nowMin: number, origin: Place | null, destination: Place | null): LatLon | null {
  for (const leg of card.legs) {
    const a = toMin(leg.depart);
    const b = toMin(leg.arrive);
    if (nowMin >= a && nowMin <= b) {
      const path = legPath(leg, origin, destination);
      return path.length ? along(path, b > a ? (nowMin - a) / (b - a) : 1) : null;
    }
  }
  return null;
}
