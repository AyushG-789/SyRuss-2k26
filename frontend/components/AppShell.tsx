"use client";

// App shell (sidebar + top bar) from the team's design. Frontend only for now: status pills and
// the alert come from lib/mockHome.ts `shell` until the backend is connected.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { shell } from "@/lib/mockHome";
import { LiveEventsProvider, useLiveEvents } from "@/lib/useLiveEvents";
import ChatAssistant from "./ChatAssistant";
import Icon from "./Icon";

type NavItem = { href: string; label: string; icon: string; match: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Home & Transit Hub", icon: "hub", match: (p) => p === "/" },
  { href: "/plan", label: "Journey Planner", icon: "alt_route", match: (p) => p === "/plan" },
  { href: "/routes/TR3", label: "Route Results", icon: "directions_subway", match: (p) => p.startsWith("/routes") },
  { href: "/track", label: "Live Trip Tracking", icon: "fmd_good", match: (p) => p.startsWith("/track") },
  { href: "/report", label: "Report Incident", icon: "campaign", match: (p) => p.startsWith("/report") },
  { href: "/stations", label: "Station Explorer & Nearby", icon: "near_me", match: (p) => p.startsWith("/stations") },
  { href: "/itinerary", label: "Day Itinerary", icon: "event_note", match: (p) => p.startsWith("/itinerary") },
];
const TRUST: NavItem[] = [
  { href: "/transparency", label: "Transparency", icon: "visibility", match: (p) => p.startsWith("/transparency") || p.startsWith("/events") },
  { href: "/compare", label: "Compare: Normal app vs Us", icon: "compare_arrows", match: (p) => p.startsWith("/compare") },
];
const PRESENTER: NavItem[] = [
  { href: "/admin", label: "Demo control", icon: "tune", match: (p) => p.startsWith("/admin") },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const item = (n: NavItem) => {
    const active = n.match(path);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-all ${
          active
            ? "bg-primary font-semibold text-on-primary shadow-card"
            : "text-on-surface-variant hover:bg-container-high hover:text-on-surface"
        }`}
      >
        <Icon name={n.icon} className="text-[20px]" />
        <span>{n.label}</span>
      </Link>
    );
  };
  return (
    <nav className="mt-2 flex flex-col gap-1 px-4" aria-label="Main">
      {NAV.map(item)}
      <p className="mt-4 px-4 eyebrow text-outline">Trust &amp; results</p>
      {TRUST.map(item)}
      <p className="mt-4 px-4 eyebrow text-outline">Presenter</p>
      {PRESENTER.map(item)}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary">
        <Icon name="route" className="text-[20px]" />
      </span>
      <span className="flex flex-col">
        <span className="text-lg font-bold leading-none tracking-tight text-primary">TravelBuddy</span>
        <span className="text-micro font-bold uppercase tracking-widest text-on-surface-variant">Transit Hub</span>
      </span>
    </Link>
  );
}

/** Real Pakka Check counts instead of a made-up uptime figure. */
function useNetworkStatus(): { label: string; value: string; tone: "ok" | "warn" | "bad" | "off" } {
  const live = useLiveEvents();
  if (!live) return { label: "Pakka Check", value: "…", tone: "off" };
  if (live.source !== "backend") return { label: "Pakka Check", value: "Sample data", tone: "off" };
  const confirmed = live.events.filter((e) => e.status === "confirmed").length;
  const possible = live.events.filter((e) => e.status === "possible").length;
  if (confirmed) return { label: `Live · ${live.asOf}`, value: `${confirmed} confirmed`, tone: "bad" };
  if (possible) return { label: `Live · ${live.asOf}`, value: `${possible} possible`, tone: "warn" };
  return { label: `Live · ${live.asOf}`, value: "All clear", tone: "ok" };
}

const TONE_DOT = { ok: "bg-primary", warn: "bg-tertiary", bad: "bg-error", off: "bg-outline" } as const;
const TONE_TEXT = { ok: "text-primary", warn: "text-tertiary", bad: "text-error", off: "text-outline" } as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const status = useNetworkStatus();
  return (
    <>
      <div className="flex flex-col">
        <div className="flex h-16 items-center px-6">
          <Brand />
        </div>
        <div className="px-4 py-2">
          <div className="flex items-center justify-between rounded-lg bg-container-low px-4 py-1">
            <div className="flex items-center gap-1">
              <span className={`h-2 w-2 animate-pulse rounded-full ${TONE_DOT[status.tone]}`} />
              <span className="text-micro font-medium text-on-surface-variant">{status.label}</span>
            </div>
            <Link href="/transparency" className={`text-micro font-bold uppercase hover:underline ${TONE_TEXT[status.tone]}`}>{status.value}</Link>
          </div>
        </div>
        {/* usePathname() must sit inside Suspense on runtime routes like /events/[id] (Next 16). */}
        <Suspense fallback={<nav className="mt-2 h-96 px-4" aria-label="Main" />}>
          <NavList onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="p-4">
        <div className="flex flex-col gap-1 rounded-xl bg-container-low p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-on-surface-variant">Active City</span>
            <span className="rounded-full bg-primary-fixed px-1 py-0.5 text-micro font-bold uppercase text-on-primary-fixed">
              {shell.activeCity.badge}
            </span>
          </div>
          <div className="text-sm font-semibold">{shell.activeCity.name}</div>
          <div className="text-small text-on-surface-variant">{shell.activeCity.lines}</div>
        </div>
      </div>
    </>
  );
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/plan?to=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search stations, line codes (WR, C-1, BEST), or places..."
        aria-label="Search"
        className="h-10 w-full rounded-xl bg-container pl-9 pr-4 text-small placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </form>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LiveEventsProvider>
      <Shell>{children}</Shell>
    </LiveEventsProvider>
  );
}

/** Whether pages show live backend data or the bundled sample (backend offline). */
function FeedPill() {
  const live = useLiveEvents();
  const on = live?.source === "backend";
  return (
    <div className="flex items-center gap-1 rounded-lg bg-container-low px-2 py-1.5" title={on ? "Connected to the TravelBuddy server" : "Server offline — showing sample data"}>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-primary" : "bg-outline"}`} />
      <span className="hidden text-micro font-bold text-on-surface-variant sm:inline">{on ? `Live data · ${live?.asOf}` : "Offline · sample data"}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-full">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 z-50 hidden h-screen w-72 shrink-0 flex-col justify-between overflow-y-auto bg-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] lg:flex">
        <SidebarBody />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[1200] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-slate/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between overflow-y-auto bg-container-lowest shadow-float">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-1 hover:bg-container-low">
              <Icon name="close" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[1100] flex h-16 items-center justify-between gap-3 bg-container-lowest/90 px-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl md:px-6">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 hover:bg-container-low lg:hidden">
            <Icon name="menu" />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden max-w-2xl flex-1 items-center gap-5 md:flex">
            <SearchBox />
          </div>
          <div className="flex items-center gap-4">
            <button type="button" className="hidden items-center gap-1 rounded-lg bg-container px-4 py-1.5 transition-colors hover:bg-container-high sm:flex">
              <Icon name="location_city" className="text-[18px] text-primary" />
              <span className="text-xs font-semibold">{shell.city}</span>
              <Icon name="keyboard_arrow_down" className="text-[16px] text-outline" />
            </button>
            <FeedPill />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary" aria-label="Account">
              <Icon name="person" className="text-[18px] text-on-primary" />
            </div>
          </div>
        </header>
        {children}
      </div>
      <ChatAssistant />
    </div>
  );
}
