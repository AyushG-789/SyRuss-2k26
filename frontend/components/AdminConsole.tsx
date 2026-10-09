"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBackendEvents,
  getPresets,
  getTimeline,
  injectPreset,
  type Preset,
  resetDemo,
  type Timeline,
  updateClock,
} from "@/lib/api";
import { eventTitle, evidenceSummary, pct, STATUS_ORDER, STATUS_STYLE } from "@/lib/format";
import type { DisruptionEvent } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/AdminConsole";

const POLL_MS = 1000;
const SPEEDS = [
  { value: 30, label: "speed30" },
  { value: 60, label: "speed60" },
  { value: 120, label: "speed120" },
] as const;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const FLAG_LABEL: Record<string, "flag.coordinated_burst" | "flag.contradicted" | "flag.repeat_reporter"> = {
  coordinated_burst: "flag.coordinated_burst",
  contradicted: "flag.contradicted",
  repeat_reporter: "flag.repeat_reporter",
};

export default function AdminConsole() {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [events, setEvents] = useState<DisruptionEvent[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSpeed, setLastSpeed] = useState(60);
  const [flash, setFlash] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);   // slider position while dragging
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tr = useT(M);

  const refresh = useCallback(async () => {
    try {
      const [t, ev] = await Promise.all([getTimeline(), getBackendEvents()]);
      // The story ends at the scenario end (18:30): stop the clock there instead of running on.
      if (t.speed > 0 && toMin(t.now) >= toMin(t.end)) {
        const stopped = await updateClock({ set: t.end, speed: 0 });
        setTimeline({ ...t, ...stopped });
      } else {
        setTimeline(t);
      }
      setEvents(ev);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    getPresets().then(setPresets).catch(() => setOffline(true));
    // Poll the backend: the clock may be playing, and reports can arrive from elsewhere.
    const tick = () => void refresh();
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function act(fn: () => Promise<unknown>, message?: string) {
    setBusy(true);
    try {
      await fn();
      if (message) {
        setFlash(message);
        setTimeout(() => setFlash(null), 2500);
      }
      await refresh();
    } catch {
      setOffline(true);
    } finally {
      setBusy(false);
    }
  }

  function onSlide(value: number) {
    setDrag(value);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      void act(() => updateClock({ set: toHhmm(value) })).then(() => setDrag(null));
    }, 250);
  }

  if (offline && !timeline) return <BackendOffline />;
  if (!timeline) return <p className="mx-auto w-full max-w-6xl px-4 py-6 text-muted">{tr("connecting")}</p>;

  const playing = timeline.speed > 0;
  const start = toMin(timeline.start);
  const end = toMin(timeline.end);
  const nowMin = drag ?? Math.min(Math.max(toMin(timeline.now), start), end);
  const sorted = [...events].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const nextItem = timeline.items.find((i) => i.state === "upcoming");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4">
      {offline && (
        <p className="rounded-xl border border-bad/40 bg-bad-soft p-3 text-sm text-bad">{tr("lost")}</p>
      )}

      {/* ---- Clock ---- */}
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" aria-label={tr("demoClock")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{tr("clockLabel")}</p>
            <p className="text-5xl font-semibold tabular-nums leading-none">{toHhmm(nowMin)}</p>
            <p className="mt-1 text-sm text-muted">
              {playing ? tr("playingAt", { speed: timeline.speed }) : tr("paused")} ·{" "}
              {timeline.mode === "scripted" ? tr("scripted") : tr("manualInject")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => act(() => updateClock({ speed: playing ? 0 : lastSpeed }))}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink disabled:opacity-50"
            >
              {playing ? tr("pause") : tr("play")}
            </button>
            <select
              aria-label={tr("speed")}
              value={playing ? timeline.speed : lastSpeed}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLastSpeed(v);
                if (playing) void act(() => updateClock({ speed: v }));
              }}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            >
              {SPEEDS.map((s) => (
                <option key={s.value} value={s.value}>{tr(s.label)}</option>
              ))}
            </select>
            <button disabled={busy} onClick={() => act(() => updateClock({ advance_min: 5 }))}
              className="rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-50">{tr("plus5")}</button>
            <button disabled={busy} onClick={() => act(() => resetDemo(timeline.mode), tr("resetTo", { time: timeline.start }))}
              className="rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-50">{tr("reset")}</button>
          </div>
        </div>

        <div>
          <input
            type="range"
            min={start}
            max={end}
            step={1}
            value={nowMin}
            onChange={(e) => onSlide(Number(e.target.value))}
            aria-label={tr("demoTime")}
            className="w-full accent-[var(--brand)]"
          />
          <div className="flex justify-between text-xs tabular-nums text-muted">
            {Array.from({ length: Math.floor((end - start) / 30) + 1 }, (_, i) => start + i * 30).map((m) => (
              <button key={m} onClick={() => onSlide(m)} className="hover:text-text">{toHhmm(m)}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{tr("mode")}</span>
          {(["scripted", "manual"] as const).map((m) => (
            <button
              key={m}
              disabled={busy}
              onClick={() => act(() => resetDemo(m), m === "scripted" ? tr("scriptedLoaded") : tr("manualLoaded"))}
              aria-pressed={timeline.mode === m}
              className={`rounded-lg px-3 py-1.5 ${timeline.mode === m ? "bg-brand text-brand-ink" : "border border-line text-muted"}`}
            >
              {m === "scripted" ? tr("scripted") : tr("manual")}
            </button>
          ))}
          <span className="text-xs text-muted">{tr("switchResets")}</span>
          {flash && <span className="ml-auto rounded-lg bg-good-soft px-2 py-1 text-xs text-good">{flash}</span>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* ---- Live events ---- */}
        <section className="flex flex-col gap-2" aria-labelledby="live">
          <div className="flex items-baseline justify-between">
            <h2 id="live" className="font-semibold">{tr("liveDisruptions", { n: events.length })}</h2>
            <Link href="/routes/TR3" className="text-sm text-muted hover:text-text">{tr("seeOnMap")}</Link>
          </div>
          {sorted.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">{tr("nothingYet", { time: timeline.now })}</p>
          )}
          {sorted.map((ev) => <EventRow key={ev.event_id} ev={ev} />)}
        </section>

        <div className="flex flex-col gap-4">
          {/* ---- Inject ---- */}
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4" aria-labelledby="inject">
            <h2 id="inject" className="font-semibold">{tr("sendNow")}</h2>
            <p className="text-xs text-muted">{tr("eachButton", { time: timeline.now })}</p>
            <div className="flex flex-col gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  onClick={() => act(() => injectPreset(p.id), tr("sent", { refs: p.refs.join(", ") }))}
                  className="flex flex-col items-start rounded-xl border border-line px-3 py-2 text-left text-sm transition hover:border-brand disabled:opacity-50"
                >
                  <span>{p.label}</span>
                  <span className="text-xs text-muted">{tr("expect", { text: p.expect })}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ---- Timeline ---- */}
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4" aria-labelledby="story">
            <h2 id="story" className="font-semibold">{tr("storyTimeline")}</h2>
            {nextItem && timeline.mode === "scripted" && (
              <p className="text-xs text-brand">{tr("nextAt", { time: nextItem.t, label: nextItem.label })}</p>
            )}
            <ol className="flex max-h-96 flex-col gap-1 overflow-auto text-sm">
              {timeline.items.filter((i) => i.state !== "other_day").map((i, n) => (
                <li key={`${i.t}-${i.ref ?? n}`}
                  className={`flex gap-2 ${i.state === "done" || i.state === "history" ? "" : "text-muted"}`}>
                  <span className="w-11 shrink-0 tabular-nums">{i.t}</span>
                  <span aria-hidden>{i.state === "done" ? "✅" : i.state === "history" ? "📜" : "○"}</span>
                  <span className="line-clamp-2">
                    {i.kind === "action" ? `🧭 ${i.traveller_id}: ${i.label}` : `${KIND_ICON[i.kind]} ${i.label}`}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, string> = { report: "💬", news: "📰", official: "🏛️" };

function EventRow({ ev }: { ev: DisruptionEvent }) {
  const style = STATUS_STYLE[ev.status];
  const faded = ev.status === "expired" || ev.status === "ignored";
  const tr = useT(M);
  return (
    <article className={`flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 ${faded ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{eventTitle(ev)}</h3>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: style.color }}>
          {style.label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={Math.round(ev.confidence * 100)}
          aria-valuemin={0} aria-valuemax={100} aria-label={tr("confidence")}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: pct(ev.confidence), backgroundColor: style.color }} />
        </div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct(ev.confidence)}</span>
      </div>
      <p className="text-xs text-muted">
        {evidenceSummary(ev) || tr("noEvidence")} · {tr("firstLast", { first: ev.first_seen, last: ev.last_seen })}
        {ev.status !== "expired" ? ` · ${tr("expires", { time: ev.expires_at })}` : ""}
      </p>
      {ev.flags.filter((f) => FLAG_LABEL[f]).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ev.flags.filter((f) => FLAG_LABEL[f]).map((f) => (
            <span key={f} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{tr(FLAG_LABEL[f])}</span>
          ))}
        </div>
      )}
    </article>
  );
}

function BackendOffline() {
  const tr = useT(M);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-10">
      <h1 className="text-xl font-semibold">{tr("needBackend")}</h1>
      <p className="text-muted">{tr("startIt")}</p>
      <pre className="overflow-auto rounded-xl bg-surface-2 p-3 text-sm">cd backend{"\n"}.venv/bin/uvicorn app.main:app --reload --port 8000</pre>
    </div>
  );
}
