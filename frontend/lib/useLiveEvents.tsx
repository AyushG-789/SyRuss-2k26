"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getLiveEvents, type LiveEvents } from "./api";

interface LiveContext {
  live: LiveEvents | null;
  /** Re-fetch now (e.g. after submitting a report). */
  refresh: () => void;
}

const Ctx = createContext<LiveContext>({ live: null, refresh: () => undefined });

/** One shared poll of Pakka Check's live disruptions for the whole app (backend if up, else sample). */
export function LiveEventsProvider({ children, pollMs = 5000 }: { children: React.ReactNode; pollMs?: number }) {
  const [live, setLive] = useState<LiveEvents | null>(null);
  const refresh = useCallback(() => {
    getLiveEvents().then(setLive).catch(() => undefined);
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);
  return <Ctx.Provider value={{ live, refresh }}>{children}</Ctx.Provider>;
}

export function useLiveEvents(): LiveEvents | null {
  return useContext(Ctx).live;
}

export function useRefreshLiveEvents(): () => void {
  return useContext(Ctx).refresh;
}
