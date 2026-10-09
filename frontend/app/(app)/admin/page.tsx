import type { Metadata } from "next";
import AdminConsole from "@/components/AdminConsole";

export const metadata: Metadata = { title: "Demo control · TravelBuddy" };

// Presenter's remote control: demo clock, inject buttons, live Pakka Check results.
export default function AdminPage() {
  return <AdminConsole />;
}
