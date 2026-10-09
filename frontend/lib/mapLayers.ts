// Parts of the network the planner map can show (RouteMap draws them; JourneyPlanner has the buttons).
import { lines } from "./api";

export type NetworkLayer = "metro" | "local" | "bus" | "walk";

/** Colour of walking links (same grey as walking legs on a route). */
export const WALK_COLOR = "#8a94a6";

/** The line colours used by each layer (shown as little swatches on its button). */
export const LAYER_COLORS: Record<NetworkLayer, string[]> = {
  metro: [...new Set(Object.values(lines).filter((l) => l.mode === "metro").map((l) => l.color))],
  local: [...new Set(Object.values(lines).filter((l) => l.mode === "local").map((l) => l.color))],
  bus: [...new Set(Object.values(lines).filter((l) => l.mode === "bus").map((l) => l.color))],
  walk: [WALK_COLOR],
};

export const DEFAULT_LAYERS: Record<NetworkLayer, boolean> = { metro: true, local: true, bus: false, walk: false };
