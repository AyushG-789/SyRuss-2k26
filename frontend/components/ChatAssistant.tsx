"use client";

// "Ask TravelBuddy" chat (SPEC §6). Gemini understands the question and words the answer; every
// time, fare and trust % comes from our backend tools (routing + Pakka Check), and the backend
// checks the reply's numbers. Works without a key too (simple built-in answers).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type ChatMessage, type ChatOption, type ChatProblem, type ChatReply, sendChat } from "@/lib/api";
import { tripHref } from "@/lib/tripUrl";
import Icon from "./Icon";

type Entry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; reply?: ChatReply; error?: boolean };

const SUGGESTIONS = [
  "Is Metro 1 running?",
  "Thane to Wankhede by 18:30, under ₹150",
  "Dadar pe kya problem hai?",
  "मला अंधेरीहून BKC ला जायचे आहे",
];

const PLAN_LABEL: Record<ChatOption["label"], string> = { fastest: "Fastest", optimal: "Optimal", cheapest: "Cheapest" };

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-error-container text-on-error-container",
  possible: "bg-tertiary-fixed text-tertiary",
  coordinated: "bg-container-high text-on-surface-variant line-through",
  ignored: "bg-container-high text-on-surface-variant",
};

function journeyId(): string | null {
  try {
    return localStorage.getItem("travelbuddy.journey");
  } catch {
    return null;
  }
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Entry[] = [...entries, { role: "user", text: q }];
    setEntries(next);
    setText("");
    setBusy(true);
    const history: ChatMessage[] = next.filter((e) => !("error" in e && e.error)).map((e) => ({ role: e.role, text: e.text }));
    try {
      const reply = await sendChat(history, journeyId());
      setEntries((cur) => [...cur, { role: "assistant", text: reply.reply, reply }]);
    } catch {
      setEntries((cur) => [...cur, { role: "assistant", error: true,
        text: "I can't reach the TravelBuddy server. Is the backend running on port 8000?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[1150] flex items-center gap-2 rounded-full bg-primary py-3 pl-4 pr-5 text-sm font-semibold text-on-primary shadow-float transition-transform hover:scale-105 active:scale-95"
        >
          <Icon name="forum" className="text-[20px]" /> Ask TravelBuddy
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="TravelBuddy assistant"
          className="fixed inset-x-0 bottom-0 z-[1150] flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-container-lowest shadow-float sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-6rem))] sm:w-[400px] sm:rounded-2xl"
        >
          <header className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-on-primary">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
                <Icon name="forum" className="text-[18px]" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Ask TravelBuddy</p>
                <p className="text-[11px] opacity-80">Routes + live Pakka Check · English, हिंदी, मराठी</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <button type="button" onClick={() => setEntries([])} aria-label="Clear chat"
                  className="rounded-lg p-1.5 hover:bg-white/15"><Icon name="restart_alt" className="text-[20px]" /></button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant"
                className="rounded-lg p-1.5 hover:bg-white/15"><Icon name="close" className="text-[20px]" /></button>
            </div>
          </header>

          <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface px-3 py-4">
            {entries.length === 0 && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-container-lowest p-3 text-sm shadow-card">
                  Hi! Ask me to plan a trip, or whether a line or station has a problem right now.
                  I only quote times, fares and trust % from TravelBuddy&apos;s live data.
                </div>
                <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-outline">Try</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)}
                      className="rounded-full bg-container-lowest px-3 py-1.5 text-left text-[13px] font-medium text-primary shadow-card hover:bg-primary-fixed">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((e, i) =>
              e.role === "user" ? (
                <p key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-on-primary">
                  {e.text}
                </p>
              ) : (
                <AssistantBubble key={i} entry={e} onClose={() => setOpen(false)} />
              ),
            )}

            {busy && <Thinking />}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); ask(text); }}
            className="flex items-end gap-2 border-t border-hairline-soft bg-container-lowest p-3"
          >
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
              rows={1}
              maxLength={500}
              placeholder="e.g. Andheri to Gateway of India, cheapest"
              aria-label="Message"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-xl bg-container px-3 py-2.5 text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-on-primary transition-opacity disabled:opacity-40">
              <Icon name="send" className="text-[20px]" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

const STEPS = ["Understanding your question…", "Checking routes and live Pakka Check data…", "Writing the answer…"];

/** Typing dots + what the assistant is doing, so a slow answer doesn't look frozen. */
function Thinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm bg-container-lowest px-3 py-2.5 shadow-card" role="status">
      <span className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-outline" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      <span className="text-[12px] text-on-surface-variant">{STEPS[step]}</span>
    </div>
  );
}

function AssistantBubble({ entry, onClose }: { entry: Extract<Entry, { role: "assistant" }>; onClose: () => void }) {
  const r = entry.reply;
  return (
    <div className="flex max-w-[92%] flex-col gap-2 self-start">
      <p className={`whitespace-pre-wrap rounded-2xl rounded-bl-sm px-3 py-2 text-sm shadow-card ${
        entry.error ? "bg-error-container text-on-error-container" : "bg-container-lowest"}`}>
        {entry.text}
      </p>

      {r?.trip && r.trip.options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {r.trip.options.map((o) => <OptionCard key={o.label} option={o} />)}
          <Link href={tripHref(r.trip.traveller)} onClick={onClose}
            className="flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-[13px] font-semibold text-on-primary hover:bg-primary-container">
            Open full route details <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        </div>
      )}

      {r?.problems && r.problems.length > 0 && !r.trip && (
        <ul className="flex flex-col gap-1">
          {r.problems.slice(0, 4).map((p) => <ProblemRow key={p.event_id} p={p} />)}
        </ul>
      )}

      {r && r.source !== "gemini" && (
        <p className="flex items-center gap-1 px-1 text-[11px] text-outline">
          <Icon name="info" className="text-[14px]" />
          {r.source === "fallback" ? "AI is busy or offline, so this is a basic answer from live data."
                : r.note?.includes("slow") ? "AI was slow, so this is a quick answer from live data." : "Answer simplified so every number matches live data."}
        </p>
      )}
    </div>
  );
}

function OptionCard({ option: o }: { option: ChatOption }) {
  const problem = o.live_problems[0];
  return (
    <div className={`rounded-xl bg-container-lowest p-2.5 shadow-card ${o.recommended ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
          {PLAN_LABEL[o.label]}{o.recommended ? " · recommended" : ""}
        </span>
        <span className="text-[13px] font-semibold">{o.duration_min} min · ₹{o.cost_inr}</span>
      </div>
      <p className="mt-0.5 text-[13px] font-medium">{o.route}</p>
      <p className="text-[12px] text-on-surface-variant">
        {o.depart} → {o.arrive} · {o.changes} change{o.changes === 1 ? "" : "s"} · {o.walk_min} min walk
      </p>
      {problem && (
        <p className={`mt-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${STATUS_STYLE[problem.status] ?? ""}`}>
          {o.blocked_by_confirmed_problem ? "Blocked: " : ""}{problem.title} · {problem.status} {problem.trust_pct}%
        </p>
      )}
    </div>
  );
}

function ProblemRow({ p }: { p: ChatProblem }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl bg-container-lowest px-2.5 py-2 shadow-card">
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{p.title}</span>
        <span className="block truncate text-[11px] text-on-surface-variant">{p.sources}</span>
      </span>
      <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[p.status] ?? ""}`}>
        {p.status === "coordinated" ? "fake burst" : p.status} {p.trust_pct}%
      </span>
    </li>
  );
}
