import { legColor, lineShortName, MODE_LABEL } from "@/lib/format";
import type { Leg } from "@/lib/types";

/** Vehicle legs as coloured chips; short walks shown as a small 🚶 marker between them. */
export default function LegChips({ legs }: { legs: Leg[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
      {legs.map((leg, i) => {
        const disrupted = leg.event_ids.length > 0 && leg.risk >= 0.3;
        const arrow = i > 0 ? <span className="text-muted" aria-hidden>›</span> : null;
        if (leg.mode === "walk") {
          return (
            <li key={i} className={`flex items-center gap-1.5 ${disrupted ? "text-bad" : "text-muted"}`}>
              {arrow}
              <span title={disrupted ? "Walk affected by a live disruption" : `Walk ${leg.duration_min} min`}>
                {disrupted && "⚠️"}🚶{leg.duration_min}′
              </span>
            </li>
          );
        }
        const name = leg.line_id ? lineShortName(leg.line_id) : MODE_LABEL[leg.mode];
        return (
          <li key={i} className="flex items-center gap-1.5">
            {arrow}
            <span
              className="rounded-md px-2 py-1 font-medium text-white"
              style={{ backgroundColor: legColor(leg) }}
              title={disrupted ? "Affected by a live disruption" : undefined}
            >
              {disrupted && "⚠️ "}
              {name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
