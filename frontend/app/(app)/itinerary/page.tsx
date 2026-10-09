import type { Metadata } from "next";
import { Suspense } from "react";
import DayPlanner from "@/components/DayPlanner";

export const metadata: Metadata = { title: "Day Itinerary · TravelBuddy" };

export default function ItineraryPage() {
  // DayPlanner reads ?demo=TR4, so it waits behind Suspense (Next 16).
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-on-surface-variant">Loading…</p>}>
      <DayPlanner />
    </Suspense>
  );
}
