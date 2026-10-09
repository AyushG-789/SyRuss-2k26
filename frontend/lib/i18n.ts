"use client";

// App language: English, हिंदी or मराठी, chosen in the commuter profile (lib/profile.ts).
//
// Every component keeps its own text next to it in lib/i18n/messages/<Component>.ts:
//   const M = defineMessages({ en: { title: "Plan Your Commute" }, hi: { title: "…" }, mr: { title: "…" } });
//   const t = useT(M);  …  <h1>{t("title")}</h1>      // t("eta", { min: 5 }) fills "{min}"
// TypeScript makes hi and mr list every key of en, so nothing is left untranslated by accident.
//
// WORD GUIDE (so all screens read the same way):
//  • Use the everyday word a Mumbai commuter would say, short and friendly.
//  • If a word has no natural Hindi / Marathi equivalent, write the English word the way people
//    say it, in Devanagari: मेट्रो, लोकल, बस, स्टेशन, प्लॅटफॉर्म / प्लेटफ़ॉर्म, लाईन / लाइन, रूट,
//    लिफ्ट, स्कायवॉक, मेगा ब्लॉक, रिपोर्ट, लाइव्ह / लाइव, ॲप / ऐप, डेमो. Auto = रिक्षा (mr) / ऑटो (hi).
//  • Keep in Latin letters what is written that way on signboards or is a name/code:
//    TravelBuddy, Pakka Check, station & place names, line codes (WR, CR, BEST, Metro 1), ₹, digits, times.
//  • A technical word with no plain equivalent may add the English in brackets once,
//    e.g. "विश्वसनीयता (reliability)".
//  • Hindi uses Hindi spellings; Marathi uses Marathi ones (ॅ / ॲ / ळ, "तुम्ही", "आहे").

import { useCallback } from "react";
import { useProfile } from "./profile";

export type Lang = "en" | "hi" | "mr";
export type Vars = Record<string, string | number>;
export interface Messages<K extends string> {
  en: Record<K, string>;
  hi: Record<K, string>;
  mr: Record<K, string>;
}

export const LANGS: { value: Lang; label: string; short: string; english: string; html: string }[] = [
  { value: "en", label: "English", short: "EN", english: "English", html: "en-IN" },
  { value: "hi", label: "हिंदी", short: "हिं", english: "Hindi", html: "hi-IN" },
  { value: "mr", label: "मराठी", short: "मरा", english: "Marathi", html: "mr-IN" },
];

export function defineMessages<K extends string>(m: Messages<K>): Messages<K> {
  return m;
}

/* The language being rendered right now. LangSync in AppShell sets it during render, before any
   page renders, so plain helpers (lib/format.ts) can use it too. During hydration it is the server's
   language (English), then switches, so server and client HTML always match. */
let current: Lang = "en";
export function activeLang(): Lang {
  return current;
}
export function setActiveLang(lang: Lang) {
  current = lang;
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translate outside a component (event handlers, helpers). Falls back to English. */
export function translate<K extends string>(m: Messages<K>, key: K, vars?: Vars, lang: Lang = current): string {
  return fill(m[lang]?.[key] || m.en[key] || key, vars);
}

/** The app language, live. */
export function useLang(): Lang {
  return useProfile().appLanguage;
}

/** `t(key, vars)` for this component's messages; re-renders when the language changes. */
export function useT<K extends string>(m: Messages<K>): (key: K, vars?: Vars) => string {
  const lang = useLang();
  return useCallback((key: K, vars?: Vars) => translate(m, key, vars, lang), [m, lang]);
}

/** A lookup table in three languages that reads in the active language: TABLE[key]. */
export function perLang<T extends object>(tables: Record<Lang, T>): T {
  return new Proxy(tables.en, {
    get: (_, k) => (tables[current] as Record<PropertyKey, unknown>)[k] ?? (tables.en as Record<PropertyKey, unknown>)[k],
  });
}
