import type { Metadata } from "next";
import StationExplorer from "@/components/StationExplorer";

export const metadata: Metadata = { title: "Station Explorer · TravelBuddy" };

export default function StationsPage() {
  return <StationExplorer />;
}
