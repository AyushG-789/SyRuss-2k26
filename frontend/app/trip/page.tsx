import { Suspense } from "react";
import MockBanner from "@/components/MockBanner";
import TripFromUrl from "@/components/TripFromUrl";

// A trip entered in the form: /trip?t=<traveller json>. The URL read happens inside Suspense.
export default function TripPage() {
  return (
    <>
      <MockBanner />
      <Suspense fallback={<p className="mx-auto w-full max-w-6xl px-4 py-6 text-muted">Reading your trip…</p>}>
        <TripFromUrl />
      </Suspense>
    </>
  );
}
