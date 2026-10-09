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
import { type Lang, useLang, useT } from "@/lib/i18n";
import { COMMON } from "@/lib/i18n/common";
import { M } from "@/lib/i18n/messages/ChatAssistant";
import { tripHref } from "@/lib/tripUrl";
import Icon from "./Icon";

type Entry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; reply?: ChatReply; error?: boolean };

const SUGGESTIONS = ["sugg1", "sugg2", "sugg3", "sugg4"] as const;

const STATUS_KEYS = ["confirmed", "possible", "coordinated", "ignored", "expired"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
const isStatusKey = (s: string): s is StatusKey => (STATUS_KEYS as readonly string[]).includes(s);

/** Speech language for a reply: Devanagari text is read in the app language (Marathi stays Marathi),
 *  falling back to Hindi when the app itself is in English. */
function speechLang(text: string, appLang: Lang): { code: Lang; bcp: string } {
  if (!/[\u0900-\u097F]/.test(text)) return { code: "en", bcp: "en-IN" };
  return appLang === "mr" ? { code: "mr", bcp: "mr-IN" } : { code: "hi", bcp: "hi-IN" };
}

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

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16 bits
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const t = useT(M);
  const lang = useLang();

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const scriptProcessor = useRef<ScriptProcessorNode | null>(null);
  const audioBuffers = useRef<Float32Array[]>([]);
  const recordingStartTime = useRef<number>(0);
  const mediaStream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy, recording, transcribing]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function stopRecordingCleanup() {
    if (scriptProcessor.current) {
      scriptProcessor.current.disconnect();
      scriptProcessor.current = null;
    }
    if (audioContext.current && audioContext.current.state !== "closed") {
      audioContext.current.close().catch(() => {});
      audioContext.current = null;
    }
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((t) => t.stop());
      mediaStream.current = null;
    }
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      mediaRecorder.current = null;
    }
  }

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

  // Stop any playback / recording when the chat unmounts.
  useEffect(() => {
    return () => {
      stopAudio();
      stopRecordingCleanup();
    };
  }, []);

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
          text: t("offline"),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // --- Voice Input (STT) ---
  async function toggleRecording() {
    if (recording) {
      await finishRecording();
      return;
    }
    await startRecording();
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not supported in this browser");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStream.current = stream;
      audioBuffers.current = [];
      recordingStartTime.current = Date.now();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        const ctx = new AudioCtxClass({ sampleRate: 16000 });
        audioContext.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        scriptProcessor.current = processor;

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          audioBuffers.current.push(new Float32Array(inputData));
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        setRecording(true);
        console.log("[Voice:STT] Recording started (16kHz PCM WAV mode)");
      } else {
        // Fallback to MediaRecorder if AudioContext is missing
        audioChunks.current = [];
        const mr = new MediaRecorder(stream);
        mediaRecorder.current = mr;
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.current.push(e.data);
        };
        mr.start();
        setRecording(true);
        console.log("[Voice:STT] Recording started (MediaRecorder fallback mode)");
      }
    } catch (err) {
      console.error("[Voice:STT] Failed to access microphone:", err);
      alert(t("micDenied"));
    }
  }

  async function finishRecording() {
    setRecording(false);
    // eslint-disable-next-line react-hooks/purity -- runs in a click handler, not during render
    const durationMs = Date.now() - recordingStartTime.current;
    console.log(`[Voice:STT] Recording stopped (${durationMs}ms duration)`);

    // Clean up audio nodes
    if (scriptProcessor.current) {
      scriptProcessor.current.disconnect();
      scriptProcessor.current = null;
    }
    if (audioContext.current) {
      const sampleRate = audioContext.current.sampleRate || 16000;
      await audioContext.current.close().catch(() => {});
      audioContext.current = null;

      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach((t) => t.stop());
        mediaStream.current = null;
      }

      const totalSamples = audioBuffers.current.reduce((acc, b) => acc + b.length, 0);
      if (totalSamples === 0 || durationMs < 400) {
        console.warn("[Voice:STT] Recording too brief or empty");
        return;
      }

      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const b of audioBuffers.current) {
        merged.set(b, offset);
        offset += b.length;
      }

      const wavBlob = encodeWav(merged, sampleRate);
      console.log(`[Voice:STT] Created 16kHz WAV: ${wavBlob.size} bytes`);
      await processAndSendAudio(wavBlob);
    } else if (mediaRecorder.current) {
      const mr = mediaRecorder.current;
      mr.onstop = async () => {
        if (mediaStream.current) {
          mediaStream.current.getTracks().forEach((t) => t.stop());
          mediaStream.current = null;
        }
        const blob = new Blob(audioChunks.current, { type: mr.mimeType || "audio/webm" });
        await processAndSendAudio(blob);
      };
      mr.stop();
    }
  }

  async function processAndSendAudio(audioBlob: Blob) {
    if (audioBlob.size < 100) return;
    setTranscribing(true);
    try {
      const res = await sendVoiceSTT(audioBlob);
      if (res.text && res.text.trim()) {
        const spoken = res.text.trim();
        console.log(`[Voice:STT] Transcription succeeded: "${spoken}" [${res.language}]`);
        setText(spoken);
        ask(spoken);
      } else {
        console.warn("[Voice:STT] Transcription returned empty text");
      }
    } catch (err) {
      console.error("[Voice:STT] STT request failed:", err);
    } finally {
      setTranscribing(false);
    }
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
      const tts = await getVoiceTTS(speakText, speechLang(speakText, lang).code);
      if (tts.audio_base64 && !tts.fallback_to_browser) {
        const player = new Audio(`data:${tts.mime};base64,${tts.audio_base64}`);
        audioPlayer.current = player;
        player.onended = () => setPlayingIdx(null);
        player.onerror = () => speakBrowser(speakText);
        await player.play();
        return;
      }
    } catch (err) {
      console.warn("Backend TTS failed, using browser synthesis fallback:", err);
    }

    speakBrowser(speakText);
  }

  function speakBrowser(speakText: string) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(speakText);
      // Auto-detect Devanagari script for Hindi/Marathi (Marathi when the app is in Marathi)
      utter.lang = speechLang(speakText, lang).bcp;
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
          <Icon name="forum" className="text-[20px]" /> {t("ask")}
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label={t("dialog")}
          className="anim-dialog fixed inset-x-0 bottom-0 z-[1150] flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-container-lowest shadow-float sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-6rem))] sm:w-[400px] sm:rounded-2xl"
        >
          <header className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-on-primary">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-on-primary/15">
                <Icon name="forum" className="text-[18px]" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">{t("ask")}</p>
                <p className="text-micro opacity-80">{t("subtitle")}</p>
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
                  aria-label={t("clear")}
                  className="rounded-lg p-1.5 hover:bg-on-primary/15"
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
                aria-label={t("closeAssistant")}
                className="rounded-lg p-1.5 hover:bg-on-primary/15"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
          </header>

          <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface px-3 py-4">
            {entries.length === 0 && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-container-lowest p-3 text-sm shadow-card">
                  {t("hello1")}{" "}
                  {t("hello2")} <strong>{t("mic")}</strong> {t("hello3")}
                </div>
                <p className="px-1 eyebrow text-outline">{t("try")}</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((k) => t(k)).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full bg-container-lowest px-3 py-1.5 text-left text-small font-medium text-primary shadow-card hover:bg-primary-fixed"
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

            {busy && <Thinking />}
          </div>

          {/* Voice status notifications */}
          {recording && (
            <div className="flex items-center justify-between border-t border-hairline-soft bg-error/10 px-3 py-1.5 text-xs font-semibold text-error">
              <span className="flex items-center gap-1.5 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-error" /> {t("listening")}
              </span>
              <button
                type="button"
                onClick={toggleRecording}
                className="underline hover:opacity-80"
              >
                {t("done")}
              </button>
            </div>
          )}

          {transcribing && (
            <div className="flex items-center gap-1.5 border-t border-hairline-soft bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Icon name="graphic_eq" className="text-[16px] animate-pulse" />
              <span>{t("transcribing")}</span>
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
              placeholder={t("placeholder")}
              aria-label={t("message")}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-xl bg-container px-3 py-2.5 text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {/* 🎤 Voice Mic Button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={busy || transcribing}
              aria-label={recording ? t("stopListening") : t("speakVoice")}
              title={recording ? t("tapFinish") : t("tapSpeak")}
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
              aria-label={t("send")}
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

const STEPS = ["step1", "step2", "step3"] as const;

/** Typing dots + what the assistant is doing, so a slow answer doesn't look frozen. */
function Thinking() {
  const [step, setStep] = useState(0);
  const t = useT(M);
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
      <span className="text-caption text-on-surface-variant">{t(STEPS[step])}</span>
    </div>
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
  const t = useT(M);
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
              aria-label={isPlaying ? t("stopSpeech") : t("listenAloud")}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${
                isPlaying
                  ? "bg-primary text-on-primary animate-pulse"
                  : "text-primary hover:bg-primary-fixed"
              }`}
            >
              <Icon name={isPlaying ? "volume_off" : "volume_up"} className="text-[15px]" />
              <span>{isPlaying ? t("stop") : t("listen")}</span>
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
            className="flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-small font-semibold text-on-primary hover:bg-primary-container"
          >
            {t("openDetails")} <Icon name="arrow_forward" className="text-[16px]" />
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
        <p className="flex items-center gap-1 px-1 text-micro text-outline">
          <Icon name="info" className="text-[14px]" />
          {r.source === "fallback" ? t("fallback")
                : r.note?.includes("slow") ? t("slow") : t("simplified")}
        </p>
      )}
    </div>
  );
}

function OptionCard({ option: o }: { option: ChatOption }) {
  const problem = o.live_problems[0];
  const t = useT(M);
  const tc = useT(COMMON);
  return (
    <div
      className={`rounded-xl bg-container-lowest p-2.5 shadow-card ${o.recommended ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-micro font-bold uppercase tracking-wide text-primary">
          {tc(`plan.${o.label}`)}
          {o.recommended ? ` · ${t("recommended")}` : ""}
        </span>
        <span className="text-small font-semibold">
          {o.duration_min} {tc("min")} · ₹{o.cost_inr}
        </span>
      </div>
      <p className="mt-0.5 text-small font-medium">{o.route}</p>
      <p className="text-caption text-on-surface-variant">
        {o.depart} → {o.arrive} · {t(o.changes === 1 ? "change" : "changes", { n: o.changes })} · {t("walk", { min: o.walk_min })}
      </p>
      {problem && (
        <p
          className={`mt-1.5 rounded-md px-2 py-1 text-micro font-semibold ${
            STATUS_STYLE[problem.status] ?? ""
          }`}
        >
          {o.blocked_by_confirmed_problem ? t("blocked") : ""}
          {problem.title} · {t("statusPct", { status: isStatusKey(problem.status) ? tc(`status.${problem.status}`) : problem.status, pct: problem.trust_pct })}
        </p>
      )}
    </div>
  );
}

function ProblemRow({ p }: { p: ChatProblem }) {
  const t = useT(M);
  const tc = useT(COMMON);
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl bg-container-lowest px-2.5 py-2 shadow-card">
      <span className="min-w-0">
        <span className="block truncate text-small font-medium">{p.title}</span>
        <span className="block truncate text-micro text-on-surface-variant">{p.sources}</span>
      </span>
      <span className={`shrink-0 rounded-md px-2 py-0.5 text-micro font-bold ${STATUS_STYLE[p.status] ?? ""}`}>
        {t("statusPct", { status: p.status === "coordinated" ? t("fakeBurst") : isStatusKey(p.status) ? tc(`status.${p.status}`) : p.status, pct: p.trust_pct })}
      </span>
    </li>
  );
}
