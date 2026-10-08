import { Suspense } from "react";
import CustomRoutes from "@/components/CustomRoutes";

// A trip from the planner: /routes?t=<traveller json>. The URL read happens inside Suspense.
export default function RoutesPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-7xl px-6 py-6 text-on-surface-variant">Reading your trip…</p>}>
      <CustomRoutes />
    </Suspense>
  );
}
