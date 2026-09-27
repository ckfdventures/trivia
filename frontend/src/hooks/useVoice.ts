"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { VoiceManager, type VoiceSnapshot } from "../lib/voice/VoiceManager";

/** Grace period before an unused voice session is torn down, so moving between game pages keeps the call. */
const RELEASE_DELAY_MS = 3000;

/** localStorage key remembering whether this player chose to be in voice for a room ("on" / "off"). */
export const voiceChoiceKey = (pin: string) => `ts_voice_${pin}`;

let current: { key: string; manager: VoiceManager; users: number; releaseTimer: ReturnType<typeof setTimeout> | null } | null = null;

function acquire(pin: string, playerId: string, token: string): VoiceManager {
  const key = `${pin}:${playerId}:${token}`;
  if (current?.key !== key) {
    current?.manager.destroy();
    current = { key, manager: new VoiceManager(pin, playerId, token), users: 0, releaseTimer: null };
  }
  if (current.releaseTimer) clearTimeout(current.releaseTimer);
  current.releaseTimer = null;
  current.users += 1;
  return current.manager;
}

function release(manager: VoiceManager): void {
  const entry = current;
  if (entry?.manager !== manager) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  entry.releaseTimer = setTimeout(() => {
    if (current !== entry || entry.users > 0) return;
    entry.manager.destroy();
    current = null;
  }, RELEASE_DELAY_MS);
}

const IDLE: VoiceSnapshot = {
  status: "idle",
  micOn: false,
  speakerOn: true,
  micDenied: false,
  audioBlocked: false,
  mutedByHostAt: null,
  capacity: 8,
  roster: [],
  speaking: [],
  links: {},
};
const noopSubscribe = () => () => {};

/**
 * Voice chat for a player (or a host who plays along) in a room. The session survives navigation between the
 * room's pages and is closed a few seconds after no page uses it. A player who chose voice before is rejoined.
 */
export function useVoice(pin: string, player: { player_id: string; session_token: string } | null | undefined) {
  const [manager, setManager] = useState<VoiceManager | null>(null);
  const playerId = player?.player_id;
  const token = player?.session_token;

  useEffect(() => {
    if (!pin || !playerId || !token) return undefined;
    const m = acquire(pin, playerId, token);
    m.connect();
    let choice: string | null = null;
    try {
      choice = window.localStorage.getItem(voiceChoiceKey(pin));
    } catch {
      /* storage unavailable */
    }
    if (choice === "on" && m.getSnapshot().status === "idle") void m.join();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the manager is created from browser-only state
    setManager(m);
    return () => release(m);
  }, [pin, playerId, token]);

  const snapshot = useSyncExternalStore(
    manager?.subscribe ?? noopSubscribe,
    manager?.getSnapshot ?? (() => IDLE),
    () => IDLE,
  );
  return { voice: manager, snapshot };
}
