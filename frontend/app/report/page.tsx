import type { Metadata } from "next";
import ReportIncident from "@/components/ReportIncident";

export const metadata: Metadata = { title: "Report Incident · TravelBuddy" };

export default function ReportPage() {
  return <ReportIncident />;
}
