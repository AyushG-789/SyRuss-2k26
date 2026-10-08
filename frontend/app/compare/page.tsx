import type { Metadata } from "next";
import CompareView from "@/components/CompareView";

export const metadata: Metadata = { title: "Compare · TravelBuddy" };

export default function ComparePage() {
  return <CompareView />;
}
