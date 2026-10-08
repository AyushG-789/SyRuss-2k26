"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { eventTitle, pct } from "@/lib/format";
import { LiveEventsProvider, useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";

const NAV = [
  { href: "/", label: "Home & Transit Hub", icon: "hub", match: (p: string) => p === "/" },
  { href: "/plan", label: "Journey Planner", icon: "alt_route", match: (p: string) => p === "/plan" },
  { href: "/routes/TR3", label: "Route Results", icon: "directions_transit", match: (p: string) => p.startsWith("/routes") },
  { href: "/track", label: "Live Trip Tracking", icon: "location_on", match: (p: string) => p.startsWith("/track") },
];
const PRESENTER = [
  { href: "/admin", label: "Demo control", icon: "tune", match: (p: string) => p.startsWith("/admin") },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const item = (n: (typeof NAV)[number]) => {
    const active = n.match(path);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition ${
          active ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-container-low hover:text-on-surface"
        }`}
      >
        <Icon name={n.icon} className="text-[22px]" fill={active} />
        {n.label}
      </Link>
    );
  };
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map(item)}
      <p className="mt-4 px-3 text-[11px] font-bold uppercase tracking-wider text-outline">Presenter</p>
      {PRESENTER.map(item)}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-on-primary">
        <Icon name="route" className="text-[22px]" />
      </span>
      <span className="leading-none">
        <span className="block text-lg font-bold tracking-tight text-primary">TravelBuddy</span>
        <span className="block text-[11px] font-bold tracking-[0.18em] text-slate">MUMBAI TRANSIT</span>
      </span>
    </Link>
  );
}

function FeedStatus({ compact = false }: { compact?: boolean }) {
  const live = useLiveEvents();
  const connected = live?.source === "backend";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        connected ? "bg-primary-soft text-primary-ink" : "bg-container-low text-on-surface-variant"
      }`}
      title={connected ? "Connected to Pakka Check" : "Backend not running — showing sample data"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-primary animate-pulse" : "bg-outline"}`} />
      {connected ? (compact ? `Live ${live?.asOf}` : `Pakka Check live · ${live?.asOf}`) : "Sample data"}
    </span>
  );
}

function TopAlert() {
  const live = useLiveEvents();
  const confirmed = (live?.events ?? [])
    .filter((e) => e.status === "confirmed")
    .sort((a, b) => b.confidence - a.confidence);
  if (confirmed.length === 0) {
    return (
      <span className="hidden min-w-0 items-center gap-2 truncate rounded-full bg-container-low px-3 py-1.5 text-sm text-on-surface-variant md:flex">
        <Icon name="check_circle" className="text-[18px] text-primary" /> No confirmed disruptions right now
      </span>
    );
  }
  const top = confirmed[0];
  return (
    <Link
      href="/admin"
      className="hidden min-w-0 items-center gap-2 rounded-full bg-tertiary-fixed px-3 py-1.5 text-sm font-semibold text-tertiary md:flex"
      title="Verified by Pakka Check"
    >
      <Icon name="warning" className="text-[18px]" />
      <span className="truncate">
        Alert: {eventTitle(top)} · {pct(top.confidence)} verified
        {confirmed.length > 1 ? ` · +${confirmed.length - 1} more` : ""}
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LiveEventsProvider>
      <Shell>{children}</Shell>
    </LiveEventsProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-full">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-6 border-r border-hairline bg-container-lowest px-4 py-5 lg:flex">
        <Brand />
        <div className="flex items-center justify-between rounded-xl bg-container-low px-3 py-2 text-xs">
          <span className="font-semibold text-on-surface-variant">Disruption feed</span>
          <FeedStatus compact />
        </div>
        <NavList />
        <div className="mt-auto rounded-2xl bg-container-low p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">Active city</span>
            <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-[11px] font-bold text-on-primary-fixed">PROTOTYPE</span>
          </div>
          <p className="mt-1 font-semibold">Mumbai</p>
          <p className="text-on-surface-variant">Metro · Western · Central · Harbour · BEST</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[1200] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-slate/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-container-lowest px-4 py-5 shadow-float">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1 hover:bg-container-low">
                <Icon name="close" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[1100] flex items-center gap-3 border-b border-hairline bg-surface/90 px-4 py-3 backdrop-blur">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 hover:bg-container-low lg:hidden">
            <Icon name="menu" />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <Link
            href="/plan"
            className="hidden min-w-0 flex-1 items-center gap-2 rounded-xl bg-container-low px-3 py-2 text-sm text-outline hover:bg-container md:flex lg:max-w-xs"
          >
            <Icon name="search" className="text-[20px]" /> Search stations, places…
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            <TopAlert />
          </div>
          <span className="hidden items-center gap-1.5 rounded-xl bg-container-low px-3 py-1.5 text-sm font-semibold xl:flex">
            <Icon name="location_city" className="text-[18px] text-primary" /> Mumbai
          </span>
          <span className="ml-auto lg:ml-0">
            <FeedStatus />
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}
