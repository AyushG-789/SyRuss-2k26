import Link from "next/link";
import type { Traveller } from "@/lib/types";

function tags(t: Traveller): string[] {
  const out: string[] = [];
  if (t.step_free) out.push("♿ Step-free only");
  if (t.hard_deadline && t.arrive_by) out.push(`⏰ Must arrive by ${t.arrive_by}`);
  else if (t.arrive_by) out.push(`Arrive by ${t.arrive_by}`);
  if (t.max_budget_inr) out.push(`₹${t.max_budget_inr} budget`);
  if (t.max_walk_min) out.push(`≤ ${t.max_walk_min} min walk`);
  if (!t.modes_allowed.includes("auto")) out.push("No autos");
  if (t.heavy_luggage) out.push("🧳 Luggage");
  if (t.itinerary) out.push(`📍 ${t.itinerary.stops.length}-stop day`);
  out.push({ en: "English", hi: "हिंदी", mr: "मराठी" }[t.language]);
  return out;
}

export default function TravellerCard({ traveller }: { traveller: Traveller }) {
  const t = traveller;
  const to = t.destination?.label ?? "Day itinerary";
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div>
        <h3 className="font-semibold">{t.name}</h3>
        <p className="mt-0.5 text-sm text-muted">
          {t.origin.label} → {to}
          {t.leave_at ? ` · leaves ${t.leave_at}` : ""}
        </p>
      </div>
      {t.story && <p className="text-sm leading-relaxed">{t.story}</p>}
      <ul className="flex flex-wrap gap-1.5">
        {tags(t).map((tag) => (
          <li key={tag} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
            {tag}
          </li>
        ))}
      </ul>
      <Link
        href={`/plan/${t.traveller_id}`}
        className="mt-auto rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-medium text-brand-ink transition hover:opacity-90"
      >
        Plan this trip
      </Link>
    </article>
  );
}
