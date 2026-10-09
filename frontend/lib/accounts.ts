"use client";

// Accounts on this device. The prototype has no account server, so accounts live in this browser
// (localStorage). Passwords are never stored: only a PBKDF2-SHA-256 hash with a random salt.
// Each account keeps its own full profile (details, preferences, places, history). The signed-in
// account's profile is the active profile in lib/profile.ts, so every screen keeps working as is.

import { useSyncExternalStore } from "react";
import type { Language, Profile } from "./profile";
import { DEFAULT_PROFILE, getProfile, initials, replaceProfile } from "./profile";

const KEY = "travelbuddy.accounts";
const ITERATIONS = 150_000;

export interface Account {
  id: string;
  email: string;      // lower-case, used to sign in
  phone: string;      // 10 digits, can also be used to sign in
  salt: string;       // base64
  hash: string;       // base64 PBKDF2(password, salt)
  createdAt: string;
  profile: Profile;
}

interface Store {
  accounts: Account[];
  currentId: string | null;
}

/** What screens may show about an account (never the hash). */
export interface AccountSummary {
  id: string;
  name: string;
  email: string;
  initials: string;
  current: boolean;
}

export interface NewAccount {
  name: string;
  email: string;
  phone: string;
  appLanguage: Language;
  territory: string;
  password: string;
}

export type AuthError = "emailTaken" | "phoneTaken" | "wrongLogin" | "noCrypto";

/* ---------------------------------------------------------------- store */

const EMPTY: Store = { accounts: [], currentId: null };
const listeners = new Set<() => void>();
let cache: Store | null = null;
let summaries: AccountSummary[] = [];

function read(): Store {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Store>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  summaries = summarize(cache);
  return cache;
}

function write(next: Store) {
  cache = next;
  summaries = summarize(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: accounts last for this visit only
  }
  listeners.forEach((l) => l());
}

function summarize(s: Store): AccountSummary[] {
  return s.accounts.map((a) => ({
    id: a.id, name: a.profile.name, email: a.email, initials: initials(a.profile.name), current: a.id === s.currentId,
  }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

const NONE: AccountSummary[] = [];

/** Accounts saved on this device, live. */
export function useAccounts(): AccountSummary[] {
  return useSyncExternalStore(subscribe, () => { read(); return summaries; }, () => NONE);
}

/* ---------------------------------------------------------------- passwords */

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromB64(salt), iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return toB64(bits);
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const cryptoReady = () => typeof crypto !== "undefined" && Boolean(crypto.subtle);

/* ---------------------------------------------------------------- helpers */

export const digits10 = (phone: string) => phone.replace(/\D/g, "").slice(-10);
export const formatPhone = (phone: string) => {
  const d = digits10(phone);
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : "";
};

/** Copy the active profile into the signed-in account (call before reading or switching). */
function syncCurrent(s: Store): Store {
  if (!s.currentId) return s;
  const p = getProfile();
  return {
    ...s,
    accounts: s.accounts.map((a) => (a.id === s.currentId
      ? { ...a, profile: p, email: p.email.trim().toLowerCase() || a.email, phone: digits10(p.phone) || a.phone }
      : a)),
  };
}

/** Keep things consistent: a "signed in" profile with no account on this device becomes a guest. */
export function reconcile() {
  const s = read();
  const p = getProfile();
  const known = s.currentId && s.accounts.some((a) => a.id === s.currentId);
  if (p.signedIn && !known) replaceProfile({ ...DEFAULT_PROFILE, appearance: p.appearance, appLanguage: p.appLanguage });
  if (!p.signedIn && s.currentId) write({ ...s, currentId: null });
}

/* ---------------------------------------------------------------- actions */

/** Create an account and sign in to it. The current account (if any) is kept on this device. */
export async function createAccount(d: NewAccount): Promise<{ ok: true } | { ok: false; error: AuthError }> {
  if (!cryptoReady()) return { ok: false, error: "noCrypto" };
  const s = syncCurrent(read());
  const email = d.email.trim().toLowerCase();
  const phone = digits10(d.phone);
  if (s.accounts.some((a) => a.email === email)) return { ok: false, error: "emailTaken" };
  if (s.accounts.some((a) => a.phone === phone)) return { ok: false, error: "phoneTaken" };
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(d.password, salt);
  const now = getProfile();
  const profile: Profile = {
    ...DEFAULT_PROFILE,
    signedIn: true,
    name: d.name.trim().replace(/\s+/g, " "),
    email,
    phone: formatPhone(phone),
    appLanguage: d.appLanguage,
    territory: d.territory,
    memberSince: new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
    smsAlerts: true,
    appearance: now.appearance, // keep this device's light / dark choice
  };
  const id = `acc_${toB64(crypto.getRandomValues(new Uint8Array(9))).replace(/[^a-z0-9]/gi, "")}`;
  write({ accounts: [...s.accounts, { id, email, phone, salt, hash, createdAt: new Date().toISOString(), profile }], currentId: id });
  replaceProfile(profile);
  return { ok: true };
}

/** Sign in with email or mobile number + password. */
export async function signInAccount(login: string, password: string): Promise<{ ok: true; name: string } | { ok: false; error: AuthError }> {
  if (!cryptoReady()) return { ok: false, error: "noCrypto" };
  const s = syncCurrent(read());
  const q = login.trim().toLowerCase();
  const acc = s.accounts.find((a) => a.email === q || (digits10(q).length === 10 && a.phone === digits10(q)));
  // Same work and the same answer whether the account exists or not.
  const hash = await hashPassword(password, acc?.salt ?? toB64(new Uint8Array(16)));
  if (!acc || !sameHash(hash, acc.hash)) return { ok: false, error: "wrongLogin" };
  write({ ...s, currentId: acc.id });
  replaceProfile({ ...acc.profile, signedIn: true });
  return { ok: true, name: acc.profile.name };
}

/** Sign out: the account stays on this device; the app goes back to a guest. */
export function signOutAccount() {
  const s = syncCurrent(read());
  const p = getProfile();
  write({ ...s, currentId: null });
  replaceProfile({ ...DEFAULT_PROFILE, appearance: p.appearance, appLanguage: p.appLanguage });
}

/** Remove the signed-in account from this device and sign out. */
export function deleteCurrentAccount() {
  const s = read();
  const p = getProfile();
  write({ accounts: s.accounts.filter((a) => a.id !== s.currentId), currentId: null });
  replaceProfile({ ...DEFAULT_PROFILE, appearance: p.appearance, appLanguage: p.appLanguage });
}

/** Forget every account on this device (part of "Clear my data"). */
export function clearAccounts() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  write(EMPTY);
}

export function findLogin(id: string): string {
  return read().accounts.find((a) => a.id === id)?.email ?? "";
}

/* ---------------------------------------------------------------- opening the dialog */

export type AuthMode = "signup" | "signin";
export const AUTH_EVENT = "travelbuddy:auth";
export interface AuthRequest { mode: AuthMode; login?: string }

/** Open the sign-in / create-account dialog from anywhere (AuthHost listens). */
export function openAuth(mode: AuthMode, login?: string) {
  window.dispatchEvent(new CustomEvent<AuthRequest>(AUTH_EVENT, { detail: { mode, login } }));
}
