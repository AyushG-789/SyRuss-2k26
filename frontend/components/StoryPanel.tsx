"use client";

// "Demo story" panel for the 5 PS travellers (TR1–TR5). One button sets everything up so the
// story's moment happens on screen: reset the scenario, set the demo clock, and (for trip stories)
// start the right option and open Live Trip Tracking. Data: traveller.demo in travellers.json.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getPlan, resetDemo, updateClock } from "@/lib/api";
import { startTrip } from "@/lib/savedTrip";
import type { Traveller } from "@/lib/types";
import Icon from "./Icon";

export default function StoryPanel({ traveller, onReplan, resultsHref }: {
  traveller: Traveller;
  /** For plan / itinerary stories: re-run the plan once the clock is set. */
  onReplan?: () => void;
  resultsHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = traveller.demo;
  if (!d) return null;

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
      setError("Couldn't reach the TravelBuddy server — start the backend on port 8000.");
    } finally {
      setBusy(false);
    }
  }

  const label = d.kind === "track" ? `Play story: start the ${d.card} option at ${d.clock}` : `Show the moment (${d.moment})`;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-primary/30 bg-primary-fixed/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-primary">
          <Icon name="theater_comedy" className="text-[16px]" /> Demo story · {traveller.traveller_id} {traveller.name}
        </span>
        <span className="rounded-full bg-container-lowest px-2 py-0.5 text-micro font-bold text-on-surface-variant">
          {d.kind === "track" ? `trip story · moment at ${d.moment}` : d.kind === "plan" ? "planning story" : "day-plan story"}
        </span>
      </div>
      {traveller.story && <p className="text-sm">{traveller.story}</p>}
      {traveller.demo_hook && <p className="text-small text-on-surface-variant"><b>What happens:</b> {traveller.demo_hook}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={play} disabled={busy}
          className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50">
          <Icon name="play_circle" className="text-[20px]" /> {busy ? "Setting up…" : label}
        </button>
        <span className="flex items-center gap-1 text-caption text-on-surface-variant">
          <Icon name="visibility" className="text-[16px]" /> {d.watch}
        </span>
      </div>
      {done && <p className="text-caption font-semibold text-primary">Demo clock set to {d.moment} — the page now shows the moment.</p>}
      {error && <p className="text-caption text-error">{error}</p>}
    </section>
  );
}
