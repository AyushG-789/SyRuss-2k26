"use client";

// Commuter Profile — slide-over from the top-bar avatar (team design: stitch urban transit
// assistant, "Commuter Profile"). Everything here works: personal details and saved places are
// editable, mobility preferences become the Journey Planner defaults, activity counts come from
// what this browser actually did (trips planned / started, reports sent and how many Pakka Check
// now confirms), SOS rows are real phone links and "Share live trip" shares the trip in progress.
// The design's NCMC card / top-up / passes / fare disputes are left out: payments are outside PS5.

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MODE_LABEL } from "@/lib/format";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import {
  clearDeviceData, initials, setAppearance, type Language, LANGUAGE_NAMES, type Priority, type Profile, type ProfileSection,
  signIn, signOut, updateProfile, useProfile,
} from "@/lib/profile";
import { loadTrip } from "@/lib/savedTrip";
import type { Mode } from "@/lib/types";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";

const MODE_CHIPS: { label: string; icon: string; modes: Mode[] }[] = [
  { label: "Metro", icon: "subway", modes: ["metro"] },
  { label: "Local Train", icon: "train", modes: ["local"] },
  { label: "Bus", icon: "directions_bus", modes: ["bus"] },
  { label: "Auto", icon: "electric_rickshaw", modes: ["auto"] },
  { label: "Cab", icon: "local_taxi", modes: ["taxi", "cab"] },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "fastest", label: "Fastest" },
  { value: "cheapest", label: "Lowest Fare" },
  { value: "fewest_transfers", label: "Fewer Transfers" },
];

const THEMES = [
  { value: "light", label: "Light mode", icon: "light_mode", swatch: { bg: "#f4f2e9", card: "#ffffff", text: "#202923", muted: "#737d73", brand: "#24483a" } },
  { value: "dark", label: "Dark mode", icon: "dark_mode", swatch: { bg: "#101d19", card: "#1d3028", text: "#f2f0e7", muted: "#a4b2a8", brand: "#d9b982" } },
] as const;

const TERRITORIES = ["Mumbai Region (MMR)", "Mumbai City", "Mumbai Suburban", "Thane", "Navi Mumbai"];

const SOS: { href: string; icon: string; title: string; sub: string }[] = [
  { href: "tel:112", icon: "sos", title: "112", sub: "Emergency · 24x7" },
  { href: "tel:1091", icon: "woman", title: "1091", sub: "Women helpline" },
  { href: "tel:1512", icon: "shield", title: "1512", sub: "GRP Railway Police" },
];

const noop = () => () => undefined;

export default function ProfilePanel(props: { open: boolean; section: ProfileSection; onClose: () => void }) {
  // Rendered into <body>: the top bar's backdrop blur would otherwise clip a fixed panel to its height.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(<Panel {...props} />, document.body) : null;
}

function Panel({ open, section, onClose }: { open: boolean; section: ProfileSection; onClose: () => void }) {
  const profile = useProfile();
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);

  // Escape closes; focus moves into the panel; the page behind doesn't scroll; jump to a section.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const target = section === "top" ? null : scrollRef.current?.querySelector(`[data-section="${section}"]`);
    if (target) target.scrollIntoView({ block: "start" });
    else scrollRef.current?.scrollTo({ top: 0 });
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, section, onClose]);

  function manage() {
    setEditing(true);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className={`fixed inset-0 z-[1300] ${open ? "" : "pointer-events-none"}`} inert={!open}>
      <button type="button" aria-label="Close profile" tabIndex={-1} onClick={onClose}
        className={`absolute inset-0 bg-scrim transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside role="dialog" aria-modal="true" aria-labelledby="profile-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-surface shadow-float transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="border-b border-hairline bg-container-lowest px-5 pb-5 pt-4">
          <div className="flex items-center justify-between">
            <h2 id="profile-title" className="eyebrow flex items-center gap-2 !text-small !tracking-[0.08em] text-on-surface">
              <Icon name="account_circle" className="text-[20px] text-primary" /> Commuter Profile
            </h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close profile" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-container-low">
              <Icon name="close" />
            </button>
          </div>
          <div className="mt-4 flex items-start gap-4">
            <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-subtitle font-bold text-on-primary">
              {profile.signedIn ? initials(profile.name) : <Icon name="person" />}
              {profile.signedIn && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-container-lowest bg-primary-fixed-dim" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-subtitle font-bold">{profile.name}</p>
                {profile.signedIn
                  ? <span className="chip bg-primary-soft text-primary-ink"><Icon name="verified" className="text-[14px]" /> Verified Commuter</span>
                  : <span className="chip bg-container text-on-surface-variant">Guest</span>}
              </div>
              {profile.email && <p className="truncate text-small text-on-surface-variant">{profile.email}</p>}
              <p className="mt-0.5 flex items-center gap-1 text-caption text-on-surface-variant">
                <Icon name="calendar_today" className="text-[14px]" />
                {profile.signedIn ? `Mumbai commuter since ${profile.memberSince}` : "Not signed in · preferences still saved here"}
              </p>
            </div>
            {profile.signedIn && !editing && (
              <button type="button" onClick={() => setEditing(true)} className="btn-secondary !min-h-9 !px-3">
                <Icon name="edit" className="text-[16px]" /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {profile.signedIn
            ? <PersonalInfo profile={profile} editing={editing} setEditing={setEditing} />
            : <GuestCard />}
          <Preferences profile={profile} onPlan={onClose} />
          <SavedPlaces profile={profile} onGo={onClose} />
          <Activity profile={profile} onNavigate={onClose} />
          <Safety />
          <AppSupport profile={profile} onNavigate={onClose} />
          <p className="pb-2 text-center text-caption text-on-surface-variant">
            <Icon name="lock" className="mr-1 align-[-3px] text-[14px]" />
            Your profile is saved only in this browser — nothing is sent to a server.
          </p>
        </div>

        {/* Footer */}
        <Footer signedIn={profile.signedIn} onManage={manage} />
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- building blocks */

function Section({ icon, title, action, id, children }: {
  icon: string; title: string; action?: React.ReactNode; id?: ProfileSection; children: React.ReactNode;
}) {
  return (
    <section data-section={id} className="scroll-mt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="eyebrow flex items-center gap-2 !text-caption text-on-surface">
          <Icon name={icon} className="text-[18px] text-primary" /> {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label, sub, icon, disabled = false }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sub: string; icon: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="card flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60">
      <Icon name={icon} className={checked ? "text-primary" : "text-on-surface-variant"} />
      <span className="min-w-0 flex-1">
        <span className="block text-small font-semibold">{label}</span>
        <span className="block text-caption text-on-surface-variant">{sub}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-outline-variant"}`} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-container-lowest shadow-sm transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

const inputCls = "h-11 w-full rounded-xl border border-hairline bg-container-lowest px-3 text-small outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

/* ---------------------------------------------------------------- personal information */

function PersonalInfo({ profile, editing, setEditing }: { profile: Profile; editing: boolean; setEditing: (v: boolean) => void }) {
  return (
    <Section icon="badge" title="Personal Information"
      action={!editing && <button type="button" onClick={() => setEditing(true)} className="text-small font-semibold text-primary hover:underline">Edit</button>}>
      {editing
        ? <PersonalForm key="form" profile={profile} onDone={() => setEditing(false)} />
        : (
          <dl className="card divide-y divide-hairline-soft px-4">
            {[
              ["Full Name", profile.name],
              ["Email", profile.email || "—"],
              ["Mobile Phone", maskPhone(profile.phone)],
              ["Languages", profile.languages.map((l) => LANGUAGE_NAMES[l]).join(" & ") || "—"],
              ["Home Territory", profile.territory],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3">
                <dt className="text-small text-on-surface-variant">{k}</dt>
                <dd className="min-w-0 truncate text-right text-small font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
    </Section>
  );
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return phone || "—";
  const local = digits.slice(-10);
  return `+91 ${local.slice(0, 5)} •••••`;
}

function PersonalForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const id = useId();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [languages, setLanguages] = useState<Language[]>(profile.languages);
  const [territory, setTerritory] = useState(profile.territory);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Please enter your name.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "That email doesn't look right.";
    const digits = phone.replace(/\D/g, "");
    if (phone.trim() && !(digits.length === 10 || (digits.length === 12 && digits.startsWith("91")))) errs.phone = "Use a 10-digit Indian mobile number.";
    if (!languages.length) errs.languages = "Pick at least one language.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const local = digits.slice(-10);
    updateProfile({
      name: name.trim().replace(/\s+/g, " "),
      email: email.trim(),
      phone: local ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : "",
      languages, territory,
    });
    onDone();
  }

  const err = (k: string) => errors[k] && <p id={`${id}-${k}-err`} className="mt-1 text-caption text-error">{errors[k]}</p>;

  return (
    <form onSubmit={save} noValidate className="card space-y-3 p-4">
      <label className="block">
        <span className="mb-1 block text-caption font-semibold text-on-surface-variant">Full Name</span>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
          aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${id}-name-err` : undefined} />
        {err("name")}
      </label>
      <label className="block">
        <span className="mb-1 block text-caption font-semibold text-on-surface-variant">Email</span>
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-err` : undefined} />
        {err("email")}
      </label>
      <label className="block">
        <span className="mb-1 block text-caption font-semibold text-on-surface-variant">Mobile Phone</span>
        <input className={inputCls} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98201 23456" autoComplete="tel"
          aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? `${id}-phone-err` : undefined} />
        {err("phone")}
      </label>
      <fieldset>
        <legend className="mb-1 text-caption font-semibold text-on-surface-variant">Languages</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LANGUAGE_NAMES) as Language[]).map((l) => {
            const on = languages.includes(l);
            return (
              <button key={l} type="button" aria-pressed={on}
                onClick={() => setLanguages(on ? languages.filter((x) => x !== l) : [...languages, l])}
                className={`rounded-full px-3 py-1.5 text-small font-semibold ${on ? "bg-primary text-on-primary" : "bg-container-lowest text-on-surface-variant ring-1 ring-hairline hover:bg-container-low"}`}>
                {LANGUAGE_NAMES[l]}
              </button>
            );
          })}
        </div>
        {err("languages")}
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-caption font-semibold text-on-surface-variant">Home Territory</span>
        <select className={inputCls} value={territory} onChange={(e) => setTerritory(e.target.value)}>
          {TERRITORIES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className="btn-secondary">Cancel</button>
        <button type="submit" className="btn-primary"><Icon name="check" className="text-[18px]" /> Save changes</button>
      </div>
    </form>
  );
}

function GuestCard() {
  return (
    <div className="card flex items-center gap-3 p-4">
      <Icon name="person_off" className="text-on-surface-variant" />
      <p className="flex-1 text-small text-on-surface-variant">You&apos;re browsing as a guest. Sign in to keep your name, contacts and saved places.</p>
      <button type="button" onClick={signIn} className="btn-primary !min-h-9">Sign in</button>
    </div>
  );
}

/* ---------------------------------------------------------------- preferences */

function Preferences({ profile, onPlan }: { profile: Profile; onPlan: () => void }) {
  const [saved, setSaved] = useState(false);
  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1500); };

  function toggleMode(chip: (typeof MODE_CHIPS)[number]) {
    const on = chip.modes.every((m) => profile.modes.includes(m));
    const next = on ? profile.modes.filter((m) => !chip.modes.includes(m)) : [...new Set([...profile.modes, ...chip.modes])];
    if (!next.length) return; // keep at least one vehicle
    updateProfile({ modes: next });
    flash();
  }

  return (
    <Section icon="tune" title="Mobility Preferences"
      action={<span className="chip bg-primary-soft text-primary-ink" aria-live="polite">{saved ? "Saved ✓" : "Personalized"}</span>}>
      <p className="mb-2 text-small font-semibold">Preferred Modes</p>
      <div className="flex flex-wrap gap-2">
        {MODE_CHIPS.map((c) => {
          const on = c.modes.every((m) => profile.modes.includes(m));
          const last = on && profile.modes.length === c.modes.length;
          return (
            <button key={c.label} type="button" aria-pressed={on} onClick={() => toggleMode(c)}
              title={last ? "Keep at least one vehicle" : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-small font-semibold ${on ? "bg-primary text-on-primary" : "bg-container-lowest text-on-surface-variant ring-1 ring-hairline hover:bg-container-low"}`}>
              <Icon name={c.icon} className="text-[16px]" /> {c.label}
            </button>
          );
        })}
        <span className="flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-small font-semibold text-primary-ink" title="Walking links every trip, so it's always on">
          <Icon name="directions_walk" className="text-[16px]" /> Walking · always
        </span>
      </div>

      <p className="mb-2 mt-4 text-small font-semibold">Routing Priority</p>
      <div role="radiogroup" aria-label="Routing priority" className="grid grid-cols-3 gap-1 rounded-xl bg-container p-1">
        {PRIORITIES.map((p) => {
          const on = profile.priority === p.value;
          return (
            <button key={p.value} type="button" role="radio" aria-checked={on}
              onClick={() => { updateProfile({ priority: p.value }); flash(); }}
              className={`rounded-lg px-2 py-2 text-small ${on ? "bg-container-lowest font-semibold text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <Toggle icon="accessible" label="Step-free routing" sub="Wheelchair, lift & ramp priority"
          checked={profile.stepFree} onChange={(v) => { updateProfile({ stepFree: v }); flash(); }} />
        <Toggle icon="notifications_active" label="Delay & Disruption SMS"
          sub={profile.phone ? `Pakka Check-confirmed alerts to ${maskPhone(profile.phone)}` : "Add a mobile number to get SMS"}
          disabled={!profile.phone} checked={profile.smsAlerts && Boolean(profile.phone)}
          onChange={(v) => { updateProfile({ smsAlerts: v }); flash(); }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2">
        <p className="text-caption text-primary-ink">The Journey Planner starts with these choices.</p>
        <Link href="/plan" onClick={onPlan} className="flex items-center gap-1 text-caption font-bold text-primary hover:underline">
          Plan a trip <Icon name="arrow_forward" className="text-[14px]" />
        </Link>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- saved places */

function SavedPlaces({ profile, onGo }: { profile: Profile; onGo: () => void }) {
  const listId = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function save(placeId: string) {
    const match = draft.trim() ? findPlace(draft) : undefined;
    if (draft.trim() && !match) { setError("Pick a station or place from the list."); return; }
    updateProfile((p) => ({ places: p.places.map((x) => (x.id === placeId ? { ...x, place: match?.label ?? "" } : x)) }));
    setEditing(null);
    setError("");
  }

  return (
    <Section id="places" icon="bookmark" title="Saved Places">
      <datalist id={listId}>{PLACE_OPTIONS.map((p) => <option key={p.label} value={p.label} />)}</datalist>
      <div className="space-y-2">
        {profile.places.map((p) => (
          <div key={p.id} className="card p-3">
            {editing === p.id ? (
              <form onSubmit={(e) => { e.preventDefault(); save(p.id); }} className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-caption font-semibold text-on-surface-variant">{p.title}</span>
                  <input autoFocus list={listId} className={inputCls} value={draft} placeholder="Type a station or place"
                    onChange={(e) => { setDraft(e.target.value); setError(""); }} aria-invalid={Boolean(error)} />
                </label>
                {error && <p className="text-caption text-error">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditing(null); setError(""); }} className="btn-secondary !min-h-9">Cancel</button>
                  <button type="submit" className="btn-primary !min-h-9">Save</button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-container">
                  <Icon name={p.id === "home" ? "home" : "work"} className="text-on-surface-variant" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">{p.title}</span>
                  <span className="block truncate text-caption text-on-surface-variant">{p.place || "Not set"}</span>
                </span>
                <button type="button" onClick={() => { setEditing(p.id); setDraft(p.place); }} aria-label={`Edit ${p.title}`}
                  className="rounded-lg p-2 text-on-surface-variant hover:bg-container-low"><Icon name="edit" className="text-[18px]" /></button>
                {p.place && (
                  <Link href={`/plan?to=${encodeURIComponent(p.place)}`} onClick={onGo} className="btn-ghost !min-h-9 !px-3">
                    Go <Icon name="arrow_forward" className="text-[16px]" />
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- activity */

function Activity({ profile, onNavigate }: { profile: Profile; onNavigate: () => void }) {
  const live = useLiveEvents();
  const [ledger, setLedger] = useState(false);
  const verified = useMemo(() => {
    const confirmed = new Set((live?.events ?? []).filter((e) => e.status === "confirmed").map((e) => e.event_id));
    return profile.stats.reportIds.filter((id) => confirmed.has(id)).length;
  }, [live, profile.stats.reportIds]);
  const placesSet = profile.places.filter((p) => p.place).length;

  const tiles: { n: number; label: string; href?: string; onClick?: () => void; extra?: string }[] = [
    { n: profile.stats.planned, label: "Journeys Planned", onClick: () => setLedger(true) },
    { n: placesSet, label: "Saved Places", onClick: () => document.querySelector('[data-section="places"]')?.scrollIntoView({ behavior: "smooth" }) },
    { n: profile.stats.started, label: "Trips Tracked", href: "/track" },
    { n: profile.stats.reportIds.length, label: "Reported Issues", href: "/report", extra: profile.stats.reportIds.length ? `${verified} Verified` : undefined },
  ];

  return (
    <Section id="activity" icon="monitoring" title="Mobility Activity"
      action={
        <button type="button" onClick={() => setLedger(!ledger)} aria-expanded={ledger} className="flex items-center text-small font-semibold text-primary hover:underline">
          {ledger ? "Hide ledger" : "Full Ledger"} <Icon name={ledger ? "expand_less" : "chevron_right"} className="text-[18px]" />
        </button>
      }>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="flex items-start justify-between gap-1">
                <span className="text-title font-bold tabular-nums">{t.n}</span>
                {t.extra && <span className="text-micro font-bold text-primary">{t.extra}</span>}
              </span>
              <span className="text-caption text-on-surface-variant">{t.label}</span>
            </>
          );
          const cls = "card card-interactive flex flex-col gap-0.5 p-3 text-left";
          return t.href
            ? <Link key={t.label} href={t.href} onClick={onNavigate} className={cls}>{body}</Link>
            : <button key={t.label} type="button" onClick={t.onClick} className={cls}>{body}</button>;
        })}
      </div>

      {ledger && (
        <div className="card mt-2 p-2">
          {profile.activity.length === 0 ? (
            <p className="p-3 text-small text-on-surface-variant">
              Nothing yet. Plan a route, start a trip or send a report and it will show up here.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-hairline-soft">
                {profile.activity.map((a, i) => (
                  <li key={`${a.at}-${i}`}>
                    <Link href={a.href ?? "/"} onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-container-low">
                      <Icon name={a.kind === "planned" ? "alt_route" : a.kind === "started" ? "fmd_good" : "campaign"}
                        className={a.kind === "reported" ? "text-tertiary" : "text-primary"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold">{a.text}</span>
                        <span className="block text-caption text-on-surface-variant">{timeAgo(a.at)}</span>
                      </span>
                      <Icon name="chevron_right" className="text-[18px] text-outline" />
                    </Link>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => updateProfile({ activity: [] })} className="btn-ghost mt-1 w-full !min-h-9 text-on-surface-variant">
                Clear history
              </button>
            </>
          )}
        </div>
      )}
    </Section>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ---------------------------------------------------------------- safety */

function Safety() {
  const [status, setStatus] = useState<string | null>(null);

  async function shareTrip() {
    const trip = loadTrip();
    if (!trip) { setStatus("No trip in progress — start one from Route Results first."); return; }
    const to = trip.destination?.label ?? trip.traveller.destination?.label ?? "my destination";
    const legs = trip.card.legs.filter((l) => l.mode !== "walk").map((l) => MODE_LABEL[l.mode]).join(" → ") || "walking";
    const eta = trip.card.legs.at(-1)?.arrive ?? "";
    const text = `I'm travelling ${trip.traveller.origin.label} → ${to} by ${legs}${eta ? `, arriving about ${eta}` : ""}. (TravelBuddy)`;
    const url = `${window.location.origin}/track`;
    try {
      if (navigator.share) { await navigator.share({ title: "My live trip", text, url }); setStatus("Shared."); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setStatus("Trip details copied — paste them to someone you trust.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setStatus("Couldn't share from this browser.");
    }
  }

  return (
    <Section icon="sos" title="Emergency & Women Safety">
      <div className="grid grid-cols-3 gap-2">
        {SOS.map((s, i) => (
          <a key={s.href} href={s.href}
            className={`card card-interactive flex flex-col items-center gap-1 px-2 py-3 text-center ${i === 0 ? "!bg-error-container" : ""}`}>
            <Icon name={s.icon} className={i === 0 ? "text-error" : "text-primary"} />
            <span className={`text-subtitle font-bold ${i === 0 ? "text-on-error-container" : ""}`}>{s.title}</span>
            <span className="text-micro text-on-surface-variant">{s.sub}</span>
          </a>
        ))}
      </div>
      <button type="button" onClick={shareTrip} className="btn-secondary mt-2 w-full">
        <Icon name="share_location" className="text-[18px] text-primary" /> Share Live Trip &amp; Safety Beacon
      </button>
      {status && <p className="mt-2 text-caption text-on-surface-variant" role="status">{status}</p>}
    </Section>
  );
}

/* ---------------------------------------------------------------- app & support */

function AppSupport({ profile, onNavigate }: { profile: Profile; onNavigate: () => void }) {
  const [privacy, setPrivacy] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const row = "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-container-low";

  return (
    <Section icon="settings" title="App & Support">
      <div className="card divide-y divide-hairline-soft overflow-hidden">
        <button type="button" onClick={() => setAppearanceOpen(!appearanceOpen)} aria-expanded={appearanceOpen} className={row}>
          <Icon name="palette" className="text-on-surface-variant" />
          <span className="flex-1 text-small font-semibold">Appearance</span>
          <span className="text-caption text-on-surface-variant">{profile.appearance === "dark" ? "Dark" : "Light"}</span>
          <Icon name={appearanceOpen ? "expand_less" : "chevron_right"} className="text-outline" />
        </button>
        {appearanceOpen && (
          <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-2 gap-2 bg-container-low/60 p-3">
            {THEMES.map((t) => {
              const on = profile.appearance === t.value;
              return (
                <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => setAppearance(t.value)}
                  className={`flex flex-col gap-2 rounded-xl bg-container-lowest p-2 text-left ring-2 ${on ? "ring-primary" : "ring-transparent shadow-sm hover:ring-hairline"}`}>
                  {/* mini preview of the theme */}
                  <span className="flex h-16 gap-1.5 overflow-hidden rounded-lg p-1.5" style={{ background: t.swatch.bg }} aria-hidden>
                    <span className="w-1/3 rounded-md" style={{ background: t.swatch.card }} />
                    <span className="flex flex-1 flex-col gap-1 rounded-md p-1.5" style={{ background: t.swatch.card }}>
                      <span className="h-1.5 w-3/4 rounded-full" style={{ background: t.swatch.text }} />
                      <span className="h-1.5 w-1/2 rounded-full" style={{ background: t.swatch.muted }} />
                      <span className="mt-auto h-3 w-1/2 rounded" style={{ background: t.swatch.brand }} />
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 px-1 text-small font-semibold">
                    <Icon name={t.icon} className={`text-[18px] ${on ? "text-primary" : "text-on-surface-variant"}`} />
                    {t.label}
                    {on && <Icon name="check_circle" fill className="ml-auto text-[18px] text-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button type="button" onClick={() => setPrivacy(!privacy)} aria-expanded={privacy} className={row}>
          <Icon name="lock" className="text-on-surface-variant" />
          <span className="flex-1 text-small font-semibold">Privacy &amp; Data</span>
          <Icon name={privacy ? "expand_less" : "chevron_right"} className="text-outline" />
        </button>
        {privacy && (
          <div className="space-y-2 bg-container-low/60 p-3">
            <Toggle icon="history" label="Remember my trip history" sub="Keeps the activity ledger on this device"
              checked={profile.privacy.rememberTrips}
              onChange={(v) => updateProfile((p) => ({ privacy: { ...p.privacy, rememberTrips: v } }))} />
            <p className="px-1 text-caption text-on-surface-variant">
              Reports are anonymous: Pakka Check only sees a random reporter id, never your name or number.
            </p>
            {confirmClear ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-error-container p-3">
                <p className="flex-1 text-caption text-on-error-container">Erase profile, saved trip and reporter id from this browser?</p>
                <button type="button" onClick={() => setConfirmClear(false)} className="btn-secondary !min-h-9">Keep</button>
                <button type="button" onClick={() => { clearDeviceData(); setConfirmClear(false); setCleared(true); }}
                  className="btn-primary !min-h-9 !bg-error">Erase</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setConfirmClear(true); setCleared(false); }} className="btn-secondary w-full !text-error">
                <Icon name="delete" className="text-[18px]" /> Clear my data on this device
              </button>
            )}
            {cleared && <p className="text-caption text-primary" role="status">Done — this browser now holds only the default profile.</p>}
          </div>
        )}

        <a href="tel:139" className={row}>
          <Icon name="support_agent" className="text-on-surface-variant" />
          <span className="flex-1">
            <span className="block text-small font-semibold">Railway Helpline (139)</span>
            <span className="block text-caption text-on-surface-variant">Train enquiry, complaints, security</span>
          </span>
          <Icon name="call" className="text-outline" />
        </a>
        <Link href="/transparency" onClick={onNavigate} className={row}>
          <Icon name="gavel" className="text-on-surface-variant" />
          <span className="flex-1 text-small font-semibold">How Pakka Check decides (Transparency)</span>
          <Icon name="chevron_right" className="text-outline" />
        </Link>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- footer */

function Footer({ signedIn, onManage }: { signedIn: boolean; onManage: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="border-t border-hairline bg-container-lowest px-5 py-3 shadow-sheet">
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-small">Sign out? Your preferences stay; personal details are removed.</p>
          <button type="button" onClick={() => setConfirm(false)} className="btn-secondary">Cancel</button>
          <button type="button" onClick={() => { signOut(); setConfirm(false); }} className="btn-primary !bg-error">Sign Out</button>
        </div>
      ) : signedIn ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={onManage} className="btn-secondary">
            <Icon name="manage_accounts" className="text-[18px]" /> Manage Account
          </button>
          <button type="button" onClick={() => setConfirm(true)} className="btn-secondary !text-error">
            <Icon name="logout" className="text-[18px]" /> Sign Out
          </button>
        </div>
      ) : (
        <button type="button" onClick={signIn} className="btn-primary w-full">
          <Icon name="login" className="text-[18px]" /> Sign in
        </button>
      )}
    </div>
  );
}
