"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { parseTrip } from "@/lib/tripUrl";
import RouteResults from "./RouteResults";

export default function CustomRoutes() {
  const raw = useSearchParams().get("t");
  // Parse once per URL so RouteResults doesn't refetch on every render.
  const traveller = useMemo(() => parseTrip(raw), [raw]);
  return <RouteResults traveller={traveller} />;
}
