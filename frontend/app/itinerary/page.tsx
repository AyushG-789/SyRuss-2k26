import type { Metadata } from "next";
import DayPlanner from "@/components/DayPlanner";

export const metadata: Metadata = { title: "Day Itinerary · TravelBuddy" };

export default function ItineraryPage() {
  return <DayPlanner />;
}
