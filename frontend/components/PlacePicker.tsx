"use client";

// Place picker for the trip form: type to search, or open the list with the arrow button.
// Replaces the browser's plain <datalist> with a list that shows what each place is (metro station,
// local train station, place), highlights the match and works with the keyboard
// (↑ ↓ to move, Enter to pick, Esc to close). Same value / onChange as a normal text input.

import { useId, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/JourneyPlanner";
import { findPlace, PLACE_OPTIONS, type PlaceOption } from "@/lib/places";
import Icon from "./Icon";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const KIND = {
  metro: { icon: "subway", cls: "bg-secondary-container text-on-secondary-container", label: "kindMetro" },
  local: { icon: "train", cls: "bg-tertiary-fixed text-tertiary", label: "kindLocal" },
  place: { icon: "location_on", cls: "bg-primary-soft text-primary-ink", label: "kindPlace" },
} as const;

function kindOf(p: PlaceOption): keyof typeof KIND {
  return p.kind === "place" ? "place" : p.mode === "metro" ? "metro" : "local";
}

/** The part of the name that matches what was typed, in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-primary-soft px-0.5 font-bold text-primary-ink">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function PlacePicker({ value, onChange, placeholder, label, lead, compact = false }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string;
  /** Left marker: the round dot for "From", the pin for "To". */
  lead: React.ReactNode;
  /** Smaller field (the optional stop on the way). */
  compact?: boolean;
}) {
  const t = useT(M);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // While the list is open with the arrow, show everything; once the user types, filter.
  const [typed, setTyped] = useState(false);

  const known = value === "" || Boolean(findPlace(value));
  const options = useMemo(() => {
    const q = norm(value);
    if (!typed || !q) return PLACE_OPTIONS;
    const starts = PLACE_OPTIONS.filter((p) => norm(p.label).startsWith(q));
    const has = PLACE_OPTIONS.filter((p) => !norm(p.label).startsWith(q) && norm(p.label).includes(q));
    return [...starts, ...has];
  }, [value, typed]);
  const shown = options.slice(0, 200);

  function pick(p: PlaceOption) {
    onChange(p.label);
    setOpen(false);
    setTyped(false);
    inputRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
  }

  return (
    <div className="relative flex flex-col gap-1"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <div className={`flex items-center gap-3 rounded-xl border bg-container-low pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-primary ${
        compact ? "min-h-12" : "min-h-14"} ${known ? "border-transparent" : "border-error"}`}>
        <span className="shrink-0">{lead}</span>
        <input ref={inputRef} value={value} placeholder={placeholder} aria-label={label} autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
          onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); setActive(0); }}
          onFocus={() => setActive(0)}
          onKeyDown={onKey}
          className={`min-w-0 flex-1 bg-transparent placeholder:text-outline focus:outline-none ${compact ? "text-body" : "text-subtitle"}`} />
        {value && (
          <button type="button" onClick={() => { onChange(""); setTyped(false); inputRef.current?.focus(); }} aria-label={t("clear", { label })}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-outline hover:bg-container hover:text-on-surface">
            <Icon name="close" className="text-[20px]" />
          </button>
        )}
        <button type="button" tabIndex={-1} aria-label={t("openList")} aria-expanded={open} aria-controls={listId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setTyped(false); setActive(0); setOpen((o) => !o); inputRef.current?.focus(); }}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg transition hover:bg-container ${open ? "bg-container text-primary" : "text-on-surface-variant"}`}>
          <Icon name="expand_more" className={`text-[28px] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="anim-pop absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-2xl bg-container-lowest shadow-float ring-1 ring-hairline"
          style={{ transformOrigin: "top center" }}>
          <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-2 text-caption text-on-surface-variant">
            <span>{typed && value.trim() ? t("matches", { n: options.length }) : t("allPlaces", { n: PLACE_OPTIONS.length })}</span>
            <span className="hidden sm:inline">{t("keysHint")}</span>
          </div>
          <ul id={listId} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto overscroll-contain p-1.5">
            {shown.length === 0 && <li className="px-3 py-4 text-center text-small text-on-surface-variant">{t("noMatch")}</li>}
            {shown.map((p, i) => {
              const k = KIND[kindOf(p)];
              const on = i === active;
              const chosen = p.label === value;
              return (
                <li key={p.label} id={`${listId}-${i}`} role="option" aria-selected={chosen}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(p)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 ${on ? "bg-container-low" : ""}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${k.cls}`}><Icon name={k.icon} className="text-[20px]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold"><Highlight text={p.label} query={typed ? value : ""} /></span>
                    <span className="block text-caption text-on-surface-variant">{t(k.label)}</span>
                  </span>
                  {chosen && <Icon name="check_circle" fill className="shrink-0 text-[20px] text-primary" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!known && <span className="text-caption text-error">{t("notCovered")}</span>}
    </div>
  );
}
