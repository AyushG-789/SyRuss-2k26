// Light / dark theme. The choice lives in the commuter profile (lib/profile.ts, localStorage) and
// is applied as <html data-theme="light|dark">; app/globals.css holds both palettes as tokens.
// No "use client" here: the root layout (a server component) needs THEME_BOOT_SCRIPT.

export type Appearance = "light" | "dark";

export const PROFILE_KEY = "travelbuddy.profile";

/**
 * Runs inline in <head> before the page paints, so a saved dark theme never flashes light
 * (also sets <html lang> to the saved app language, for screen readers and Devanagari fonts).
 * A string because it must run before React loads.
 */
export const THEME_BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PROFILE_KEY)})||"{}");var d=document.documentElement;d.dataset.theme=p.appearance==="dark"?"dark":"light";d.lang={hi:"hi-IN",mr:"mr-IN"}[p.appLanguage]||"en-IN"}catch(e){}`;

export function applyTheme(appearance: Appearance) {
  document.documentElement.dataset.theme = appearance;
}

/** Colours for map markers / lines (Leaflet needs real colour values, not CSS variables). */
export const MAP_COLORS: Record<Appearance, { brand: string; accent: string; accentFill: string; start: string; pinText: string; ring: string }> = {
  light: { brand: "#24483a", accent: "#9b7336", accentFill: "#b48a4b", start: "#4f5d55", pinText: "#ffffff", ring: "#ffffff" },
  dark: { brand: "#d9b982", accent: "#e2c184", accentFill: "#b48a4b", start: "#a4b2a8", pinText: "#101d19", ring: "#1d3028" },
};
