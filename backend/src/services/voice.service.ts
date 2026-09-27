import { VOICE_SLOT_HOLD_MS, VOICE_SLOTS } from "../domain/constants.js";
import type { Room, RoomConnection } from "../domain/room.js";
import { toVoiceRoster, type VoiceMember } from "../domain/voice.js";
import { forbidden, notFound } from "../shared/http-error.js";
import type { Logger } from "../shared/logger.js";
import { PUBLIC_STUN, type IceServer, type IceServerProvider } from "./ice-servers.js";
import type { ConnectResult } from "./presence.service.js";
import type { RoomStore } from "./room-store.js";

export const VoiceEvents = {
  Roster: "voice:roster",
  Joined: "voice:joined",
  Full: "voice:full",
  Signal: "voice:signal",
  MutedByHost: "voice:muted_by_host",
} as const;

export interface VoiceJoinInput {
  sessionId: string;
  micOn: boolean;
  speakerOn: boolean;
}

export interface VoiceSignalInput {
  to: string;
  toSession: string;
  data: unknown;
}

/**
 * Voice chat slots and signaling. Audio goes directly between browsers (WebRTC mesh); the server only decides
 * who holds a slot, relays connection-setup messages between members of the same room, and hands out ICE servers.
 * The sender of every relayed message is taken from the authenticated socket, never from the message itself.
 */
export class VoiceService {
  constructor(
    private readonly store: RoomStore,
    private readonly iceServers: IceServerProvider,
    private readonly logger: Logger,
    private readonly holdMs = VOICE_SLOT_HOLD_MS,
    private readonly capacity = VOICE_SLOTS,
  ) {}

  /** Open a player's voice socket. They can see the roster; `join` takes a slot. */
  connect(pin: string, token: string, conn: RoomConnection): ConnectResult {
    const room = this.store.get(pin);
    if (!room) return { ok: false, message: "Room not found" };
    const player = token ? [...room.players.values()].find((p) => p.session_token === token) : undefined;
    if (!player) return { ok: false, message: "Player not found in room" };

    room.voice.listeners.set(conn.id, { playerId: player.id, conn });
    conn.send(VoiceEvents.Roster, toVoiceRoster(room.voice, this.capacity));
    return { ok: true, playerId: player.id };
  }

  /** The socket closed: a member keeps their slot for a grace period so a brief drop doesn't lose it. */
  disconnect(pin: string, conn: RoomConnection): void {
    const room = this.store.get(pin);
    const listener = room?.voice.listeners.get(conn.id);
    if (!room || !listener) return;
    room.voice.listeners.delete(conn.id);
    const member = room.voice.members.get(listener.playerId);
    if (member?.conn === conn) {
      this.holdSlot(room, member);
      this.broadcastRoster(room);
    }
  }

  async join(pin: string, playerId: string, conn: RoomConnection, input: VoiceJoinInput): Promise<void> {
    const before = this.store.get(pin);
    if (!before || !this.hasSlotFor(before, playerId)) {
      conn.send(VoiceEvents.Full, { capacity: this.capacity });
      return;
    }
    // Fetch ICE servers before announcing the member, so they can answer the offers the roster update triggers.
    const iceServers = await this.loadIceServers();

    const room = this.store.get(pin);
    if (!room || !room.voice.listeners.has(conn.id)) return;
    if (!this.hasSlotFor(room, playerId)) {
      conn.send(VoiceEvents.Full, { capacity: this.capacity });
      return;
    }
    const member = room.voice.members.get(playerId) ?? { playerId, holdTimer: null, conn: null, sessionId: "", micOn: false, speakerOn: false };
    if (member.holdTimer) clearTimeout(member.holdTimer);
    Object.assign(member, { holdTimer: null, conn, sessionId: input.sessionId, micOn: input.micOn, speakerOn: input.speakerOn });
    room.voice.members.set(playerId, member);

    conn.send(VoiceEvents.Joined, { session_id: member.sessionId, ice_servers: iceServers });
    this.broadcastRoster(room);
  }

  leave(pin: string, playerId: string, conn: RoomConnection): void {
    const room = this.store.get(pin);
    const member = room?.voice.members.get(playerId);
    if (!room || !member || member.conn !== conn) return;
    room.voice.members.delete(playerId);
    this.broadcastRoster(room);
  }

  setState(pin: string, playerId: string, conn: RoomConnection, state: { micOn: boolean; speakerOn: boolean }): void {
    const room = this.store.get(pin);
    const member = room?.voice.members.get(playerId);
    if (!room || !member || member.conn !== conn) return;
    member.micOn = state.micOn;
    member.speakerOn = state.speakerOn;
    this.broadcastRoster(room);
  }

  /** Relay a WebRTC setup message to another member of the same room, stamped with the real sender. */
  signal(pin: string, playerId: string, conn: RoomConnection, input: VoiceSignalInput): void {
    const room = this.store.get(pin);
    const sender = room?.voice.members.get(playerId);
    if (!room || !sender || sender.conn !== conn || input.to === playerId) return;
    const target = room.voice.members.get(input.to);
    if (!target?.conn) return;
    target.conn.send(VoiceEvents.Signal, {
      from: sender.playerId,
      from_session: sender.sessionId,
      to_session: input.toSession,
      data: input.data,
    });
  }

  /** Host control: turn off every member's mic except the host's own. Players can unmute afterwards. */
  muteAll(pin: string, hostToken: string): { muted: number } {
    const room = this.store.get(pin);
    if (!room) throw notFound("Room not found");
    if (room.hostToken !== hostToken) throw forbidden("Invalid host token");
    let muted = 0;
    for (const member of room.voice.members.values()) {
      if (member.playerId === room.hostPlayerId) continue;
      member.micOn = false;
      member.conn?.send(VoiceEvents.MutedByHost, {});
      muted += 1;
    }
    this.broadcastRoster(room);
    return { muted };
  }

  private hasSlotFor(room: Room, playerId: string): boolean {
    return room.voice.members.has(playerId) || room.voice.members.size < this.capacity;
  }

  private holdSlot(room: Room, member: VoiceMember): void {
    member.conn = null;
    member.holdTimer = setTimeout(() => {
      member.holdTimer = null;
      if (this.store.get(room.pin) !== room || room.voice.members.get(member.playerId) !== member || member.conn) return;
      room.voice.members.delete(member.playerId);
      this.broadcastRoster(room);
    }, this.holdMs);
    member.holdTimer.unref();
  }

  private async loadIceServers(): Promise<IceServer[]> {
    try {
      return await this.iceServers.getIceServers();
    } catch (err) {
      this.logger.error("failed to get ICE servers; falling back to STUN only", err);
      return PUBLIC_STUN;
    }
  }

  private broadcastRoster(room: Room): void {
    const roster = toVoiceRoster(room.voice, this.capacity);
    for (const [connId, { conn }] of [...room.voice.listeners]) {
      try {
        conn.send(VoiceEvents.Roster, roster);
      } catch {
        room.voice.listeners.delete(connId);
      }
    }
  }
}
