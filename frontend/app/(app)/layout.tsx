import AppShell from "@/components/AppShell";

// Every app screen (Home hub, planner, routes, live trip …) shares the sidebar + top bar.
// The landing page at "/" sits outside this group and has its own header and footer.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
