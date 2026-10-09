"use client";

// Landing page (team design: stitch urban transit assistant — "Mumbai Moves" home page). It is the
// first screen at "/"; "Get started" / "Open app" lead into the app (/home). Everything uses the
// app's theme tokens, so it follows light / dark mode and the app language like every other screen.
// Numbers and statuses shown here are real: live problems and line status come from Pakka Check,
// the stats come from the evaluation (/compare). The design's NCMC / ticketing card is replaced by
// Day plan, since payments are not part of TravelBuddy.

import Link from "next/link";
import { useEffect } from "react";
import { setActiveLang, useLang, useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/Landing";
import { activeEvents, lineStatuses, TONE_CLASS } from "@/lib/network";
import { openProfile, setAppearance, useProfile } from "@/lib/profile";
import { applyTheme } from "@/lib/theme";
import { LiveEventsProvider, useLiveEvents } from "@/lib/useLiveEvents";
import { LanguageMenu, ProfileButton } from "./AppShell";
import Icon from "./Icon";
import MapView from "./MapView";

type Key = keyof typeof M.en;

const NAV: { href: string; label: Key }[] = [
  { href: "#top", label: "navHome" },
  { href: "#features", label: "navFeatures" },
  { href: "#how", label: "navHow" },
  { href: "#about", label: "navAbout" },
  { href: "#contact", label: "navContact" },
];

const FEATURES: { icon: string; tone: "primary" | "tertiary" | "secondary"; n: Key; t: Key; d: Key; a: Key; href: string }[] = [
  { icon: "alt_route", tone: "primary", n: "f1n", t: "f1t", d: "f1d", a: "f1a", href: "/plan" },
  { icon: "fmd_good", tone: "tertiary", n: "f2n", t: "f2t", d: "f2d", a: "f2a", href: "/track" },
  { icon: "accessible_forward", tone: "secondary", n: "f3n", t: "f3t", d: "f3d", a: "f3a", href: "/plan" },
  { icon: "tune", tone: "primary", n: "f4n", t: "f4t", d: "f4d", a: "f4a", href: "/plan" },
  { icon: "campaign", tone: "tertiary", n: "f5n", t: "f5t", d: "f5d", a: "f5a", href: "/report" },
  { icon: "event_note", tone: "secondary", n: "f6n", t: "f6t", d: "f6d", a: "f6a", href: "/itinerary" },
];

const TONE = {
  primary: { box: "bg-primary-soft text-primary-ink", text: "text-primary" },
  tertiary: { box: "bg-tertiary-fixed text-tertiary", text: "text-tertiary" },
  secondary: { box: "bg-secondary-container text-on-secondary-container", text: "text-secondary" },
} as const;

/** "Get started" style button: champagne gold in both themes, readable text on top. */
const goldBtn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-tertiary px-6 text-small font-semibold text-on-primary shadow-md transition hover:-translate-y-0.5 hover:shadow-lg";

export default function Landing() {
  return (
    <LiveEventsProvider>
      <Page />
    </LiveEventsProvider>
  );
}

function Page() {
  // Same as AppShell: plain helpers (lib/format.ts, lib/network.ts) read the active language.
  setActiveLang(useLang());
  const profile = useProfile();
  // Keep <html data-theme> in step with the saved choice (e.g. changed in another tab).
  useEffect(() => { applyTheme(profile.appearance); }, [profile.appearance]);
  return (
    <div id="top" className="min-h-screen bg-surface text-on-surface">
      <Header />
      <main>
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <About />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------------- header */

function Header() {
  const t = useT(M);
  const profile = useProfile();
  const dark = profile.appearance === "dark";
  return (
    <header className="sticky top-0 z-[1100] bg-container-lowest/90 shadow-xs backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
            <Icon name="route" className="text-[22px]" />
          </span>
          <span className="hidden flex-col min-[420px]:flex">
            <span className="text-lg font-bold leading-none tracking-tight text-primary">TravelBuddy</span>
            <span className="text-micro font-bold uppercase tracking-widest text-on-surface-variant">{t("tagline")}</span>
          </span>
        </Link>

        <nav aria-label={t("navHome")} className="hidden items-center gap-1 lg:flex">
          {NAV.map((n, i) => (
            <a key={n.href} href={n.href}
              className={`rounded-lg px-3 py-2 text-small font-semibold ${i === 0 ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-container-low hover:text-on-surface"}`}>
              {t(n.label)}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageMenu />
          <button type="button" onClick={() => setAppearance(dark ? "light" : "dark")}
            aria-label={dark ? t("themeToLight") : t("themeToDark")} title={dark ? t("themeToLight") : t("themeToDark")}
            className="grid h-10 w-10 place-items-center rounded-xl bg-container hover:bg-container-high">
            <Icon name={dark ? "light_mode" : "dark_mode"} className="text-[20px] text-primary" />
          </button>
          {!profile.signedIn && (
            <button type="button" onClick={() => openProfile("top")}
              className="hidden rounded-lg px-3 py-2 text-small font-semibold text-on-surface-variant hover:text-on-surface md:inline-flex">
              {t("signIn")}
            </button>
          )}
          <Link href="/home" className={`${goldBtn} hidden !min-h-10 !px-4 sm:inline-flex`}>{t("openApp")}</Link>
          <ProfileButton />
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- hero */

function Hero() {
  const t = useT(M);
  const live = useLiveEvents();
  const active = activeEvents(live?.events);
  const confirmed = active.filter((e) => e.status === "confirmed").length;
  const maybe = active.length - confirmed;
  const offline = live !== null && live.source !== "backend";

  const statusText = confirmed
    ? t(confirmed === 1 ? "nConfirmed" : "nConfirmedMany", { n: confirmed })
    : maybe ? t("nMaybe", { n: maybe }) : t("allClear");

  return (
    <section className="relative overflow-hidden py-8 lg:py-20">
      {/* soft background tint (very light, both themes) */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[56rem] max-w-[140%] -translate-x-1/2 rounded-full bg-primary-soft opacity-70 blur-3xl" aria-hidden />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full bg-primary-soft px-4 py-1.5 text-caption font-semibold text-primary-ink">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t("livePill")}
            <span className="opacity-40" aria-hidden>•</span>
            <span className="font-normal text-on-surface-variant">{t("livePill2")}</span>
          </span>
          <h1 className="text-[2rem] font-bold leading-tight tracking-tight sm:text-[2.5rem] lg:text-[3rem] lg:leading-[3.5rem]">
            {t("heroA")} <span className="text-primary">{t("heroB")}</span>
          </h1>
          <p className="max-w-2xl text-body leading-relaxed text-on-surface-variant sm:text-subtitle">{t("heroSub")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link href="/home" className={goldBtn}>{t("getStarted")} <Icon name="arrow_forward" className="text-[18px]" /></Link>
            <a href="#features" className="btn-secondary !min-h-12 !px-6">
              <Icon name="explore" className="text-[18px] text-primary" /> {t("seeFeatures")}
            </a>
          </div>
        </div>

        {/* Live network map instead of a stock photo */}
        <div className="relative">
          <div className="relative isolate h-[320px] overflow-hidden rounded-3xl bg-container shadow-lg sm:h-[420px] lg:h-[500px]">
            <div className="pointer-events-none absolute inset-0 [&_.leaflet-control-zoom]:hidden" aria-hidden>
              <MapView showNetwork events={active} />
            </div>
            <div className="absolute inset-x-0 bottom-0 z-[500] h-1/2 bg-gradient-to-t from-surface/85 to-transparent" aria-hidden />
            <div className="absolute inset-x-4 bottom-16 z-[510] hidden flex-wrap items-center justify-between gap-2 sm:flex md:bottom-20">
              <span className="inline-flex items-center gap-2 rounded-full bg-container-lowest/90 px-4 py-1.5 text-caption font-semibold shadow-sm backdrop-blur">
                <Icon name="train" className="text-[16px] text-primary" /> {t("mapLabel")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-container-lowest/90 px-4 py-1.5 text-caption font-semibold shadow-sm backdrop-blur">
                <span className={`h-2.5 w-2.5 rounded-full ${confirmed ? "bg-error" : maybe ? "bg-tertiary" : "bg-primary"}`} />
                {offline ? t("sampleData") : statusText}
              </span>
            </div>
          </div>

          {/* three cards over the bottom of the map */}
          <div className="relative z-10 -mt-12 grid grid-cols-1 gap-3 px-2 sm:-mt-14 md:grid-cols-3 md:gap-4">
            <Link href={`/plan?from=${encodeURIComponent("Andheri station")}&to=${encodeURIComponent("Jio World Centre, BKC")}`}
              className="card card-interactive flex flex-col gap-1.5 p-4">
              <span className="flex items-center justify-between">
                <span className="eyebrow">{t("tryRoute")}</span>
                <span className="chip bg-primary-soft text-primary-ink"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> {t("live")}</span>
              </span>
              <span className="flex items-center gap-1.5 pt-1 text-subtitle font-bold">
                Andheri <Icon name="arrow_forward" className="text-[18px] text-tertiary" /> BKC
              </span>
              <span className="text-small text-on-surface-variant">{t("tryRouteSub")}</span>
              <span className="text-caption text-outline">{t("tryRouteHint")}</span>
            </Link>
            <Link href="/plan" className="card card-interactive flex flex-col gap-1.5 p-4">
              <span className="flex items-center justify-between">
                <span className="eyebrow">{t("waysTitle")}</span>
                <span className="text-caption font-bold text-tertiary">{t("waysChip")}</span>
              </span>
              <span className="flex items-center gap-2 pt-1">
                {[["train", TONE.primary.box], ["subway", TONE.secondary.box], ["directions_bus", TONE.tertiary.box],
                  ["electric_rickshaw", "bg-container-high text-on-surface-variant"], ["local_taxi", "bg-container-high text-on-surface-variant"]].map(([icon, cls]) => (
                  <span key={icon} className={`grid h-9 w-9 place-items-center rounded-lg ${cls}`}><Icon name={icon} className="text-[20px]" /></span>
                ))}
              </span>
              <span className="truncate text-small text-on-surface-variant">{t("waysSub")}</span>
            </Link>
            <Link href="/home" className="card card-interactive flex flex-col gap-1.5 p-4">
              <span className="flex items-center justify-between">
                <span className="eyebrow">{t("liveTitle")}</span>
                <Icon name="verified_user" className="text-[18px] text-primary" />
              </span>
              <span className="pt-1 text-subtitle font-bold">{offline ? t("sampleData") : statusText}</span>
              <span className="text-small text-on-surface-variant">{t("liveChecked")}</span>
              <span className="flex items-center gap-1 text-caption font-semibold text-primary">{t("liveSeeAll")} <Icon name="arrow_forward" className="text-[14px]" /></span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- stats */

function Stats() {
  const t = useT(M);
  const items: { v: Key; l: Key; s: Key; cls: string; href: string }[] = [
    { v: "stat1", l: "stat1L", s: "stat1S", cls: "text-primary", href: "/compare" },
    { v: "stat2", l: "stat2L", s: "stat2S", cls: "text-tertiary", href: "/compare" },
    { v: "stat3", l: "stat3L", s: "stat3S", cls: "text-secondary", href: "#about" },
    { v: "stat4", l: "stat4L", s: "stat4S", cls: "text-on-surface", href: "#about" },
  ];
  return (
    <section className="bg-container-low py-8">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 md:grid-cols-4 md:px-6">
        {items.map((x) => (
          <a key={x.v} href={x.href} className="flex flex-col gap-1 rounded-xl p-2 text-center hover:bg-container md:text-left">
            <span className={`text-title font-bold tracking-tight sm:text-display ${x.cls}`}>{t(x.v)}</span>
            <span className="text-small font-semibold">{t(x.l)}</span>
            <span className="text-caption text-on-surface-variant">{t(x.s)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- features */

function SectionHead({ kicker, title, sub, kickerCls = "text-primary" }: { kicker: string; title: string; sub: string; kickerCls?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
      <span className={`text-micro font-bold uppercase tracking-widest ${kickerCls}`}>{kicker}</span>
      <h2 className="text-title font-bold sm:text-display">{title}</h2>
      <p className="text-body text-on-surface-variant">{sub}</p>
    </div>
  );
}

function Features() {
  const t = useT(M);
  return (
    <section id="features" className="scroll-mt-20 py-12 lg:py-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-6">
        <SectionHead kicker={t("featKicker")} title={t("featTitle")} sub={t("featSub")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {FEATURES.map((f) => (
            <Link key={f.n} href={f.href} className="card card-interactive group flex flex-col gap-4 p-6">
              <span className={`grid h-12 w-12 place-items-center rounded-xl transition-transform group-hover:scale-110 motion-reduce:transform-none ${TONE[f.tone].box}`}>
                <Icon name={f.icon} className="text-[26px]" />
              </span>
              <span className="flex flex-col gap-1.5">
                <span className={`text-micro font-bold uppercase tracking-wide ${TONE[f.tone].text}`}>{t(f.n)}</span>
                <span className="text-subtitle font-bold">{t(f.t)}</span>
                <span className="text-body leading-relaxed text-on-surface-variant">{t(f.d)}</span>
              </span>
              <span className={`mt-auto flex items-center gap-1 text-small font-semibold ${TONE[f.tone].text}`}>
                {t(f.a)} <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- how it works */

function HowItWorks() {
  const t = useT(M);
  return (
    <section id="how" className="scroll-mt-20 bg-container-low py-12 lg:py-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-6">
        <SectionHead kicker={t("howKicker")} title={t("howTitle")} sub={t("howSub")} kickerCls="text-tertiary" />
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
          <Step n={1} icon="search" cls={TONE.primary.box} title={t("s1t")} text={t("s1d")}>
            <span className="flex items-center gap-2 rounded-lg bg-container-low px-3 py-2 text-small">
              <span className="h-2 w-2 rounded-full bg-primary" /> {t("s1ex")}
            </span>
          </Step>
          <Step n={2} icon="compare_arrows" cls={TONE.tertiary.box} title={t("s2t")} text={t("s2d")}>
            <span className="flex flex-wrap gap-2">
              <span className="chip bg-container text-on-surface-variant">{t("s2ex1")}</span>
              <span className="chip bg-container text-on-surface-variant">{t("s2ex2")}</span>
            </span>
          </Step>
          <Step n={3} icon="navigation" cls={TONE.secondary.box} title={t("s3t")} text={t("s3d")}>
            <span className="flex items-center gap-1.5 text-small font-semibold text-primary">
              <Icon name="verified" className="text-[18px]" /> {t("s3ex")}
            </span>
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({ n, icon, cls, title, text, children }: { n: number; icon: string; cls: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <li className="card flex flex-col gap-4 p-6">
      <span className="flex items-center justify-between">
        <span className={`grid h-12 w-12 place-items-center rounded-full text-subtitle font-bold ${cls}`}>{n}</span>
        <Icon name={icon} className="text-[28px] text-outline-variant" />
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="text-subtitle font-bold">{title}</span>
        <span className="text-body text-on-surface-variant">{text}</span>
      </span>
      <span className="pt-1">{children}</span>
    </li>
  );
}

/* ---------------------------------------------------------------- about + live lines */

function About() {
  const t = useT(M);
  const live = useLiveEvents();
  const rows = lineStatuses(live?.events ?? []).slice(0, 4);
  const anyProblem = rows.some((r) => r.tone !== "ok");
  const points: { icon: string; cls: string; t: Key; d: Key }[] = [
    { icon: "translate", cls: "text-primary", t: "a1t", d: "a1d" },
    { icon: "verified_user", cls: "text-tertiary", t: "a2t", d: "a2d" },
    { icon: "dark_mode", cls: "text-secondary", t: "a3t", d: "a3d" },
    { icon: "lock", cls: "text-primary", t: "a4t", d: "a4d" },
  ];
  return (
    <section id="about" className="scroll-mt-20 py-12 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex flex-col items-center gap-8 rounded-3xl bg-container p-6 shadow-sm lg:flex-row lg:p-14">
          <div className="flex flex-1 flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-4 py-1.5 text-caption font-semibold text-primary-ink">
              <Icon name="favorite" className="text-[16px]" /> {t("aboutPill")}
            </span>
            <h2 className="text-title font-bold sm:text-display">{t("aboutTitle")}</h2>
            <p className="text-body leading-relaxed text-on-surface-variant sm:text-subtitle">{t("aboutText")}</p>
            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              {points.map((p) => (
                <div key={p.t} className="flex items-start gap-3">
                  <Icon name={p.icon} className={`shrink-0 text-[22px] ${p.cls}`} />
                  <span>
                    <span className="block text-small font-bold">{t(p.t)}</span>
                    <span className="text-small text-on-surface-variant">{t(p.d)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card flex w-full shrink-0 flex-col gap-3 p-5 lg:w-96">
            <div className="flex items-center justify-between">
              <span className="eyebrow !text-on-surface">{t("healthTitle")}</span>
              <span className={`chip ${anyProblem ? TONE_CLASS.warn : TONE_CLASS.ok}`}>{anyProblem ? t("healthSome") : t("healthAll")}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.line_id} className="flex items-center justify-between gap-3 rounded-xl bg-container-low p-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md px-1 text-micro font-bold text-white" style={{ background: r.color }}>{r.code.split(" ")[0]}</span>
                    <span className="truncate text-small font-semibold">{r.name}</span>
                  </span>
                  <span className={`chip shrink-0 ${TONE_CLASS[r.tone]}`}>{r.label}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-1 text-caption text-on-surface-variant">
              <span>{live?.asOf ? t("healthUpdated", { time: live.asOf }) : ""}</span>
              <Link href="/home" className="font-semibold text-primary hover:underline">{t("healthSeeAll")}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- call to action */

function Cta() {
  const t = useT(M);
  return (
    <section className="pb-12 lg:pb-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-12 text-center text-on-primary shadow-lg lg:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-on-primary/10 px-4 py-1.5 text-caption font-semibold">
            <Icon name="bolt" className="text-[16px]" /> {t("ctaPill")}
          </span>
          <h2 className="max-w-2xl text-title font-bold sm:text-display lg:text-[2.5rem] lg:leading-[3rem]">{t("ctaTitle")}</h2>
          <p className="max-w-xl text-body opacity-85 sm:text-subtitle">{t("ctaSub")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/home" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-on-primary px-6 text-small font-semibold text-primary shadow-md transition hover:-translate-y-0.5">
              {t("getStarted")} <Icon name="arrow_forward" className="text-[18px]" />
            </Link>
            <Link href="/plan" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-small font-semibold ring-1 ring-on-primary/40 transition hover:bg-on-primary/10">
              <Icon name="route" className="text-[18px]" /> {t("ctaPlan")}
            </Link>
          </div>
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3 text-caption opacity-85">
            {(["ctaC1", "ctaC2", "ctaC3"] as Key[]).map((k) => (
              <li key={k} className="flex items-center gap-1"><Icon name="check_circle" className="text-[16px]" /> {t(k)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- footer */

function Footer() {
  const t = useT(M);
  const cols: { title: Key; links: { label: Key; href: string }[] }[] = [
    { title: "footApp", links: [{ label: "fHome", href: "/home" }, { label: "fPlan", href: "/plan" }, { label: "fLive", href: "/track" }, { label: "fDay", href: "/itinerary" }] },
    { title: "footHelp", links: [{ label: "fSos", href: "tel:112" }, { label: "fWomen", href: "tel:1091" }, { label: "fRail", href: "tel:139" }, { label: "fReport", href: "/report" }] },
    { title: "footMore", links: [{ label: "fHow", href: "/transparency" }, { label: "fCompare", href: "/compare" }, { label: "fStations", href: "/stations" }] },
  ];
  return (
    <footer id="contact" className="scroll-mt-20 bg-inverse-surface pb-6 pt-10 text-inverse-on-surface">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="grid grid-cols-1 gap-8 pb-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-3 lg:col-span-2">
            <span className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-on-primary"><Icon name="route" className="text-[20px]" /></span>
              <span className="text-subtitle font-bold">TravelBuddy</span>
            </span>
            <p className="max-w-md text-small opacity-80">{t("footText")}</p>
          </div>
          {cols.map((c) => (
            <div key={c.title} className="flex flex-col gap-2">
              <h3 className="text-small font-semibold uppercase tracking-wide !text-inverse-on-surface">{t(c.title)}</h3>
              <ul className="flex flex-col gap-1.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("tel:")
                      ? <a href={l.href} className="text-small opacity-80 hover:underline hover:opacity-100">{t(l.label)}</a>
                      : <Link href={l.href} className="text-small opacity-80 hover:underline hover:opacity-100">{t(l.label)}</Link>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-2 border-t border-inverse-on-surface/15 pt-5 text-caption opacity-75 sm:flex-row">
          <span className="flex items-center gap-1.5"><Icon name="location_city" className="text-[18px]" /> {t("copyright")}</span>
          <span>{t("madeFor")}</span>
        </div>
      </div>
    </footer>
  );
}
