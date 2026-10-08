"use client";

// "Ask TravelBuddy" chat (SPEC §6, §7). Gemini understands the question and words the answer; every
// time, fare and trust % comes from our backend tools (routing + Pakka Check), and the backend
// checks the reply's numbers. Voice STT transcribes speech into chat; Voice TTS reads answers aloud.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  type ChatOption,
  type ChatProblem,
  type ChatReply,
  getVoiceTTS,
  sendChat,
  sendVoiceSTT,
} from "@/lib/api";
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

const PLAN_LABEL: Record<ChatOption["label"], string> = {
  fastest: "Fastest",
  optimal: "Optimal",
  cheapest: "Cheapest",
};

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
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy, recording, transcribing]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    return () => {
      stopAudio();
      mediaStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopAudio() {
    if (audioPlayer.current) {
      audioPlayer.current.pause();
      audioPlayer.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingIdx(null);
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Entry[] = [...entries, { role: "user", text: q }];
    setEntries(next);
    setText("");
    setBusy(true);
    const history: ChatMessage[] = next
      .filter((e) => !("error" in e && e.error))
      .map((e) => ({ role: e.role, text: e.text }));
    try {
      const reply = await sendChat(history, journeyId());
      setEntries((cur) => [...cur, { role: "assistant", text: reply.reply, reply }]);
    } catch {
      setEntries((cur) => [
        ...cur,
        {
          role: "assistant",
          error: true,
          text: "I can't reach the TravelBuddy server. Is the backend running on port 8000?",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // --- Voice Input (STT) ---
  async function toggleRecording() {
    if (recording) {
      mediaRecorder.current?.stop();
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not supported");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      audioChunks.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorder.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mr.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunks.current, { type: mr.mimeType || "audio/webm" });
        if (audioBlob.size > 0) {
          setTranscribing(true);
          try {
            const res = await sendVoiceSTT(audioBlob);
            if (res.text && res.text.trim()) {
              const spoken = res.text.trim();
              setText(spoken);
              ask(spoken);
            }
          } catch (err) {
            console.warn("Backend STT error:", err);
          } finally {
            setTranscribing(false);
          }
        }
      };

      mr.start();
      setRecording(true);
    } catch (err) {
      console.warn("MediaRecorder unavailable, trying Web Speech API fallback:", err);
      fallbackBrowserSpeechRecognition();
    }
  }

  function fallbackBrowserSpeechRecognition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windowWithSpeech = window as any;
    const SpeechRec = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Microphone permission or browser speech recognition is required.");
      return;
    }
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-IN";
    setRecording(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript?.trim()) {
        const spoken = transcript.trim();
        setText(spoken);
        ask(spoken);
      }
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    rec.start();
  }

  // --- Voice Output (TTS) ---
  async function toggleSpeak(idx: number, speakText: string) {
    if (playingIdx === idx) {
      stopAudio();
      return;
    }

    stopAudio();
    setPlayingIdx(idx);

    try {
      const tts = await getVoiceTTS(speakText);
      if (tts.audio_base64 && !tts.fallback_to_browser) {
        const player = new Audio(`data:${tts.mime};base64,${tts.audio_base64}`);
        audioPlayer.current = player;
        player.onended = () => setPlayingIdx(null);
        player.onerror = () => speakBrowser(speakText, idx);
        await player.play();
        return;
      }
    } catch (err) {
      console.warn("Backend TTS failed, using browser synthesis fallback:", err);
    }

    speakBrowser(speakText, idx);
  }

  function speakBrowser(speakText: string, idx: number) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(speakText);
      // Auto-detect Devanagari script for Hindi/Marathi
      const isDevanagari = /[\u0900-\u097F]/.test(speakText);
      utter.lang = isDevanagari ? "hi-IN" : "en-IN";
      utter.onend = () => setPlayingIdx(null);
      utter.onerror = () => setPlayingIdx(null);
      window.speechSynthesis.speak(utter);
    } else {
      setPlayingIdx(null);
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
                <p className="text-[11px] opacity-80">Voice & Routes · English, हिंदी, मराठी</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    stopAudio();
                    setEntries([]);
                  }}
                  aria-label="Clear chat"
                  className="rounded-lg p-1.5 hover:bg-white/15"
                >
                  <Icon name="restart_alt" className="text-[20px]" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  setOpen(false);
                }}
                aria-label="Close assistant"
                className="rounded-lg p-1.5 hover:bg-white/15"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
          </header>

          <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface px-3 py-4">
            {entries.length === 0 && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-container-lowest p-3 text-sm shadow-card">
                  Hi! Ask me to plan a trip, or whether a line or station has a problem right now.
                  Tap the 🎤 <strong>mic</strong> to speak or type below.
                </div>
                <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-outline">Try</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full bg-container-lowest px-3 py-1.5 text-left text-[13px] font-medium text-primary shadow-card hover:bg-primary-fixed"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((e, i) =>
              e.role === "user" ? (
                <p
                  key={i}
                  className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-on-primary"
                >
                  {e.text}
                </p>
              ) : (
                <AssistantBubble
                  key={i}
                  entry={e}
                  isPlaying={playingIdx === i}
                  onToggleSpeak={() => toggleSpeak(i, e.text)}
                  onClose={() => setOpen(false)}
                />
              ),
            )}

            {busy && (
              <div
                className="flex items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-container-lowest px-3 py-3 shadow-card"
                aria-label="Thinking"
              >
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-outline"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Voice status notifications */}
          {recording && (
            <div className="flex items-center justify-between border-t border-hairline-soft bg-error/10 px-3 py-1.5 text-xs font-semibold text-error">
              <span className="flex items-center gap-1.5 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-error" /> Listening... Speak now (“Thane se Dadar...”)
              </span>
              <button
                type="button"
                onClick={toggleRecording}
                className="underline hover:opacity-80"
              >
                Done
              </button>
            </div>
          )}

          {transcribing && (
            <div className="flex items-center gap-1.5 border-t border-hairline-soft bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Icon name="graphic_eq" className="text-[16px] animate-pulse" />
              <span>Transcribing with Gemini...</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
            className="flex items-end gap-2 border-t border-hairline-soft bg-container-lowest p-3"
          >
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(text);
                }
              }}
              rows={1}
              maxLength={500}
              placeholder="Speak or type: “Thane to Wankhede, under ₹150”"
              aria-label="Message"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-xl bg-container px-3 py-2.5 text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {/* 🎤 Voice Mic Button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={busy || transcribing}
              aria-label={recording ? "Stop listening" : "Speak with voice"}
              title={recording ? "Tap to finish speaking" : "Tap to speak (English, हिंदी, मराठी)"}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all ${
                recording
                  ? "bg-error text-on-error animate-pulse scale-105 shadow-md"
                  : "bg-surface-2 text-on-surface hover:bg-container-high"
              } disabled:opacity-40`}
            >
              <Icon name={recording ? "stop" : transcribing ? "graphic_eq" : "mic"} className="text-[20px]" />
            </button>

            {/* Send Button */}
            <button
              type="submit"
              disabled={busy || !text.trim() || recording}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-on-primary transition-opacity disabled:opacity-40"
            >
              <Icon name="send" className="text-[20px]" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function AssistantBubble({
  entry,
  isPlaying,
  onToggleSpeak,
  onClose,
}: {
  entry: Extract<Entry, { role: "assistant" }>;
  isPlaying: boolean;
  onToggleSpeak: () => void;
  onClose: () => void;
}) {
  const r = entry.reply;
  return (
    <div className="flex max-w-[92%] flex-col gap-2 self-start">
      <div
        className={`whitespace-pre-wrap rounded-2xl rounded-bl-sm p-3 text-sm shadow-card ${
          entry.error ? "bg-error-container text-on-error-container" : "bg-container-lowest"
        }`}
      >
        <p>{entry.text}</p>

        {/* 🔊 Speaker button to read reply aloud */}
        {!entry.error && (
          <div className="mt-2 flex items-center justify-between border-t border-hairline-soft pt-1.5">
            <button
              type="button"
              onClick={onToggleSpeak}
              aria-label={isPlaying ? "Stop speech" : "Listen aloud"}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${
                isPlaying
                  ? "bg-primary text-on-primary animate-pulse"
                  : "text-primary hover:bg-primary-fixed"
              }`}
            >
              <Icon name={isPlaying ? "volume_off" : "volume_up"} className="text-[15px]" />
              <span>{isPlaying ? "Stop" : "Listen"}</span>
            </button>
          </div>
        )}
      </div>

      {r?.trip && r.trip.options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {r.trip.options.map((o) => (
            <OptionCard key={o.label} option={o} />
          ))}
          <Link
            href={tripHref(r.trip.traveller)}
            onClick={onClose}
            className="flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-[13px] font-semibold text-on-primary hover:bg-primary-container"
          >
            Open full route details <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        </div>
      )}

      {r?.problems && r.problems.length > 0 && !r.trip && (
        <ul className="flex flex-col gap-1">
          {r.problems.slice(0, 4).map((p) => (
            <ProblemRow key={p.event_id} p={p} />
          ))}
        </ul>
      )}

      {r && r.source !== "gemini" && (
        <p className="flex items-center gap-1 px-1 text-[11px] text-outline">
          <Icon name="info" className="text-[14px]" />
          {r.source === "fallback"
            ? "AI is busy or offline, so this is a basic answer from live data."
            : "Answer simplified so every number matches live data."}
        </p>
      )}
    </div>
  );
}

function OptionCard({ option: o }: { option: ChatOption }) {
  const problem = o.live_problems[0];
  return (
    <div
      className={`rounded-xl bg-container-lowest p-2.5 shadow-card ${o.recommended ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
          {PLAN_LABEL[o.label]}
          {o.recommended ? " · recommended" : ""}
        </span>
        <span className="text-[13px] font-semibold">
          {o.duration_min} min · ₹{o.cost_inr}
        </span>
      </div>
      <p className="mt-0.5 text-[13px] font-medium">{o.route}</p>
      <p className="text-[12px] text-on-surface-variant">
        {o.depart} → {o.arrive} · {o.changes} change{o.changes === 1 ? "" : "s"} · {o.walk_min} min walk
      </p>
      {problem && (
        <p
          className={`mt-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${
            STATUS_STYLE[problem.status] ?? ""
          }`}
        >
          {o.blocked_by_confirmed_problem ? "Blocked: " : ""}
          {problem.title} · {problem.status} {problem.trust_pct}%
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
