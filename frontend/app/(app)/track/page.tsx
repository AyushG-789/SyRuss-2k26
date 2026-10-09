import type { Metadata } from "next";
import TrackView from "@/components/TrackView";

export const metadata: Metadata = { title: "Live trip · TravelBuddy" };

export default function TrackPage() {
  return <TrackView />;
}
