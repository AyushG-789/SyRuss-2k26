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
import { MODE_LABEL, PLAN_LABEL } from "@/lib/format";
import { LANGS, type Lang, useLang, useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/ProfilePanel";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import {
  type ActivityEntry, clearDeviceData, initials, setAppearance, setAppLanguage, type Priority, type Profile, type ProfileSection,
  TERRITORIES, updateProfile, useProfile,
} from "@/lib/profile";
import { clearAccounts, findLogin, openAuth, signOutAccount, useAccounts } from "@/lib/accounts";
import { loadTrip } from "@/lib/savedTrip";
import type { Mode } from "@/lib/types";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Collapse from "./Collapse";
import Icon from "./Icon";

type Key = keyof typeof M.en;

const MODE_CHIPS: { id: string; icon: string; modes: Mode[] }[] = [
  { id: "metro", icon: "subway", modes: ["metro"] },
  { id: "local", icon: "train", modes: ["local"] },
  { id: "bus", icon: "directions_bus", modes: ["bus"] },
  { id: "auto", icon: "electric_rickshaw", modes: ["auto"] },
  { id: "cab", icon: "local_taxi", modes: ["taxi", "cab"] },
];

const PRIORITIES: { value: Priority; label: Key }[] = [
  { value: "fastest", label: "pFastest" },
  { value: "cheapest", label: "pCheapest" },
  { value: "fewest_transfers", label: "pTransfers" },
];

const THEMES = [
  { value: "light", label: "lightMode", icon: "light_mode", swatch: { bg: "#f4f2e9", card: "#ffffff", text: "#202923", muted: "#737d73", brand: "#24483a" } },
  { value: "dark", label: "darkMode", icon: "dark_mode", swatch: { bg: "#101d19", card: "#1d3028", text: "#f2f0e7", muted: "#a4b2a8", brand: "#d9b982" } },
] as const;


const SOS: { href: string; icon: string; title: string; sub: Key }[] = [
  { href: "tel:112", icon: "sos", title: "112", sub: "sos112" },
  { href: "tel:1091", icon: "woman", title: "1091", sub: "sos1091" },
  { href: "tel:1512", icon: "shield", title: "1512", sub: "sos1512" },
];

const noop = () => () => undefined;

export default function ProfilePanel(props: { open: boolean; section: ProfileSection; onClose: () => void }) {
  // Rendered into <body>: the top bar's backdrop blur would otherwise clip a fixed panel to its height.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(<Panel {...props} />, document.body) : null;
}

function Panel({ open, section, onClose }: { open: boolean; section: ProfileSection; onClose: () => void }) {
  const t = useT(M);
  const profile = useProfile();
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  // About you / How you travel / Saved places open and close; they start closed with a summary.
  const [expanded, setExpanded] = useState<Record<"about" | "prefs" | "places", boolean>>({ about: false, prefs: false, places: false });
  const toggle = (k: keyof typeof expanded) => setExpanded((e) => ({ ...e, [k]: !e[k] }));
  // Opening the panel at "Saved places" (e.g. from the planner) opens that section.
  const [seen, setSeen] = useState({ open, section });
  if (seen.open !== open || seen.section !== section) {
    setSeen({ open, section });
    if (open && section === "places") setExpanded((e) => ({ ...e, places: true }));
  }

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
    setExpanded((e) => ({ ...e, about: true }));
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className={`fixed inset-0 z-[1300] ${open ? "" : "pointer-events-none"}`} inert={!open}>
      <button type="button" aria-label={t("close")} tabIndex={-1} onClick={onClose}
        className={`absolute inset-0 bg-scrim transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside role="dialog" aria-modal="true" aria-labelledby="profile-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-surface shadow-float transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="border-b border-hairline bg-container-lowest px-5 pb-5 pt-4">
          <div className="flex items-center justify-between">
            <h2 id="profile-title" className="eyebrow flex items-center gap-2 !text-small !tracking-[0.08em] text-on-surface">
              <Icon name="account_circle" className="text-[20px] text-primary" /> {t("title")}
            </h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-container-low">
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
                <p className="truncate text-subtitle font-bold">{profile.signedIn ? profile.name : t("guestName")}</p>
                {profile.signedIn
                  ? <span className="chip bg-primary-soft text-primary-ink"><Icon name="verified" className="text-[14px]" /> {t("verified")}</span>
                  : <span className="chip bg-container text-on-surface-variant">{t("guest")}</span>}
              </div>
              {profile.email && <p className="truncate text-small text-on-surface-variant">{profile.email}</p>}
              <p className="mt-0.5 flex items-center gap-1 text-caption text-on-surface-variant">
                <Icon name="calendar_today" className="text-[14px]" />
                {profile.signedIn ? t("since", { date: profile.memberSince }) : t("notSignedIn")}
              </p>
            </div>
            {profile.signedIn && !editing && (
              <button type="button" onClick={manage} className="btn-secondary !min-h-9 !px-3">
                <Icon name="edit" className="text-[16px]" /> {t("edit")}
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {profile.signedIn
            ? <>
                <Accounts />
                <PersonalInfo profile={profile} editing={editing} setEditing={setEditing}
                  open={expanded.about || editing} onToggle={() => toggle("about")} />
              </>
            : <GuestCard />}
          <Preferences profile={profile} onPlan={onClose} open={expanded.prefs} onToggle={() => toggle("prefs")} />
          <SavedPlaces profile={profile} onGo={onClose} open={expanded.places} onToggle={() => toggle("places")} />
          <Activity profile={profile} onNavigate={onClose} />
          <Safety />
          <AppSupport profile={profile} onNavigate={onClose} />
          <p className="pb-2 text-center text-caption text-on-surface-variant">
            <Icon name="lock" className="mr-1 align-[-3px] text-[14px]" />
            {t("savedLocal")}
          </p>
        </div>

        {/* Footer */}
        <Footer signedIn={profile.signedIn} onManage={manage} />
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- building blocks */

/** A section. With `fold`, the title is a button that opens / closes it and shows a summary when closed. */
function Section({ icon, title, action, id, fold, children }: {
  icon: string; title: string; action?: React.ReactNode; id?: ProfileSection;
  fold?: { open: boolean; onToggle: () => void; summary: string };
  children: React.ReactNode;
}) {
  const t = useT(M);
  const bodyId = useId();
  if (fold) {
    return (
      <section data-section={id} className="scroll-mt-4">
        <div className={`card overflow-hidden ${fold.open ? "ring-1 ring-primary/30" : ""}`}>
          <button type="button" onClick={fold.onToggle} aria-expanded={fold.open} aria-controls={bodyId}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-container-low">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink"><Icon name={icon} className="text-[20px]" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-bold">{title}</span>
              <span className="block truncate text-caption text-on-surface-variant">{fold.open ? t("tapToClose") : fold.summary}</span>
            </span>
            <Icon name="expand_more" className={`text-[22px] text-outline transition-transform ${fold.open ? "rotate-180" : ""}`} />
          </button>
          <Collapse open={fold.open} id={bodyId}>
            <div className="border-t border-hairline-soft bg-surface/60 p-3">
              {action && <div className="mb-2 flex justify-end">{action}</div>}
              {children}
            </div>
          </Collapse>
        </div>
      </section>
    );
  }
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

function PersonalInfo({ profile, editing, setEditing, open, onToggle }: {
  profile: Profile; editing: boolean; setEditing: (v: boolean) => void; open: boolean; onToggle: () => void;
}) {
  const t = useT(M);
  return (
    <Section icon="badge" title={t("personal")}
      fold={{ open, onToggle, summary: [profile.name, langName(profile.appLanguage), territoryName(t, profile.territory)].filter(Boolean).join(" · ") }}
      action={!editing && <button type="button" onClick={() => setEditing(true)} className="text-small font-semibold text-primary hover:underline">{t("edit")}</button>}>
      {editing
        ? <PersonalForm key="form" profile={profile} onDone={() => setEditing(false)} />
        : (
          <dl className="card divide-y divide-hairline-soft px-4">
            {[
              [t("fullName"), profile.name],
              [t("email"), profile.email || "—"],
              [t("phone"), maskPhone(profile.phone)],
              [t("language"), langName(profile.appLanguage)],
              [t("territory"), territoryName(t, profile.territory)],
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

function langName(l: Lang): string {
  const x = LANGS.find((o) => o.value === l)!;
  return x.value === "en" ? x.label : `${x.label} (${x.english})`;
}

function territoryName(t: (k: Key) => string, territory: string): string {
  const key = `terr.${territory}` as Key;
  return key in M.en ? t(key) : territory;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return phone || "—";
  const local = digits.slice(-10);
  return `+91 ${local.slice(0, 5)} •••••`;
}

/** Edit personal details of the signed-in account. */
function PersonalForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const t = useT(M);
  const id = useId();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [language, setLanguage] = useState<Lang>(profile.appLanguage);
  const [territory, setTerritory] = useState(profile.territory);
  const [errors, setErrors] = useState<Partial<Record<"name" | "email" | "phone", Key>>>({});

  const pickLanguage = (l: Lang) => setLanguage(l);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = "errName";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "errEmail";
    const digits = phone.replace(/\D/g, "");
    if (phone.trim() && !(digits.length === 10 || (digits.length === 12 && digits.startsWith("91")))) errs.phone = "errPhone";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const local = digits.slice(-10);
    const details = {
      name: name.trim().replace(/\s+/g, " "),
      email: email.trim(),
      phone: local ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : "",
      territory,
      appLanguage: language,
    };
    updateProfile(details);
    if (language !== profile.appLanguage) setAppLanguage(language);
    onDone();
  }

  const err = (k: keyof typeof errors) => errors[k] && <p id={`${id}-${k}-err`} className="mt-1 text-caption text-error">{t(errors[k]!)}</p>;
  const label = "mb-1 block text-caption font-semibold text-on-surface-variant";

  return (
    <form onSubmit={save} noValidate className="card space-y-3 p-4">
      <fieldset>
        <legend className={label}>{t("language")}</legend>
        <div role="radiogroup" aria-label={t("language")} className="grid grid-cols-3 gap-2">
          {LANGS.map((l) => {
            const on = language === l.value;
            return (
              <button key={l.value} type="button" role="radio" aria-checked={on} lang={l.html} onClick={() => pickLanguage(l.value)}
                className={`flex flex-col items-center rounded-xl px-2 py-2 ${on ? "bg-primary text-on-primary" : "bg-container-lowest text-on-surface ring-1 ring-hairline hover:bg-container-low"}`}>
                <span className="text-small font-bold">{l.label}</span>
                <span className={`text-micro ${on ? "opacity-80" : "text-on-surface-variant"}`}>{l.english}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-caption text-on-surface-variant">{t("languageHint")}</p>
      </fieldset>
      <label className="block">
        <span className={label}>{t("fullName")}</span>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t("namePh")}
          aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${id}-name-err` : undefined} />
        {err("name")}
      </label>
      <label className="block">
        <span className={label}>{t("email")}</span>
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-err` : undefined} />
        {err("email")}
      </label>
      <label className="block">
        <span className={label}>{t("phone")}</span>
        <input className={inputCls} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98201 23456" autoComplete="tel"
          aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? `${id}-phone-err` : undefined} />
        {err("phone")}
      </label>
      <label className="block">
        <span className={label}>{t("territory")}</span>
        <select className={inputCls} value={territory} onChange={(e) => setTerritory(e.target.value)}>
          {TERRITORIES.map((x) => <option key={x} value={x}>{territoryName(t, x)}</option>)}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className="btn-secondary">{t("cancel")}</button>
        <button type="submit" className="btn-primary">
          <Icon name="check" className="text-[18px]" /> {t("saveChanges")}
        </button>
      </div>
    </form>
  );
}

function GuestCard() {
  const t = useT(M);
  return (
    <div className="card flex flex-col gap-3 p-4">
      <p className="flex items-start gap-3 text-small text-on-surface-variant">
        <Icon name="person_off" className="text-on-surface-variant" /> {t("guestText")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openAuth("signup")} className="btn-primary"><Icon name="person_add" className="text-[18px]" /> {t("createAccount")}</button>
        <button type="button" onClick={() => openAuth("signin")} className="btn-secondary"><Icon name="login" className="text-[18px]" /> {t("signIn")}</button>
      </div>
    </div>
  );
}

/** Every account saved on this device: switch (asks that account's password) or create another. */
function Accounts() {
  const t = useT(M);
  const accounts = useAccounts();
  return (
    <section className="card p-3">
      <p className="eyebrow mb-2 px-1">{t("accounts")}</p>
      <ul className="flex flex-col gap-1">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-caption font-bold ${a.current ? "bg-primary text-on-primary" : "bg-container text-on-surface"}`}>{a.initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold">{a.name}</span>
              <span className="block truncate text-caption text-on-surface-variant">{a.email}</span>
            </span>
            {a.current
              ? <span className="chip bg-primary-soft text-primary-ink"><Icon name="check" className="text-[14px]" /> {t("thisOne")}</span>
              : <button type="button" onClick={() => openAuth("signin", findLogin(a.id))} className="btn-secondary !min-h-9 !px-3">{t("switchTo")}</button>}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => openAuth("signup")}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant py-2.5 text-small font-semibold text-primary hover:bg-container-low">
        <Icon name="person_add" className="text-[18px]" /> {t("createAnother")}
      </button>
    </section>
  );
}

/* ---------------------------------------------------------------- preferences */

function Preferences({ profile, onPlan, open, onToggle }: { profile: Profile; onPlan: () => void; open: boolean; onToggle: () => void }) {
  const t = useT(M);
  const modeNames = MODE_CHIPS.filter((c) => c.modes.every((m) => profile.modes.includes(m)))
    .map((c) => (c.id === "local" ? t("localTrain") : MODE_LABEL[c.modes[c.modes.length - 1]]));
  const priorityName = t(PRIORITIES.find((p) => p.value === profile.priority)?.label ?? "pFastest");
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
    <Section icon="tune" title={t("prefs")} fold={{ open, onToggle, summary: [modeNames.join(", "), priorityName].filter(Boolean).join(" · ") }}
      action={<span className="chip bg-primary-soft text-primary-ink" aria-live="polite">{saved ? t("savedTick") : t("personalized")}</span>}>
      <p className="mb-2 text-small font-semibold">{t("preferredModes")}</p>
      <div className="flex flex-wrap gap-2">
        {MODE_CHIPS.map((c) => {
          const on = c.modes.every((m) => profile.modes.includes(m));
          const last = on && profile.modes.length === c.modes.length;
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleMode(c)}
              title={last ? t("keepOne") : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-small font-semibold ${on ? "bg-primary text-on-primary" : "bg-container-lowest text-on-surface-variant ring-1 ring-hairline hover:bg-container-low"}`}>
              <Icon name={c.icon} className="text-[16px]" /> {c.id === "local" ? t("localTrain") : MODE_LABEL[c.modes[c.modes.length - 1]]}
            </button>
          );
        })}
        <span className="flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-small font-semibold text-primary-ink" title={t("walkAlwaysTip")}>
          <Icon name="directions_walk" className="text-[16px]" /> {t("walkAlways")}
        </span>
      </div>

      <p className="mb-2 mt-4 text-small font-semibold">{t("priority")}</p>
      <div role="radiogroup" aria-label={t("priority")} className="grid grid-cols-3 gap-1 rounded-xl bg-container p-1">
        {PRIORITIES.map((p) => {
          const on = profile.priority === p.value;
          return (
            <button key={p.value} type="button" role="radio" aria-checked={on}
              onClick={() => { updateProfile({ priority: p.value }); flash(); }}
              className={`rounded-lg px-2 py-2 text-small ${on ? "bg-container-lowest font-semibold text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
              {t(p.label)}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <Toggle icon="accessible" label={t("stepFree")} sub={t("stepFreeSub")}
          checked={profile.stepFree} onChange={(v) => { updateProfile({ stepFree: v }); flash(); }} />
        <Toggle icon="notifications_active" label={t("sms")}
          sub={profile.phone ? t("smsSub", { phone: maskPhone(profile.phone) }) : t("smsNoPhone")}
          disabled={!profile.phone} checked={profile.smsAlerts && Boolean(profile.phone)}
          onChange={(v) => { updateProfile({ smsAlerts: v }); flash(); }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2">
        <p className="text-caption text-primary-ink">{t("plannerUses")}</p>
        <Link href="/plan" onClick={onPlan} className="flex items-center gap-1 text-caption font-bold text-primary hover:underline">
          {t("planTrip")} <Icon name="arrow_forward" className="text-[14px]" />
        </Link>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- saved places */

function SavedPlaces({ profile, onGo, open, onToggle }: { profile: Profile; onGo: () => void; open: boolean; onToggle: () => void }) {
  const t = useT(M);
  const placeSummary = profile.places.map((p) => `${t(p.id)}: ${p.place || t("notSet")}`).join(" · ");
  const listId = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function save(placeId: string) {
    const match = draft.trim() ? findPlace(draft) : undefined;
    if (draft.trim() && !match) { setError(t("placeErr")); return; }
    updateProfile((p) => ({ places: p.places.map((x) => (x.id === placeId ? { ...x, place: match?.label ?? "" } : x)) }));
    setEditing(null);
    setError("");
  }

  return (
    <Section id="places" icon="bookmark" title={t("places")} fold={{ open, onToggle, summary: placeSummary }}>
      <datalist id={listId}>{PLACE_OPTIONS.map((p) => <option key={p.label} value={p.label} />)}</datalist>
      <div className="space-y-2">
        {profile.places.map((p) => (
          <div key={p.id} className="card p-3">
            {editing === p.id ? (
              <form onSubmit={(e) => { e.preventDefault(); save(p.id); }} className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-caption font-semibold text-on-surface-variant">{t(p.id)}</span>
                  <input autoFocus list={listId} className={inputCls} value={draft} placeholder={t("placePh")}
                    onChange={(e) => { setDraft(e.target.value); setError(""); }} aria-invalid={Boolean(error)} />
                </label>
                {error && <p className="text-caption text-error">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditing(null); setError(""); }} className="btn-secondary !min-h-9">{t("cancel")}</button>
                  <button type="submit" className="btn-primary !min-h-9">{t("save")}</button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-container">
                  <Icon name={p.id === "home" ? "home" : "work"} className="text-on-surface-variant" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">{t(p.id)}</span>
                  <span className="block truncate text-caption text-on-surface-variant">{p.place || t("notSet")}</span>
                </span>
                <button type="button" onClick={() => { setEditing(p.id); setDraft(p.place); }} aria-label={t("editPlace", { place: t(p.id) })}
                  className="rounded-lg p-2 text-on-surface-variant hover:bg-container-low"><Icon name="edit" className="text-[18px]" /></button>
                {p.place && (
                  <Link href={`/plan?to=${encodeURIComponent(p.place)}`} onClick={onGo} className="btn-ghost !min-h-9 !px-3">
                    {t("go")} <Icon name="arrow_forward" className="text-[16px]" />
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
  const t = useT(M);
  const lang = useLang();
  const live = useLiveEvents();
  const [ledger, setLedger] = useState(false);
  const verified = useMemo(() => {
    const confirmed = new Set((live?.events ?? []).filter((e) => e.status === "confirmed").map((e) => e.event_id));
    return profile.stats.reportIds.filter((id) => confirmed.has(id)).length;
  }, [live, profile.stats.reportIds]);
  const placesSet = profile.places.filter((p) => p.place).length;

  const tiles: { n: number; label: string; href?: string; onClick?: () => void; extra?: string }[] = [
    { n: profile.stats.planned, label: t("planned"), onClick: () => setLedger(true) },
    { n: placesSet, label: t("savedPlaces"), onClick: () => document.querySelector('[data-section="places"]')?.scrollIntoView({ behavior: "smooth" }) },
    { n: profile.stats.started, label: t("tracked"), href: "/track" },
    { n: profile.stats.reportIds.length, label: t("reported"), href: "/report", extra: profile.stats.reportIds.length ? t("verifiedN", { n: verified }) : undefined },
  ];

  return (
    <Section id="activity" icon="monitoring" title={t("activity")}
      action={
        <button type="button" onClick={() => setLedger(!ledger)} aria-expanded={ledger} className="flex items-center text-small font-semibold text-primary hover:underline">
          {ledger ? t("hideLedger") : t("fullLedger")} <Icon name={ledger ? "expand_less" : "chevron_right"} className="text-[18px]" />
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

      <Collapse open={ledger}>
        <div className="card mt-2 p-2">
          {profile.activity.length === 0 ? (
            <p className="p-3 text-small text-on-surface-variant">
              {t("ledgerEmpty")}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-hairline-soft">
                {profile.activity.map((a, i) => (
                  <li key={`${a.at}-${i}`}>
                    <Link href={a.href ?? "/home"} onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-container-low">
                      <Icon name={a.kind === "planned" ? "alt_route" : a.kind === "started" ? "fmd_good" : "campaign"}
                        className={a.kind === "reported" ? "text-tertiary" : "text-primary"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold">{activityText(t, a)}</span>
                        <span className="block text-caption text-on-surface-variant">{timeAgo(a.at, lang)}</span>
                      </span>
                      <Icon name="chevron_right" className="text-[18px] text-outline" />
                    </Link>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => updateProfile({ activity: [] })} className="btn-ghost mt-1 w-full !min-h-9 text-on-surface-variant">
                {t("clearHistory")}
              </button>
            </>
          )}
        </div>
      </Collapse>
    </Section>
  );
}

function activityText(t: (k: Key, v?: Record<string, string | number>) => string, a: ActivityEntry): string {
  if (a.kind === "reported" && a.what) return t("actReported", { what: a.what });
  if (a.from === undefined) return a.text; // entry saved before languages existed
  const to = a.to || t("dayTrip");
  if (a.kind === "planned") return t("actPlanned", { from: a.from, to });
  const route = a.route && a.route in PLAN_LABEL ? PLAN_LABEL[a.route as keyof typeof PLAN_LABEL] : (a.route ?? "");
  return t("actStarted", { from: a.from, to, route });
}

function timeAgo(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return d.toLocaleString(LANGS.find((l) => l.value === lang)!.html, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ---------------------------------------------------------------- safety */

function Safety() {
  const t = useT(M);
  const [status, setStatus] = useState<Key | null>(null);

  async function shareTrip() {
    const trip = loadTrip();
    if (!trip) { setStatus("noTrip"); return; }
    const to = trip.destination?.label ?? trip.traveller.destination?.label ?? t("myDestination");
    const legs = trip.card.legs.filter((l) => l.mode !== "walk").map((l) => MODE_LABEL[l.mode]).join(" → ") || t("walking");
    const eta = trip.card.legs.at(-1)?.arrive ?? "";
    const text = t("shareText", { from: trip.traveller.origin.label, to, legs, eta: eta ? t("shareEta", { time: eta }) : "" });
    const url = `${window.location.origin}/track`;
    try {
      if (navigator.share) { await navigator.share({ title: t("shareTitle"), text, url }); setStatus("shared"); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setStatus("copied");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setStatus("shareFail");
    }
  }

  return (
    <Section icon="sos" title={t("safety")}>
      <div className="grid grid-cols-3 gap-2">
        {SOS.map((s, i) => (
          <a key={s.href} href={s.href}
            className={`card card-interactive flex flex-col items-center gap-1 px-2 py-3 text-center ${i === 0 ? "!bg-error-container" : ""}`}>
            <Icon name={s.icon} className={i === 0 ? "text-error" : "text-primary"} />
            <span className={`text-subtitle font-bold ${i === 0 ? "text-on-error-container" : ""}`}>{s.title}</span>
            <span className="text-micro text-on-surface-variant">{t(s.sub)}</span>
          </a>
        ))}
      </div>
      <button type="button" onClick={shareTrip} className="btn-secondary mt-2 w-full">
        <Icon name="share_location" className="text-[18px] text-primary" /> {t("shareTrip")}
      </button>
      {status && <p className="mt-2 text-caption text-on-surface-variant" role="status">{t(status)}</p>}
    </Section>
  );
}

/* ---------------------------------------------------------------- app & support */

function AppSupport({ profile, onNavigate }: { profile: Profile; onNavigate: () => void }) {
  const t = useT(M);
  const [privacy, setPrivacy] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const row = "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-container-low";

  return (
    <Section icon="settings" title={t("app")}>
      <div className="card divide-y divide-hairline-soft overflow-hidden">
        <button type="button" onClick={() => setLanguageOpen(!languageOpen)} aria-expanded={languageOpen} className={row}>
          <Icon name="translate" className="text-on-surface-variant" />
          <span className="flex-1 text-small font-semibold">{t("appLanguage")}</span>
          <span className="text-caption text-on-surface-variant">{LANGS.find((l) => l.value === profile.appLanguage)!.label}</span>
          <Icon name={languageOpen ? "expand_less" : "chevron_right"} className="text-outline" />
        </button>
        <Collapse open={languageOpen}>
          <div role="radiogroup" aria-label={t("appLanguage")} className="grid grid-cols-3 gap-2 bg-container-low/60 p-3">
            {LANGS.map((l) => {
              const on = profile.appLanguage === l.value;
              return (
                <button key={l.value} type="button" role="radio" aria-checked={on} lang={l.html} onClick={() => setAppLanguage(l.value)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl bg-container-lowest px-2 py-3 ring-2 ${on ? "ring-primary" : "ring-transparent shadow-sm hover:ring-hairline"}`}>
                  <span className="text-subtitle font-bold">{l.label}</span>
                  <span className="text-micro text-on-surface-variant">{l.english}</span>
                  {on && <Icon name="check_circle" fill className="text-[18px] text-primary" />}
                </button>
              );
            })}
          </div>
        </Collapse>
        <button type="button" onClick={() => setAppearanceOpen(!appearanceOpen)} aria-expanded={appearanceOpen} className={row}>
          <Icon name="palette" className="text-on-surface-variant" />
          <span className="flex-1 text-small font-semibold">{t("appearance")}</span>
          <span className="text-caption text-on-surface-variant">{profile.appearance === "dark" ? t("dark") : t("light")}</span>
          <Icon name={appearanceOpen ? "expand_less" : "chevron_right"} className="text-outline" />
        </button>
        <Collapse open={appearanceOpen}>
          <div role="radiogroup" aria-label={t("appearance")} className="grid grid-cols-2 gap-2 bg-container-low/60 p-3">
            {THEMES.map((th) => {
              const on = profile.appearance === th.value;
              return (
                <button key={th.value} type="button" role="radio" aria-checked={on} onClick={() => setAppearance(th.value)}
                  className={`flex flex-col gap-2 rounded-xl bg-container-lowest p-2 text-left ring-2 ${on ? "ring-primary" : "ring-transparent shadow-sm hover:ring-hairline"}`}>
                  {/* mini preview of the theme */}
                  <span className="flex h-16 gap-1.5 overflow-hidden rounded-lg p-1.5" style={{ background: th.swatch.bg }} aria-hidden>
                    <span className="w-1/3 rounded-md" style={{ background: th.swatch.card }} />
                    <span className="flex flex-1 flex-col gap-1 rounded-md p-1.5" style={{ background: th.swatch.card }}>
                      <span className="h-1.5 w-3/4 rounded-full" style={{ background: th.swatch.text }} />
                      <span className="h-1.5 w-1/2 rounded-full" style={{ background: th.swatch.muted }} />
                      <span className="mt-auto h-3 w-1/2 rounded" style={{ background: th.swatch.brand }} />
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 px-1 text-small font-semibold">
                    <Icon name={th.icon} className={`text-[18px] ${on ? "text-primary" : "text-on-surface-variant"}`} />
                    {t(th.label)}
                    {on && <Icon name="check_circle" fill className="ml-auto text-[18px] text-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        </Collapse>

        <button type="button" onClick={() => setPrivacy(!privacy)} aria-expanded={privacy} className={row}>
          <Icon name="lock" className="text-on-surface-variant" />
          <span className="flex-1 text-small font-semibold">{t("privacy")}</span>
          <Icon name={privacy ? "expand_less" : "chevron_right"} className="text-outline" />
        </button>
        <Collapse open={privacy}>
          <div className="space-y-2 bg-container-low/60 p-3">
            <Toggle icon="history" label={t("remember")} sub={t("rememberSub")}
              checked={profile.privacy.rememberTrips}
              onChange={(v) => updateProfile((p) => ({ privacy: { ...p.privacy, rememberTrips: v } }))} />
            <p className="px-1 text-caption text-on-surface-variant">
              {t("anonymous")}
            </p>
            {confirmClear ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-error-container p-3">
                <p className="flex-1 text-caption text-on-error-container">{t("eraseQ")}</p>
                <button type="button" onClick={() => setConfirmClear(false)} className="btn-secondary !min-h-9">{t("keep")}</button>
                <button type="button" onClick={() => { clearAccounts(); clearDeviceData(); setConfirmClear(false); setCleared(true); }}
                  className="btn-primary !min-h-9 !bg-error">{t("erase")}</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setConfirmClear(true); setCleared(false); }} className="btn-secondary w-full !text-error">
                <Icon name="delete" className="text-[18px]" /> {t("clearData")}
              </button>
            )}
            {cleared && <p className="text-caption text-primary" role="status">{t("cleared")}</p>}
          </div>
        </Collapse>

        <a href="tel:139" className={row}>
          <Icon name="support_agent" className="text-on-surface-variant" />
          <span className="flex-1">
            <span className="block text-small font-semibold">{t("helpline")}</span>
            <span className="block text-caption text-on-surface-variant">{t("helplineSub")}</span>
          </span>
          <Icon name="call" className="text-outline" />
        </a>
        <Link href="/transparency" onClick={onNavigate} className={row}>
          <Icon name="gavel" className="text-on-surface-variant" />
          <span className="flex-1 text-small font-semibold">{t("transparency")}</span>
          <Icon name="chevron_right" className="text-outline" />
        </Link>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- footer */

function Footer({ signedIn, onManage }: { signedIn: boolean; onManage: () => void }) {
  const t = useT(M);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="border-t border-hairline bg-container-lowest px-5 py-3 shadow-sheet">
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-small">{t("signOutQ")}</p>
          <button type="button" onClick={() => setConfirm(false)} className="btn-secondary">{t("cancel")}</button>
          <button type="button" onClick={() => { signOutAccount(); setConfirm(false); }} className="btn-primary !bg-error">{t("signOut")}</button>
        </div>
      ) : signedIn ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={onManage} className="btn-secondary">
            <Icon name="manage_accounts" className="text-[18px]" /> {t("manage")}
          </button>
          <button type="button" onClick={() => setConfirm(true)} className="btn-secondary !text-error">
            <Icon name="logout" className="text-[18px]" /> {t("signOut")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => openAuth("signup")} className="btn-primary"><Icon name="person_add" className="text-[18px]" /> {t("createAccount")}</button>
          <button type="button" onClick={() => openAuth("signin")} className="btn-secondary"><Icon name="login" className="text-[18px]" /> {t("signIn")}</button>
        </div>
      )}
    </div>
  );
}
