import type { Metadata } from "next";
import LocalTrainsTracker from "@/components/LocalTrainsTracker";

export const metadata: Metadata = {
  title: "Local Trains Live Tracker · TravelBuddy",
  description: "Live Mumbai Suburban train departures across Western, Central, and Harbour lines with fast/slow indicators, platforms, and delay telemetry.",
};

export default function TrainsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <LocalTrainsTracker />
    </div>
  );
}
