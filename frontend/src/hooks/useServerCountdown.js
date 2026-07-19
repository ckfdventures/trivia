import { useEffect, useState } from "react";

/**
 * Countdown to a server-provided deadline (ms epoch), synced against a
 * server_now snapshot to correct for client-clock drift.
 * Returns remainingMs (>=0) and remainingPct (0..1) of the given timeLimitSeconds.
 */
export function useServerCountdown({ deadlineTs, serverNow, timeLimitSeconds, active }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  if (!deadlineTs || !serverNow || !timeLimitSeconds) {
    return { remainingMs: 0, remainingPct: 0, remainingSec: 0 };
  }
  const offset = serverNow - Date.now(); // server_now was recorded before now-local
  const effectiveNow = now + offset;
  const remainingMs = Math.max(0, deadlineTs - effectiveNow);
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const remainingPct = Math.max(0, Math.min(1, remainingMs / (timeLimitSeconds * 1000)));
  return { remainingMs, remainingPct, remainingSec };
}
