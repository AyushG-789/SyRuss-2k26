"use client";

import dynamic from "next/dynamic";

// Client-only Leaflet map (Leaflet needs `window`).
const MapView = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-80 place-items-center text-sm text-outline">Loading map…</div>,
});

export default MapView;
