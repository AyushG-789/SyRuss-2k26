"use client";

// App shell (sidebar + top bar) from the team's design. Frontend only for now: status pills and
// the alert come from lib/mockHome.ts `shell` until the backend is connected.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getProfile, initials, OPEN_EVENT, type ProfileSection, setAppLanguage, useProfile } from "@/lib/profile";
import { LANGS, setActiveLang, useLang, useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/AppShell";
import { applyTheme } from "@/lib/theme";
import { LiveEventsProvider, useLiveEvents } from "@/lib/useLiveEvents";
import ChatAssistant from "./ChatAssistant";
import Icon from "./Icon";
import LiveClock from "./LiveClock";
import ProfilePanel from "./ProfilePanel";

type NavKey = Extract<keyof typeof M.en, `nav.${string}`>;
type NavItem = { href: string; label: NavKey; icon: string; match: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: "/", label: "nav./", icon: "hub", match: (p) => p === "/" },
  { href: "/plan", label: "nav./plan", icon: "alt_route", match: (p) => p === "/plan" },
  { href: "/trains", label: "nav./trains", icon: "train", match: (p) => p.startsWith("/trains") },
  { href: "/routes/TR3", label: "nav./routes/TR3", icon: "directions_subway", match: (p) => p.startsWith("/routes") },
  { href: "/track", label: "nav./track", icon: "fmd_good", match: (p) => p.startsWith("/track") },
  { href: "/report", label: "nav./report", icon: "campaign", match: (p) => p.startsWith("/report") },
  { href: "/stations", label: "nav./stations", icon: "near_me", match: (p) => p.startsWith("/stations") },
  { href: "/itinerary", label: "nav./itinerary", icon: "event_note", match: (p) => p.startsWith("/itinerary") },
];
const TRUST: NavItem[] = [
  { href: "/transparency", label: "nav./transparency", icon: "visibility", match: (p) => p.startsWith("/transparency") || p.startsWith("/events") },
  { href: "/compare", label: "nav./compare", icon: "compare_arrows", match: (p) => p.startsWith("/compare") },
];
const PRESENTER: NavItem[] = [
  { href: "/admin", label: "nav./admin", icon: "tune", match: (p) => p.startsWith("/admin") },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT(M);
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
        <span>{t(n.label)}</span>
      </Link>
    );
  };
  return (
    <nav className="mt-2 flex flex-col gap-1 px-4" aria-label={t("main")}>
      {NAV.map(item)}
      <p className="mt-4 px-4 eyebrow text-outline">{t("trust")}</p>
      {TRUST.map(item)}
      <p className="mt-4 px-4 eyebrow text-outline">{t("presenter")}</p>
      {PRESENTER.map(item)}
    </nav>
  );
}

function Brand() {
  const t = useT(M);
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary">
        <Icon name="route" className="text-[20px]" />
      </span>
      <span className="flex flex-col">
        <span className="text-lg font-bold leading-none tracking-tight text-primary">TravelBuddy</span>
        <span className="text-micro font-bold uppercase tracking-widest text-on-surface-variant">{t("transitHub")}</span>
      </span>
    </Link>
  );
}

/** Real Pakka Check counts instead of a made-up uptime figure. */
function useNetworkStatus(): { label: string; value: string; tone: "ok" | "warn" | "bad" | "off" } {
  const t = useT(M);
  const live = useLiveEvents();
  if (!live) return { label: "Pakka Check", value: "…", tone: "off" };
  if (live.source !== "backend") return { label: "Pakka Check", value: t("sample"), tone: "off" };
  const confirmed = live.events.filter((e) => e.status === "confirmed").length;
  const possible = live.events.filter((e) => e.status === "possible").length;
  const label = t("live", { time: live.asOf ?? "" });
  if (confirmed) return { label, value: t("confirmed", { n: confirmed }), tone: "bad" };
  if (possible) return { label, value: t("possible", { n: possible }), tone: "warn" };
  return { label, value: t("allClear"), tone: "ok" };
}

const TONE_DOT = { ok: "bg-primary", warn: "bg-tertiary", bad: "bg-error", off: "bg-outline" } as const;
const TONE_TEXT = { ok: "text-primary", warn: "text-tertiary", bad: "text-error", off: "text-outline" } as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT(M);
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
        <Suspense fallback={<nav className="mt-2 h-96 px-4" aria-label={t("main")} />}>
          <NavList onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="p-4">
        <div className="flex flex-col gap-1 rounded-xl bg-container-low p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-on-surface-variant">{t("activeCity")}</span>
            <span className="rounded-full bg-primary-fixed px-1 py-0.5 text-micro font-bold uppercase text-on-primary-fixed">
              {t("unified")}
            </span>
          </div>
          <div className="text-sm font-semibold">{t("cityName")}</div>
          <div className="text-small text-on-surface-variant">{t("cityLines")}</div>
        </div>
      </div>
    </>
  );
}

function SearchBox() {
  const t = useT(M);
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
        placeholder={t("searchPh")}
        aria-label={t("search")}
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

/** Top-bar avatar: opens the Commuter Profile panel (also opened from elsewhere via openProfile()). */
function ProfileButton() {
  const t = useT(M);
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<ProfileSection>("top");
  const close = useCallback(() => setOpen(false), []);
  // Keep <html data-theme> in step with the saved choice (e.g. changed in another tab). Reads the
  // store directly: during hydration the hook still returns the server default.
  useEffect(() => { applyTheme(getProfile().appearance); }, [profile.appearance]);
  useEffect(() => {
    const onOpen = (e: Event) => { setSection((e as CustomEvent<ProfileSection>).detail ?? "top"); setOpen(true); };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  return (
    <>
      <button type="button" onClick={() => { setSection("top"); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open}
        aria-label={profile.signedIn ? t("profileOf", { name: profile.name }) : t("profileGuest")} title={t("yourProfile")}
        className={`flex h-9 w-9 items-center justify-center rounded-full bg-primary text-caption font-bold text-on-primary transition hover:ring-2 hover:ring-primary/30 ${open ? "ring-2 ring-primary ring-offset-2" : ""}`}>
        {profile.signedIn ? initials(profile.name) : <Icon name="person" className="text-[18px]" />}
      </button>
      <ProfilePanel open={open} section={section} onClose={close} />
    </>
  );
}

/** Whether pages show live backend data or the bundled sample (backend offline). */
/** Quick language switch in the top bar (the same choice as Profile → Language). */
function LanguageMenu() {
  const t = useT(M);
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const current = LANGS.find((l) => l.value === lang)!;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={t("changeLanguage")} title={t("changeLanguage")}
        className="flex h-9 items-center gap-1 rounded-lg bg-container px-2 text-xs font-semibold hover:bg-container-high">
        <Icon name="translate" className="text-[18px] text-primary" />
        <span lang={current.html}>{current.short}</span>
      </button>
      {open && (
        <div role="menu" aria-label={t("language")} className="absolute right-0 top-11 z-10 w-44 overflow-hidden rounded-xl bg-container-lowest p-1 shadow-float">
          {LANGS.map((l) => (
            <button key={l.value} type="button" role="menuitemradio" aria-checked={l.value === lang} lang={l.html}
              onClick={() => { setAppLanguage(l.value); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-small hover:bg-container-low ${l.value === lang ? "font-bold text-primary" : ""}`}>
              <span>{l.label} <span className="text-caption font-normal text-on-surface-variant">{l.value === "en" ? "" : l.english}</span></span>
              {l.value === lang && <Icon name="check" className="text-[18px]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedPill() {
  const t = useT(M);
  const live = useLiveEvents();
  const on = live?.source === "backend";
  return (
    <div className="flex items-center gap-1 rounded-lg bg-container-low px-2 py-1.5" title={on ? t("connected") : t("offlineTip")}>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-primary" : "bg-outline"}`} />
      <span className="hidden text-micro font-bold text-on-surface-variant sm:inline">{on ? t("liveData", { time: live?.asOf ?? "" }) : t("offline")}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT(M);
  const [open, setOpen] = useState(false);
  // Set the language for plain helpers (lib/format.ts) before any page below renders.
  setActiveLang(useLang());
  return (
    <div className="flex min-h-full">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 z-50 hidden h-screen w-72 shrink-0 flex-col justify-between overflow-y-auto bg-container-lowest shadow-xs lg:flex">
        <SidebarBody />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[1200] lg:hidden" role="dialog" aria-modal="true" aria-label={t("menu")}>
          <button className="absolute inset-0 bg-scrim" aria-label={t("closeMenu")} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between overflow-y-auto bg-container-lowest shadow-float">
            <button onClick={() => setOpen(false)} aria-label={t("closeMenu")} className="absolute right-3 top-4 rounded-lg p-1 hover:bg-container-low">
              <Icon name="close" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[1100] flex h-16 items-center justify-between gap-3 bg-container-lowest/90 px-4 shadow-xs backdrop-blur-xl md:px-6">
          <button onClick={() => setOpen(true)} aria-label={t("openMenu")} className="rounded-lg p-1.5 hover:bg-container-low lg:hidden">
            <Icon name="menu" />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden max-w-2xl flex-1 items-center gap-5 md:flex">
            <SearchBox />
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-1 rounded-lg bg-container px-4 py-1.5 xl:flex">
              <Icon name="location_city" className="text-[18px] text-primary" />
              <span className="text-xs font-semibold">{t("city")}</span>
            </span>
            <LiveClock className="hidden sm:inline-flex" />
            <LanguageMenu />
            <FeedPill />
            <ProfileButton />
          </div>
        </header>
        {children}
      </div>
      <ChatAssistant />
    </div>
  );
}
