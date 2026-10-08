import { Suspense } from "react";
import JourneyPlanner from "@/components/JourneyPlanner";

// /plan?from=…&to=… — the planner reads the URL, so it waits behind Suspense.
export default function PlanPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-7xl px-6 py-6 text-on-surface-variant">Loading planner…</p>}>
      <JourneyPlanner />
    </Suspense>
  );
}
