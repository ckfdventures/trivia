import type { RoomConnection } from "./room.js";

/** A player holding one of the room's voice slots. */
export interface VoiceMember {
  playerId: string;
  /** Random id per client voice session; peers rebuild their connection to this member when it changes. */
  sessionId: string;
  micOn: boolean;
  speakerOn: boolean;
  /** Null while the member is disconnected and their slot is being held. */
  conn: RoomConnection | null;
  holdTimer: NodeJS.Timeout | null;
}

/** Voice chat state for one room. Audio flows peer to peer; the server only tracks slots and relays signaling. */
export interface VoiceState {
  /** Every open voice socket (in voice or only watching the roster), by connection id. */
  listeners: Map<string, { playerId: string; conn: RoomConnection }>;
  /** Players holding a voice slot, by player id. */
  members: Map<string, VoiceMember>;
}

export function createVoiceState(): VoiceState {
  return { listeners: new Map(), members: new Map() };
}

export function clearVoiceTimers(voice: VoiceState): void {
  for (const member of voice.members.values()) {
    if (member.holdTimer) clearTimeout(member.holdTimer);
    member.holdTimer = null;
  }
}

/** The roster sent to clients: who is in voice and their mic/speaker state. */
export function toVoiceRoster(voice: VoiceState, capacity: number) {
  return {
    capacity,
    members: [...voice.members.values()].map((m) => ({
      player_id: m.playerId,
      session_id: m.sessionId,
      mic_on: m.micOn,
      speaker_on: m.speakerOn,
      connected: m.conn !== null,
    })),
  };
}
