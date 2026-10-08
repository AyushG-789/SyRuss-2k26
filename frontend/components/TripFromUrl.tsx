"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { parseTrip } from "@/lib/tripUrl";
import PlanView from "./PlanView";

export default function TripFromUrl() {
  const raw = useSearchParams().get("t");
  // Parse once per URL so PlanView doesn't refetch on every render.
  const traveller = useMemo(() => parseTrip(raw), [raw]);
  return <PlanView traveller={traveller} />;
}
