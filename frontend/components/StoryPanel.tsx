"use client";

// "Demo story" panel for the 5 PS travellers (TR1–TR5). One button sets everything up so the
// story's moment happens on screen: reset the scenario, set the demo clock, and (for trip stories)
// start the right option and open Live Trip Tracking. Data: traveller.demo in travellers.json.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getPlan, resetDemo, updateClock } from "@/lib/api";
import { startTrip } from "@/lib/savedTrip";
import { translate, useLang, useT } from "@/lib/i18n";
import { COMMON } from "@/lib/i18n/common";
import { M, storyText } from "@/lib/i18n/messages/StoryPanel";
import type { Traveller } from "@/lib/types";
import Icon from "./Icon";

export default function StoryPanel({ traveller, onReplan, resultsHref }: {
  traveller: Traveller;
  /** For plan / itinerary stories: re-run the plan once the clock is set. */
  onReplan?: () => void;
  resultsHref?: string;
}) {
  const router = useRouter();
  const t = useT(M);
  const tc = useT(COMMON);
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = traveller.demo;
  if (!d) return null;
  const text = storyText(lang, traveller.traveller_id, {
    name: traveller.name, story: traveller.story, hook: traveller.demo_hook, watch: d.watch,
  });
  const cardKey = `plan.${d.card}` as keyof typeof COMMON.en;
  const cardLabel = d.card && cardKey in COMMON.en ? tc(cardKey).toLowerCase() : d.card ?? "";

  async function play() {
    setBusy(true);
    setError(null);
    try {
      await resetDemo("scripted");                       // fresh scenario every time
      if (d!.kind === "track") {
        await updateClock({ set: d!.clock, speed: 0 });
        const plan = await getPlan(traveller);
        const card = plan.cards.find((c) => c.label === d!.card) ?? plan.cards.find((c) => c.recommended) ?? plan.cards[0];
        if (!card) throw new Error("no route");
        await startTrip({ traveller, destination: traveller.destination, card,
          resultsHref: resultsHref ?? `/routes/${traveller.traveller_id}`, savedAt: new Date().toISOString() });
        router.push("/track");
        return;
      }
      await updateClock({ set: d!.moment, speed: 0 });  // plan / itinerary: show it at the moment
      onReplan?.();
      setDone(true);
    } catch {
      setError(translate(M, "error"));
    } finally {
      setBusy(false);
    }
  }

  const label = d.kind === "track" ? t("playTrack", { card: cardLabel, clock: d.clock }) : t("showMoment", { time: d.moment });
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-primary/30 bg-primary-fixed/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-primary">
          <Icon name="theater_comedy" className="text-[18px]" /> {t("badge", { id: traveller.traveller_id, name: text.name ?? traveller.name })}
        </span>
        <span className="rounded-full bg-container-lowest px-2 py-0.5 text-micro font-bold text-on-surface-variant">
          {d.kind === "track" ? t("kindTrack", { time: d.moment }) : d.kind === "plan" ? t("kindPlan") : t("kindItinerary")}
        </span>
      </div>
      {text.story && <p className="text-sm">{text.story}</p>}
      {text.hook && <p className="text-small text-on-surface-variant"><b>{t("whatHappens")}</b> {text.hook}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={play} disabled={busy}
          className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50">
          <Icon name="play_circle" className="text-[20px]" /> {busy ? t("settingUp") : label}
        </button>
        <span className="flex items-center gap-1 text-caption text-on-surface-variant">
          <Icon name="visibility" className="text-[18px]" /> {text.watch}
        </span>
      </div>
      {done && <p className="text-caption font-semibold text-primary">{t("done", { time: d.moment })}</p>}
      {error && <p className="text-caption text-error">{error}</p>}
    </section>
  );
}
