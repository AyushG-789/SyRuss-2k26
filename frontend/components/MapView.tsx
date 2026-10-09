"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n";
import { COMMON } from "@/lib/i18n/common";
import Loader from "./Loader";

function MapLoading() {
  const tc = useT(COMMON);
  return <div className="grid h-full min-h-80 place-items-center text-sm"><Loader label={tc("loading")} /></div>;
}

// Client-only Leaflet map (Leaflet needs `window`).
const MapView = dynamic(() => import("./RouteMap"), { ssr: false, loading: () => <MapLoading /> });

export default MapView;
