"use client";

// Commuter profile, kept in this browser (the prototype has no user accounts). Holds personal
// details, mobility preferences (used as Journey Planner defaults), saved places, privacy choices
// and a small activity log (trips planned / started, reports sent). Every component reads it via
// useProfile(), so a change in the profile panel shows up everywhere at once.

import { useSyncExternalStore } from "react";
import { type Appearance, applyTheme, PROFILE_KEY } from "./theme";
import type { Mode, Traveller } from "./types";

export type Priority = "fastest" | "cheapest" | "fewest_transfers";
export type Language = "en" | "hi" | "mr";
export type { Appearance };

export interface SavedPlace {
  id: "home" | "work";
  title: string;
  /** Place name as the trip form understands it (e.g. "Andheri station"). */
  place: string;
}

export interface ActivityEntry {
  at: string;          // ISO time
  kind: "planned" | "started" | "reported";
  /** English summary (older entries only have this). */
  text: string;
  href?: string;
  /** Parts, so the ledger can show the entry in any language. */
  from?: string;
  to?: string;          // empty for a day trip
  route?: string;       // plan label: fastest / optimal / cheapest
  what?: string;        // what was reported
}

export interface Profile {
  signedIn: boolean;
  name: string;
  email: string;
  phone: string;
  /** Language the whole app is shown in (and the chat / voice reply in). */
  appLanguage: Language;
  territory: string;
  memberSince: string; // "Oct 2023"
  modes: Mode[];       // preferred vehicles (walking is always allowed)
  priority: Priority;
  stepFree: boolean;
  smsAlerts: boolean;
  places: SavedPlace[];
  privacy: { rememberTrips: boolean };
  appearance: Appearance;
  stats: { planned: number; started: number; reportIds: string[] };
  activity: ActivityEntry[];
}

const KEY = PROFILE_KEY;
const MAX_ACTIVITY = 40;

/** A first-time visitor: a guest until they create an account (lib/accounts.ts). */
export const DEFAULT_PROFILE: Profile = {
  signedIn: false,
  name: "",
  email: "",
  phone: "",
  appLanguage: "en",
  territory: "Mumbai Region (MMR)",
  memberSince: "",
  modes: ["metro", "local", "bus"],
  priority: "fastest",
  stepFree: false,
  smsAlerts: false,
  places: [
    { id: "home", title: "Home", place: "" },
    { id: "work", title: "Work", place: "" },
  ],
  privacy: { rememberTrips: true },
  appearance: "light",
  stats: { planned: 0, started: 0, reportIds: [] },
  activity: [],
};

export const GUEST_PROFILE: Profile = DEFAULT_PROFILE;

/** Home areas a commuter can pick (stored in English; shown translated). */
export const TERRITORIES = ["Mumbai Region (MMR)", "Mumbai City", "Mumbai Suburban", "Thane", "Navi Mumbai"];

/* ---------------------------------------------------------------- store */

const listeners = new Set<() => void>();
let cache: Profile | null = null;

function read(): Profile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Profile> & { languages?: unknown }) : null;
    if (saved) delete saved.languages; // older profiles kept a list of spoken languages
    cache = saved ? { ...DEFAULT_PROFILE, ...saved } : DEFAULT_PROFILE;
  } catch {
    cache = DEFAULT_PROFILE;
  }
  return cache;
}

function write(next: Profile) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked (private mode): keep it for this visit only
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = null; listener(); }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/** The profile, live. Server render and first paint use the default, then the saved one. */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_PROFILE);
}

export function getProfile(): Profile {
  return typeof window === "undefined" ? DEFAULT_PROFILE : read();
}

export function updateProfile(patch: Partial<Profile> | ((p: Profile) => Partial<Profile>)) {
  const cur = read();
  write({ ...cur, ...(typeof patch === "function" ? patch(cur) : patch) });
}

/** Replace the whole active profile (used by lib/accounts.ts when signing in, out or switching). */
export function replaceProfile(next: Profile) {
  write(next);
  if (typeof document !== "undefined") {
    applyTheme(next.appearance);
    document.documentElement.lang = LANG_HTML[next.appLanguage];
  }
}

/** Switch the app language (saved with the profile). */
export function setAppLanguage(appLanguage: Language) {
  document.documentElement.lang = LANG_HTML[appLanguage];
  updateProfile({ appLanguage });
}

export const LANG_HTML: Record<Language, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

/** Wipe everything this app stored in the browser (profile, saved trip, reporter id). */
export function clearDeviceData() {
  try {
    ["travelbuddy.profile", "travelbuddy.journey", "travelbuddy.reporter"].forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem("travelbuddy.trip");
  } catch {
    // ignore
  }
  cache = null;
  applyTheme(DEFAULT_PROFILE.appearance);
  write(DEFAULT_PROFILE);
}

/** Open the profile panel from anywhere (AppShell listens), optionally at a section. */
export const OPEN_EVENT = "travelbuddy:open-profile";
export type ProfileSection = "top" | "places" | "activity";
export function openProfile(section: ProfileSection = "top") {
  window.dispatchEvent(new CustomEvent<ProfileSection>(OPEN_EVENT, { detail: section }));
}

/* ---------------------------------------------------------------- activity */

function log(entry: Omit<ActivityEntry, "at">, stat?: (s: Profile["stats"]) => Profile["stats"]) {
  if (typeof window === "undefined") return;
  const cur = read();
  if (!cur.privacy.rememberTrips && entry.kind !== "reported") {
    if (stat) write({ ...cur, stats: stat(cur.stats) });
    return;
  }
  write({
    ...cur,
    stats: stat ? stat(cur.stats) : cur.stats,
    activity: [{ ...entry, at: new Date().toISOString() }, ...cur.activity].slice(0, MAX_ACTIVITY),
  });
}

export function recordPlanned(t: Traveller, href: string) {
  log({ kind: "planned", text: `Planned ${t.origin.label} → ${t.destination?.label ?? "day trip"}`, href,
    from: t.origin.label, to: t.destination?.label ?? "" },
    (s) => ({ ...s, planned: s.planned + 1 }));
}

export function recordStarted(t: Traveller, route: string) {
  log({ kind: "started", text: `Started ${t.origin.label} → ${t.destination?.label ?? ""} (${route})`, href: "/track",
    from: t.origin.label, to: t.destination?.label ?? "", route },
    (s) => ({ ...s, started: s.started + 1 }));
}

export function recordReport(eventId: string, what: string) {
  log({ kind: "reported", text: `Reported: ${what}`, href: `/events/${eventId}`, what },
    (s) => ({ ...s, reportIds: s.reportIds.includes(eventId) ? s.reportIds : [eventId, ...s.reportIds].slice(0, 50) }));
}

/* ---------------------------------------------------------------- theme */

/** Switch light / dark: saved with the profile and applied to <html data-theme> at once. */
export function setAppearance(appearance: Appearance) {
  applyTheme(appearance);
  updateProfile({ appearance });
}

/* ---------------------------------------------------------------- helpers */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", hi: "हिंदी", mr: "मराठी" };
