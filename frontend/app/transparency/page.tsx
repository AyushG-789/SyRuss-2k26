import type { Metadata } from "next";
import TransparencyView from "@/components/TransparencyView";

export const metadata: Metadata = { title: "Transparency · TravelBuddy" };

export default function TransparencyPage() {
  return <TransparencyView />;
}
