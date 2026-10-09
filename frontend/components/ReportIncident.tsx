"use client";

// Report a Transit & Traffic Incident — built from the team's design (citizen incident console).
// REAL: category/description/station/direction → POST /reports (Pakka Check), the Nearby Active Feed
// (live events) and its "I see this too" confirmations. SAMPLE: voice memo, media, reputation.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { stations, submitReport, type ReportOut } from "@/lib/api";
import { eventTitle, evidenceSummary, pct, STATUS_ORDER, STATUS_STYLE, TYPE_LABEL } from "@/lib/format";
import { categories, corridors, defaultDescription, directions, location, page, radarLayers, reputation, sampleStats, voiceMemo } from "@/lib/mockReport";
import { reporterId } from "@/lib/reporter";
import type { DisruptionEvent } from "@/lib/types";
import { useLiveEvents, useRefreshLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";

const DRAFT_KEY = "travelbuddy.reportDraft";
const MAX_CHARS = 500;

const STATION_OPTIONS = Object.entries(stations)
  .filter(([, s]) => s.mode !== "bus")
  .map(([id, s]) => ({ id, label: `${s.name}${s.mode === "metro" ? "" : " (local)"}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

type Result = { ok: true; out: ReportOut } | { ok: false; msg: string };

export default function ReportIncident() {
  const live = useLiveEvents();
  const refresh = useRefreshLiveEvents();
  const [category, setCategory] = useState(categories[1].id);
  const [description, setDescription] = useState(defaultDescription);
  const [useTranscript, setUseTranscript] = useState(true);
  const [stationId, setStationId] = useState(location.defaultStation);
  const [corridor, setCorridor] = useState(corridors[0]);
  const [direction, setDirection] = useState<(typeof directions)[number]>("Northbound");
  const [media, setMedia] = useState<{ name: string; url: string; video: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  // Restore a saved draft (browser only).
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch { /* storage blocked */ }
    if (!raw) return;
    const timer = setTimeout(() => {
      try {
        const d = JSON.parse(raw!);
        if (d.category) setCategory(d.category);
        if (typeof d.description === "string") setDescription(d.description);
        if (d.stationId && stations[d.stationId]) setStationId(d.stationId);
        if (d.corridor) setCorridor(d.corridor);
        if (d.direction) setDirection(d.direction);
      } catch { /* ignore a broken draft */ }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const station = stations[stationId];
  const cat = categories.find((c) => c.id === category)!;
  const events = live?.events ?? [];
  const backend = live?.source === "backend";

  const stats = backend
    ? {
        active: String(events.length),
        verified: String(events.filter((e) => e.status === "confirmed").length),
        caught: String(events.filter((e) => e.status === "coordinated" || e.status === "ignored").length),
      }
    : null;

  async function submit() {
    setBusy(true);
    setResult(null);
    const text = [
      description.trim(),
      useTranscript ? `Voice: ${voiceMemo.transcript}` : "",
      `${corridor}, ${direction}`,
    ].filter(Boolean).join(" | ").slice(0, MAX_CHARS);
    try {
      const out = await submitReport({
        reporter_id: reporterId(), text, type: cat.type, severity: cat.severity,
        affected: { stop_ids: [stationId], line_ids: [], transfer_ids: [] },
      });
      setResult({ ok: true, out });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      refresh();
    } catch (err) {
      setResult({ ok: false, msg: backend ? String(err instanceof Error ? err.message : err) : "Couldn't reach Pakka Check — start the backend to send reports." });
    } finally {
      setBusy(false);
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ category, description, stationId, corridor, direction }));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch { /* storage blocked */ }
  }

  return (
    <main className="flex w-full flex-col px-4 pb-6 md:px-6">
      {/* ---- Header ---- */}
      <div className="mb-5 flex flex-col gap-2 pt-4">
        <div className="flex items-center gap-1 text-micro font-bold text-on-surface-variant">
          {page.breadcrumb.map((b, i) => (
            <span key={b} className="flex items-center gap-1">
              {i > 0 && <Icon name="chevron_right" className="text-[14px] text-outline" />}
              {i === 0 ? <Link href="/" className="hover:text-primary">{b}</Link>
                : <span className={i === page.breadcrumb.length - 1 ? "font-semibold text-primary" : ""}>{b}</span>}
            </span>
          ))}
        </div>
        <div className="mt-1 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>
              <span className="flex items-center gap-1 rounded-full bg-primary-fixed px-1 py-0.5 eyebrow text-on-primary-fixed">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" /> {page.badge}
              </span>
              <span className="rounded-full bg-container-high px-1 py-0.5 text-micro font-bold text-on-surface-variant">{page.synced}</span>
            </div>
            <p className="text-sm text-on-surface-variant">{page.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-xl bg-container-lowest p-1 shadow-sm lg:self-auto">
            <HeaderStat label={stats ? "Reported" : "Active Today"} value={stats?.active ?? sampleStats.active} cls="text-primary" />
            <div className="h-7 w-px bg-container-high" />
            <HeaderStat label={stats ? "Verified" : "Verified <3m"} value={stats?.verified ?? sampleStats.verified} cls="text-on-surface" />
            <div className="h-7 w-px bg-container-high" />
            <HeaderStat label={stats ? "Caught / ignored" : "Alerted"} value={stats?.caught ?? sampleStats.alerted} cls="text-secondary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-12">
        {/* ================================================= form */}
        <div className="flex flex-col gap-5 lg:col-span-7">
          {/* 1. Category */}
          <section className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <StepTitle n={1} title="Select Incident Classification" />
              <span className="text-micro font-bold text-on-surface-variant">Tap to select category</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Incident category">
              {categories.map((c) => {
                const on = c.id === category;
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c.id)}
                    className={`group relative flex flex-col gap-1 rounded-xl p-4 text-left transition-all ${on ? "bg-primary/10 shadow-sm" : "bg-container-low hover:bg-container"}`}>
                    {on && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" />}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg shadow-sm transition-transform group-hover:scale-105 ${on ? "bg-primary text-on-primary" : `bg-container-lowest ${c.iconCls}`}`}>
                      <Icon name={c.icon} className="text-[24px]" />
                    </div>
                    <div className={`mt-1 text-xs font-bold ${on ? "text-primary" : ""}`}>{c.label}</div>
                    <p className="text-small leading-snug text-on-surface-variant">{c.text}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Telemetry */}
          <section className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm">
            <StepTitle n={2} title="Multimodal Incident Telemetry" />
            <VoiceMemo use={useTranscript} onUse={setUseTranscript} />
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between">
                <span className="text-xs font-semibold">Written Description &amp; Additional Landmarks</span>
                <span className="text-micro font-bold text-on-surface-variant">{description.length} / {MAX_CHARS} characters</span>
              </span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, MAX_CHARS))} rows={3}
                placeholder="Provide specific landmark details, lane directions, or vehicle numbers... (any language)"
                className="w-full rounded-xl bg-container p-4 text-small placeholder:text-outline transition-colors focus:bg-container-lowest focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <MediaPicker media={media} setMedia={setMedia} />
          </section>

          {/* 3. Location */}
          <section className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <StepTitle n={3} title="Location & Corridor Geotag" />
              <span className="flex items-center gap-1 rounded-lg bg-container px-2 py-1 text-micro font-semibold text-primary">
                <Icon name="edit_location_alt" className="text-[16px]" /> Refine Pin
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-container p-2">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
                <Icon name="near_me" className="text-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs font-bold">{location.title}</span>
                  <span className="rounded bg-primary-fixed px-1.5 py-0.5 text-micro font-bold text-on-primary-fixed">GEOTAGGED</span>
                </div>
                <p className="truncate text-small text-on-surface-variant">{location.sub}</p>
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-xs font-semibold">
                <span>Linked Station (used to verify and reroute)</span>
                <span className="text-micro font-bold text-primary">Required by Pakka Check</span>
              </span>
              <span className="relative">
                <Icon name="train" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-primary" />
                <select value={stationId} onChange={(e) => setStationId(e.target.value)}
                  className="h-11 w-full cursor-pointer appearance-none rounded-xl bg-container pl-10 pr-10 text-small focus:outline-none focus:ring-2 focus:ring-primary">
                  {STATION_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-outline" />
              </span>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold">Transit Arterial Corridor</span>
                <span className="relative">
                  <select value={corridor} onChange={(e) => setCorridor(e.target.value)}
                    className="h-11 w-full cursor-pointer appearance-none rounded-xl bg-container px-4 text-small focus:outline-none focus:ring-2 focus:ring-primary">
                    {corridors.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-outline" />
                </span>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold">Direction of Movement Affected</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-container p-1" role="radiogroup" aria-label="Direction">
                  {directions.map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}
                      className={`rounded-lg py-2 text-center text-micro ${direction === d ? "bg-container-lowest font-bold text-primary shadow-sm" : "font-medium text-on-surface-variant hover:text-on-surface"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 4. Submit */}
          <section className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm">
            {result && <ResultBanner result={result} />}
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button type="button" onClick={submit} disabled={busy || description.trim().length < 3}
                  className="flex h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 text-sm font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-50 sm:flex-initial">
                  <Icon name="send" className="text-[20px]" /> {busy ? "Sending…" : "Submit Incident Report"}
                </button>
                <button type="button" onClick={saveDraft} className="h-12 rounded-xl bg-container px-4 text-sm font-semibold transition-colors hover:bg-container-high">
                  {draftSaved ? "Saved ✓" : "Save Draft"}
                </button>
              </div>
              <div className="flex items-center gap-1 text-micro font-bold text-outline">
                <Icon name="verified_user" className="text-[18px] text-primary" /> Filed at {station?.name ?? stationId} · {TYPE_LABEL[cat.type] ?? cat.type}
              </div>
            </div>
            <div className="flex items-start gap-1 border-t border-container-high/60 pt-2">
              <Icon name="info" className="mt-0.5 text-[16px] text-outline" />
              <p className="text-small leading-relaxed text-on-surface-variant">
                Reports are cross-checked against other commuters, news and official notices. A new reporter counts for little until
                others confirm; near-identical bursts from new accounts are flagged as suspicious and never reroute anyone.
              </p>
            </div>
          </section>
        </div>

        {/* ================================================= side */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-20 lg:col-span-5">
          <section className="flex flex-col overflow-hidden rounded-xl bg-container-lowest shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-1">
                <Icon name="radar" className="text-[20px] text-primary" />
                <span className="text-lg font-bold">Live Sector Incident Radar</span>
              </div>
              <span className="rounded-full bg-secondary-fixed px-2 py-0.5 text-micro font-semibold text-[#111c2d]">
                {backend ? `Demo clock ${live?.asOf}` : "Sample data"}
              </span>
            </div>
            <div className="relative h-72 w-full overflow-hidden bg-container">
              <MapView showNetwork events={events} here={station ? [station.lat, station.lon] : null} />
              <div className="pointer-events-none absolute left-14 top-3 z-[500] flex flex-wrap gap-1.5">
                {radarLayers.map((l, i) => (
                  <span key={l} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-micro shadow-sm backdrop-blur ${i === 0 ? "bg-container-lowest/90 font-bold text-primary" : "bg-container-lowest/80 font-medium text-on-surface-variant"}`}>
                    {i === 0 && <span className="h-2 w-2 rounded-full bg-primary" />} {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between bg-container-low p-2 text-micro font-bold text-on-surface-variant">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Pin: {station?.name ?? "—"}</span>
              <span className="font-mono text-micro">{station ? `${station.lat.toFixed(4)}° N, ${station.lon.toFixed(4)}° E` : ""}</span>
            </div>
          </section>

          <NearbyFeed events={events} backend={backend} />

          <section className="flex flex-col gap-2 rounded-xl bg-gradient-to-br from-container-low via-container to-secondary-container/30 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
                  <Icon name="workspace_premium" className="text-[18px]" />
                </div>
                <div className="flex flex-col">
                  <span className="eyebrow">Reputation Tier</span>
                  <span className="text-xs font-bold">{reputation.tier}</span>
                </div>
              </div>
              <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-micro font-bold text-on-primary-fixed">{reputation.badge}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-container-lowest/80 p-2 backdrop-blur">
              <div className="flex flex-col">
                <span className="text-micro font-bold text-on-surface-variant">Citizen Impact Reward</span>
                <span className="text-sm font-bold text-primary">{reputation.reward}</span>
              </div>
              <button type="button" className="rounded-lg bg-primary px-2 py-1.5 text-micro font-semibold text-on-primary transition-colors hover:bg-primary-container">
                Redeem to Card
              </button>
            </div>
            <div className="flex items-center justify-between text-micro font-bold text-on-surface-variant">
              <span>{reputation.accuracy}</span>
              <span>{reputation.reports}</span>
            </div>
            <p className="text-micro text-outline">Sample profile — accounts aren&apos;t part of the prototype.</p>
          </section>
        </div>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- pieces */

function HeaderStat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex flex-col px-2 py-1">
      <span className="text-micro font-bold text-on-surface-variant">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-fixed text-micro font-bold text-on-primary-fixed">{n}</span>
      <span className="text-lg font-bold">{title}</span>
    </div>
  );
}

const WAVE = [3, 5, 6, 3, 7, 4, 5, 6, 3, 5, 4, 6, 2, 4, 6, 3, 5, 2, 4, 2];

function VoiceMemo({ use, onUse }: { use: boolean; onUse: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-container-low p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1">
          <Icon name="mic" className="text-[20px] text-primary" />
          <span className="text-xs font-semibold">Commuter Voice Memo Recording</span>
          <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-micro font-bold uppercase text-on-primary-fixed">Sample</span>
        </div>
        <button type="button" onClick={() => onUse(false)} title="Don't attach the voice memo" aria-label="Remove voice memo"
          className="rounded-lg p-1.5 text-outline transition-colors hover:bg-container-high hover:text-error">
          <Icon name="delete" className="text-[18px]" />
        </button>
      </div>
      <div className="flex items-center gap-4 rounded-lg bg-container-lowest p-2 shadow-sm">
        <button type="button" aria-label="Play sample memo" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
          <Icon name="play_arrow" className="text-[20px]" fill />
        </button>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex h-7 items-center gap-1">
            {WAVE.map((h, i) => (
              <span key={i} className={`w-1 rounded ${i < 8 ? "bg-primary" : "bg-container-highest"}`} style={{ height: `${h * 4}px` }} />
            ))}
          </div>
          <div className="flex items-center justify-between text-micro font-bold text-on-surface-variant">
            <span>{voiceMemo.length}</span><span>{voiceMemo.max}</span>
          </div>
        </div>
        <div className="hidden items-center gap-1.5 rounded-md bg-secondary-container px-1 py-1 text-micro font-bold text-[#111c2d] sm:flex">
          <Icon name="graphic_eq" className="text-[14px]" /> {voiceMemo.rate}
        </div>
      </div>
      <label className={`flex cursor-pointer items-start gap-1 rounded-lg bg-container px-2 py-1 ${use ? "" : "opacity-60"}`}>
        <Icon name="neurology" className="mt-0.5 text-[16px] text-outline" />
        <span className="flex-1">
          <span className="text-micro font-bold text-on-surface-variant">Speech-to-Text: </span>
          <span className="text-small italic">&ldquo;{voiceMemo.transcript}&rdquo;</span>
        </span>
        <input type="checkbox" checked={use} onChange={(e) => onUse(e.target.checked)} className="mt-1 accent-[var(--primary)]" aria-label="Attach transcript to report" />
      </label>
    </div>
  );
}

function MediaPicker({ media, setMedia }: {
  media: { name: string; url: string; video: boolean }[];
  setMedia: React.Dispatch<React.SetStateAction<{ name: string; url: string; video: boolean }[]>>;
}) {
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  function add(files: FileList | null, video: boolean) {
    if (!files) return;
    const next = [...files].slice(0, 4 - media.length).map((f) => {
      const url = URL.createObjectURL(f);
      urls.current.push(url);
      return { name: f.name, url, video };
    });
    setMedia((m) => [...m, ...next].slice(0, 4));
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Media &amp; Photographic Evidence</span>
        <span className="text-micro font-bold text-on-surface-variant">Max 4 photos or 15s clip · stays on your device</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {media.map((m) => (
          <div key={m.url} className="group relative aspect-video overflow-hidden rounded-xl bg-container-high shadow-sm">
            {m.video ? <video src={m.url} className="h-full w-full object-cover" muted /> : (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of a user-picked file
              <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
            )}
            <button type="button" onClick={() => setMedia((all) => all.filter((x) => x.url !== m.url))} aria-label={`Remove ${m.name}`}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-container-lowest text-error opacity-0 transition-opacity group-hover:opacity-100">
              <Icon name="close" className="text-[16px]" />
            </button>
            <span className="absolute bottom-1 left-1.5 max-w-[90%] truncate rounded bg-black/70 px-1.5 py-0.5 text-micro font-bold text-white">{m.name}</span>
          </div>
        ))}
        {media.length < 4 && (
          <>
            <label className="group flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-container p-2 text-center transition-colors hover:bg-container-high">
              <Icon name="add_a_photo" className="text-[24px] text-outline transition-colors group-hover:text-primary" />
              <span className="text-micro font-semibold text-on-surface-variant">Add Snapshot</span>
              <span className="text-micro text-outline">JPG, PNG &lt; 10MB</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files, false)} />
            </label>
            <label className="group flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-container p-2 text-center transition-colors hover:bg-container-high">
              <Icon name="videocam" className="text-[24px] text-outline transition-colors group-hover:text-primary" />
              <span className="text-micro font-semibold text-on-surface-variant">15s Dashcam Clip</span>
              <span className="text-micro text-outline">MP4, MOV</span>
              <input type="file" accept="video/*" className="hidden" onChange={(e) => add(e.target.files, true)} />
            </label>
          </>
        )}
        <div className="flex aspect-video flex-col justify-between rounded-xl bg-container-low p-1">
          <div className="flex items-center gap-1 text-primary">
            <Icon name="verified" className="text-[16px]" />
            <span className="text-micro font-bold uppercase">Not uploaded</span>
          </div>
          <p className="text-micro leading-tight text-on-surface-variant">Photos are previewed only; they aren&apos;t sent in this prototype.</p>
          <span className="text-micro text-outline">{media.length} / 4 attached</span>
        </div>
      </div>
    </div>
  );
}

function ResultBanner({ result }: { result: Result }) {
  if (!result.ok) return <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">{result.msg}</p>;
  const r = result.out;
  const style = STATUS_STYLE[r.status];
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="check_circle" /> Received by Pakka Check at {r.reported_at} — {r.created_event ? "new report started" : "added to an existing report"}
      </p>
      <p>
        Current verdict: <b style={{ color: style.color }}>{style.label}</b> at <b>{pct(r.confidence)}</b>.{" "}
        {r.status === "confirmed" ? "Routes through this spot will now avoid it." : "It will turn confirmed once other commuters, news or an official notice agree."}
      </p>
    </div>
  );
}

function NearbyFeed({ events, backend }: { events: DisruptionEvent[]; backend: boolean }) {
  const refresh = useRefreshLiveEvents();
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const feed = useMemo(
    () => events.filter((e) => e.status !== "expired")
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.last_seen.localeCompare(a.last_seen)),
    [events],
  );

  async function seeToo(ev: DisruptionEvent) {
    try {
      const out = await submitReport({
        reporter_id: reporterId(), text: `I can confirm: ${eventTitle(ev)}`,
        type: ev.type, severity: ev.severity,
        affected: { stop_ids: ev.affected.stop_ids, line_ids: ev.affected.line_ids, transfer_ids: ev.affected.transfer_ids },
      });
      setConfirmed((c) => ({ ...c, [ev.event_id]: `Added · now ${pct(out.confidence)}` }));
      refresh();
    } catch {
      setConfirmed((c) => ({ ...c, [ev.event_id]: backend ? "Couldn't add" : "Backend offline" }));
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-container-lowest p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-container-high/60 pb-1">
        <div className="flex items-center gap-1">
          <Icon name="stream" className="text-[20px] text-secondary" />
          <span className="text-lg font-bold">Nearby Active Feed</span>
        </div>
        <Link href="/admin" className="text-micro font-semibold text-primary hover:underline">View All ({feed.length})</Link>
      </div>
      {feed.length === 0 && <p className="py-2 text-sm text-on-surface-variant">Nothing reported right now.</p>}
      <div className="mt-1 flex flex-col gap-1">
        {feed.slice(0, 4).map((ev) => {
          const style = STATUS_STYLE[ev.status];
          const crowd = ev.evidence.filter((x) => x.source_type === "crowd" && !x.contradicts).length;
          const official = ev.evidence.some((x) => x.source_type === "official" && !x.contradicts);
          const burst = ev.flags.includes("coordinated_burst");
          return (
            <div key={ev.event_id} className="flex flex-col gap-1.5 rounded-xl bg-container-low p-2 transition-colors hover:bg-container">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded px-1.5 py-0.5 text-micro font-bold uppercase text-white" style={{ backgroundColor: style.color }}>
                    {TYPE_LABEL[ev.type] ?? ev.type}
                  </span>
                  <span className="text-xs font-bold">{eventTitle(ev).split(" · ")[1]}</span>
                </div>
                <span className="shrink-0 text-micro font-bold text-outline">since {ev.first_seen}</span>
              </div>
              <p className="line-clamp-1 text-small text-on-surface-variant">{evidenceSummary(ev)} · {pct(ev.confidence)}</p>
              <div className="flex items-center justify-between pt-1">
                <div className={`flex items-center gap-1 text-micro font-bold ${burst ? "text-outline" : "text-primary"}`}>
                  <Icon name={burst ? "flag" : official ? "verified" : "groups"} className="text-[16px]" />
                  {burst ? "Suspicious burst — ignored" : official ? "Verified by official notice" : style.label === "Confirmed" ? "Community confirmed" : style.label}
                </div>
                <div className="flex items-center gap-2">
                  {backend && <Link href={`/events/${ev.event_id}`} className="text-micro font-bold text-primary hover:underline">Why?</Link>}
                  {confirmed[ev.event_id] && <span className="text-micro font-bold text-primary">{confirmed[ev.event_id]}</span>}
                  <button type="button" onClick={() => seeToo(ev)} disabled={!backend || burst} title="I see this too"
                    className="flex items-center gap-1 rounded bg-container-lowest px-2 py-0.5 text-micro font-bold shadow-sm transition-colors hover:bg-container-high disabled:opacity-50">
                    <Icon name="thumb_up" className="text-[14px] text-primary" /> {crowd}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
