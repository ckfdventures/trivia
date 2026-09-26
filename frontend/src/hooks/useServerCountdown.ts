"use client";

import { useEffect, useState } from "react";

interface Options {
  deadlineTs: number | undefined;
  serverNow: number | undefined;
  timeLimitSeconds: number;
  active: boolean;
}

/**
 * Countdown to a server-provided deadline (ms epoch), synced against a
 * server_now snapshot to correct for client-clock drift.
 * Returns remainingMs (>=0), remainingSec, and remainingPct (0..1) of the given timeLimitSeconds.
 */
export function useServerCountdown({ deadlineTs, serverNow, timeLimitSeconds, active }: Options) {
  const [now, setNow] = useState(() => Date.now());
  // Server-minus-client clock offset, measured once when each server snapshot arrives.
  const [clock, setClock] = useState<{ serverNow: number | undefined; offset: number }>({ serverNow: undefined, offset: 0 });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sampling the client clock must happen outside render
    if (serverNow) setClock({ serverNow, offset: serverNow - Date.now() });
  }, [serverNow]);

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  if (!deadlineTs || !serverNow || !timeLimitSeconds) {
    return { remainingMs: 0, remainingPct: 0, remainingSec: 0 };
  }
  // Until the offset for this snapshot is measured, treat the snapshot time as "now".
  const effectiveNow = clock.serverNow === serverNow ? now + clock.offset : serverNow;
  const remainingMs = Math.max(0, deadlineTs - effectiveNow);
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const remainingPct = Math.max(0, Math.min(1, remainingMs / (timeLimitSeconds * 1000)));
  return { remainingMs, remainingPct, remainingSec };
}
