"use client";

import { PLAN_LABEL } from "@/lib/format";
import type { RouteCard as Card } from "@/lib/types";
import LegChips from "./LegChips";
import ReliabilityBadge from "./ReliabilityBadge";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default function RouteCard({
  card,
  selected,
  onSelect,
}: {
  card: Card;
  selected: boolean;
  onSelect: () => void;
}) {
  const first = card.legs[0];
  const last = card.legs[card.legs.length - 1];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col gap-3 rounded-2xl border bg-surface p-4 text-left shadow-sm transition ${
        selected ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-muted/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{PLAN_LABEL[card.label]}</h3>
            {card.recommended && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-ink">
                ⭐ Recommended
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {first.depart} → {last.arrive}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums leading-none">{card.score.toFixed(1)}</div>
          <div className="text-xs text-muted">/ 10</div>
        </div>
      </div>

      <LegChips legs={card.legs} />

      <dl className="grid grid-cols-4 gap-2 border-y border-line py-2">
        <Stat label="Time" value={`${card.duration_min} min`} />
        <Stat label="Cost" value={`₹${card.cost_inr}`} />
        <Stat label="Changes" value={String(card.transfers)} />
        <Stat label="Walking" value={`${card.walk_min} min`} />
      </dl>

      <ReliabilityBadge card={card} />
      <p className="text-sm leading-relaxed">{card.reason}</p>
    </button>
  );
}
