"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

const formatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Formats current time in Asia/Kolkata timezone (HH:mm:ss). */
export function formatKolkataTime(date: Date = new Date()): string {
  return formatter.format(date);
}

/**
 * Shared hook returning current time in Asia/Kolkata, updated every second.
 * Returns null during SSR to avoid hydration mismatch.
 */
export function useKolkataClock(): string | null {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setTime(formatter.format(new Date()));
    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return time;
}

interface LiveClockProps {
  className?: string;
  showIcon?: boolean;
  showZone?: boolean;
  /** "lg": the bigger chip in the top bar. */
  size?: "sm" | "lg";
}

export default function LiveClock({ className = "", showIcon = true, showZone = true, size = "sm" }: LiveClockProps) {
  const time = useKolkataClock();
  const lg = size === "lg";

  return (
    <div
      className={`inline-flex items-center bg-container font-semibold tabular-nums ${lg ? "h-12 gap-2 rounded-xl px-4 text-body" : "gap-1.5 rounded-lg px-2.5 py-1 text-xs"} ${className}`}
      title="Live Mumbai Transit Time (Asia/Kolkata)"
      aria-label="Current Mumbai Transit System Time"
    >
      {showIcon && <Icon name="schedule" className={`${lg ? "text-[24px]" : "text-[18px]"} text-primary`} />}
      <span className={`font-mono text-on-surface ${lg ? "text-body" : "text-xs"}`}>
        {time ?? "--:--:--"}
      </span>
      {showZone && <span className={`font-bold text-on-surface-variant ${lg ? "text-caption" : "text-micro"}`}>IST</span>}
    </div>
  );
}
