import { pct } from "@/lib/format";
import type { RouteCard } from "@/lib/types";

const STYLE = {
  green: "bg-good-soft text-good",
  yellow: "bg-warn-soft text-warn",
  red: "bg-bad-soft text-bad",
} as const;

export default function ReliabilityBadge({ card }: { card: RouteCard }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLE[card.reliability_colour]}`}
      title="Chance this plan works as shown, after checking live reports"
    >
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      {pct(card.reliability)} reliable
    </span>
  );
}
