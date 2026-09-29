import { badRequest, conflict, forbidden, notFound } from "../../../shared/http-error.js";
import { newId } from "../../../shared/ids.js";
import type { ProfanityFilter } from "../../../services/profanity-filter.js";
import { normalizeRoomCode } from "../domain/codes.js";
import {
  DRAWER_DISCONNECT_SKIP_MS,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_CUSTOM_WORDS,
  PUBLIC_LOBBY_AUTOSTART_MIN_PLAYERS,
  PUBLIC_LOBBY_AUTOSTART_SECONDS,
  RECONNECT_GRACE_MS,
} from "../domain/constants.js";
import {
  clearRoomTimers,
  createPlayer,
  createRoom,
  isFull,
  playersByArrival,
  type PlayerProfile,
  type Room,
  type RoomConnection,
  type RoomSettings,
} from "../domain/room.js";
import type { SettingsPatchInput } from "../http/schemas.js";
import { ScribbleEvents, type ScribbleRoomNotifier } from "./room-notifier.js";
import type { ScribbleRoomStore } from "./room-store.js";

/**
 * A player's credentials for one room.
 *
 * The PRD (§7) has the browser keep a single persistent `playerId` and authenticate with it.
 * That id is also shown to every other player in the room snapshot, which would let anyone
 * take over someone else's seat by repeating it. So identity is split the way the trivia game
 * already splits it: a public `playerId` that appears in room state, and a secret
 * `sessionToken` that never leaves the owning client. See DECISIONS.md D10.
 */
export interface PlayerSession {
  playerId: string;
  sessionToken: string;
}

export interface JoinResult extends PlayerSession {
  room: Room;
}

export type ConnectResult =
  | { ok: true; playerId: string }
  | { ok: false; message: string };

/** Called when a public lobby's countdown expires. */
export type MatchStarter = (room: Room) => void;
/** Called when the drawer has been gone long enough to forfeit their turn. */
export type DrawerLostHandler = (room: Room) => void;

export class ScribbleRoomService {
  /** room code -> player id -> secret token. Kept beside the room, never inside its state. */
  private readonly sessions = new Map<string, Map<string, string>>();

  constructor(
    private readonly store: ScribbleRoomStore,
    private readonly notifier: ScribbleRoomNotifier,
    private readonly profanity: ProfanityFilter,
    private readonly onMatchStart: MatchStarter = () => {},
    private readonly onDrawerLost: DrawerLostHandler = () => {},
  ) {}

  // ── Creating and joining ───────────────────────────────────────────────────

  createRoom(profile: PlayerProfile, patch: SettingsPatchInput = {}): JoinResult {
    const clean = this.validProfile(profile);
    const room = createRoom({ code: this.store.generateCode(), hostId: newId() });
    this.applySettings(room, patch);
    this.store.add(room);

    const session = this.seat(room, clean, room.hostId);
    return { room, ...session };
  }

  joinRoom(rawCode: string, profile: PlayerProfile): JoinResult {
    const room = this.requireRoom(rawCode);
    if (room.phase !== "LOBBY") throw conflict("That match has already started.");
    if (isFull(room)) throw conflict("That room is full.");

    const clean = this.validProfile(profile);
    const session = this.seat(room, clean);
    this.notifier.broadcastState(room);
    this.refreshAutostart(room);
    return { room, ...session };
  }

  /** Drop a player into any public lobby with space, opening one if none has room. */
  quickPlay(profile: PlayerProfile): JoinResult {
    const candidates = this.store
      .joinablePublic()
      .sort((a, b) => b.players.size - a.players.size);
    const target = candidates[0];
    return target ? this.joinRoom(target.code, profile) : this.createRoom(profile);
  }

  private seat(room: Room, profile: PlayerProfile, playerId = newId()): PlayerSession {
    const player = createPlayer(playerId, profile);
    room.players.set(playerId, player);

    const sessionToken = newId();
    let roomSessions = this.sessions.get(room.code);
    if (!roomSessions) {
      roomSessions = new Map();
      this.sessions.set(room.code, roomSessions);
    }
    roomSessions.set(playerId, sessionToken);
    return { playerId, sessionToken };
  }

  // ── Presence ───────────────────────────────────────────────────────────────

  connect(rawCode: string, playerId: string, token: string, conn: RoomConnection): ConnectResult {
    const code = normalizeRoomCode(rawCode);
    const room = code ? this.store.get(code) : undefined;
    if (!room) return { ok: false, message: "Room not found" };
    if (room.kicked.has(playerId)) return { ok: false, message: "You were removed from this room" };
    if (!this.verify(room, playerId, token)) return { ok: false, message: "Invalid player session" };

    const player = room.players.get(playerId);
    if (!player) return { ok: false, message: "Player not found in room" };

    if (player.reconnectTimer) clearTimeout(player.reconnectTimer);
    player.reconnectTimer = null;
    player.disconnectedAt = null;
    player.connected = true;

    // One seat, one live connection. A second tab takes the seat over, and the socket it
    // replaces is dropped rather than left open receiving nothing — the map is registered
    // first so the old socket's disconnect handler sees it is no longer the current one.
    const previous = room.connections.get(playerId);
    room.connections.set(playerId, conn);
    if (previous && previous !== conn) previous.close?.();

    // They made it back before their turn was forfeit.
    if (room.drawerOrder[room.drawerIndex] === playerId && room.drawerLostTimer) {
      clearTimeout(room.drawerLostTimer);
      room.drawerLostTimer = null;
    }

    this.notifier.broadcastState(room);
    this.refreshAutostart(room);
    return { ok: true, playerId };
  }

  /**
   * The socket closed. The seat and score are held for the reconnect grace period so a
   * refresh or a tunnel change does not cost a player their game.
   */
  disconnect(code: string, playerId: string, conn: RoomConnection): void {
    const room = this.store.get(code);
    if (!room || room.connections.get(playerId) !== conn) return;
    room.connections.delete(playerId);

    const player = room.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = Date.now();

    if (player.reconnectTimer) clearTimeout(player.reconnectTimer);
    player.reconnectTimer = setTimeout(() => this.dropSeat(room, playerId), RECONNECT_GRACE_MS);
    player.reconnectTimer.unref();

    // Nobody should have to watch a blank canvas because the drawer closed their laptop.
    const isDrawer = room.drawerOrder[room.drawerIndex] === playerId;
    if (isDrawer && (room.phase === "DRAWING" || room.phase === "WORD_PICK")) {
      if (room.drawerLostTimer) clearTimeout(room.drawerLostTimer);
      room.drawerLostTimer = setTimeout(() => {
        room.drawerLostTimer = null;
        const stillGone = !room.players.get(playerId)?.connected;
        if (this.store.get(room.code) === room && stillGone) this.onDrawerLost(room);
      }, DRAWER_DISCONNECT_SKIP_MS);
      room.drawerLostTimer.unref();
    }

    this.notifier.broadcastState(room);
    this.refreshAutostart(room);
  }

  /** The grace period expired without a reconnect. */
  private dropSeat(room: Room, playerId: string): void {
    if (this.store.get(room.code) !== room) return;
    const player = room.players.get(playerId);
    if (!player || player.connected) return;
    this.removePlayer(room, playerId);
  }

  leave(code: string, playerId: string): void {
    const room = this.store.get(code);
    if (!room) return;
    this.removePlayer(room, playerId);
  }

  private removePlayer(room: Room, playerId: string): void {
    const player = room.players.get(playerId);
    if (!player) return;
    if (player.reconnectTimer) clearTimeout(player.reconnectTimer);

    room.players.delete(playerId);
    room.connections.delete(playerId);
    this.sessions.get(room.code)?.delete(playerId);

    if (room.players.size === 0) {
      this.discard(room);
      return;
    }
    if (room.hostId === playerId) this.transferHost(room);

    this.notifier.broadcast(room, ScribbleEvents.PlayerLeft, { player_id: playerId });
    this.notifier.broadcastState(room);
    this.refreshAutostart(room);
  }

  /** The host left: the longest-present remaining player takes over. PRD §6.3. */
  private transferHost(room: Room): void {
    const successor = playersByArrival(room)[0];
    if (!successor) return;
    room.hostId = successor.id;
    // A host does not need to mark themselves ready; they press start instead.
    successor.ready = false;
    this.notifier.broadcast(room, ScribbleEvents.HostChanged, {
      host_id: successor.id,
      name: successor.name,
    });
  }

  private discard(room: Room): void {
    clearRoomTimers(room);
    this.store.remove(room.code);
    this.sessions.delete(room.code);
  }

  // ── Host controls ──────────────────────────────────────────────────────────

  updateSettings(code: string, playerId: string, patch: SettingsPatchInput): Room {
    const room = this.requireHost(code, playerId);
    if (room.phase !== "LOBBY") throw conflict("Settings are locked once the match starts.");
    this.applySettings(room, patch);
    this.notifier.broadcastState(room);
    this.refreshAutostart(room);
    return room;
  }

  setReady(code: string, playerId: string, ready: boolean): Room {
    const room = this.requireRoom(code);
    const player = room.players.get(playerId);
    if (!player) throw notFound("Player not found in room");
    player.ready = ready;
    this.notifier.broadcastState(room);
    return room;
  }

  kick(code: string, playerId: string, targetId: string): Room {
    const room = this.requireHost(code, playerId);
    if (targetId === room.hostId) throw badRequest("The host cannot be removed.");
    if (!room.players.has(targetId)) throw notFound("That player is not in the room.");

    room.kicked.add(targetId);
    const conn = room.connections.get(targetId);
    if (conn) this.notifier.send(conn, ScribbleEvents.Kicked, { code: room.code });
    this.removePlayer(room, targetId);
    return room;
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  private applySettings(room: Room, patch: SettingsPatchInput): void {
    const next: RoomSettings = { ...room.settings };

    if (patch.decks !== undefined) next.decks = [...new Set(patch.decks)];
    if (patch.custom_words !== undefined) next.customWords = this.cleanCustomWords(patch.custom_words);
    if (patch.custom_only !== undefined) next.customOnly = patch.custom_only;
    if (patch.rounds !== undefined) next.rounds = patch.rounds;
    if (patch.turn_seconds !== undefined) next.turnSeconds = patch.turn_seconds;
    if (patch.max_players !== undefined) next.maxPlayers = patch.max_players;
    if (patch.letter_hints !== undefined) next.letterHints = patch.letter_hints;
    if (patch.three_word_choice !== undefined) next.threeWordChoice = patch.three_word_choice;
    if (patch.gentle_spelling !== undefined) next.gentleSpelling = patch.gentle_spelling;
    if (patch.is_private !== undefined) next.isPrivate = patch.is_private;

    if (next.maxPlayers < room.players.size) {
      throw badRequest(`There are already ${room.players.size} players in the room.`);
    }
    if (next.customOnly && next.customWords.length < MIN_CUSTOM_WORDS) {
      throw badRequest(`Custom-only games need at least ${MIN_CUSTOM_WORDS} custom words.`);
    }

    room.settings = next;
  }

  private cleanCustomWords(words: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of words) {
      const word = raw.trim().replace(/\s+/g, " ");
      const key = word.toLowerCase();
      if (!word || seen.has(key) || this.profanity.findOffendingWord(word)) continue;
      seen.add(key);
      out.push(word);
    }
    return out;
  }

  // ── Profiles ───────────────────────────────────────────────────────────────

  /**
   * Trim the name and mask anything the filter objects to, rather than rejecting the
   * profile outright — PRD §9 asks for masking so a player is never stuck at a form they
   * cannot get past.
   */
  private validProfile(profile: PlayerProfile): PlayerProfile {
    const name = profile.name.trim().replace(/\s+/g, " ");
    if (!name) throw badRequest("Pick a name first.");
    if (name.length > MAX_DISPLAY_NAME_LENGTH) {
      throw badRequest(`Names are ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
    }
    return { name: this.mask(name), avatarId: profile.avatarId, hatId: profile.hatId };
  }

  private mask(text: string): string {
    let out = text;
    // The filter reports one word at a time, so keep asking until it is satisfied.
    for (let i = 0; i < 8; i++) {
      const bad = this.profanity.findOffendingWord(out);
      if (!bad) break;
      out = out.replace(new RegExp(bad, "gi"), "*".repeat(bad.length));
    }
    return out;
  }

  // ── Auto-start for public lobbies (PRD §13.8) ──────────────────────────────

  private refreshAutostart(room: Room): void {
    const eligible =
      room.phase === "LOBBY" &&
      !room.settings.isPrivate &&
      room.players.size >= PUBLIC_LOBBY_AUTOSTART_MIN_PLAYERS;

    if (!eligible) {
      if (room.autostartTimer) clearTimeout(room.autostartTimer);
      room.autostartTimer = null;
      room.autostartAt = null;
      return;
    }
    if (room.autostartTimer) return; // already counting down

    room.autostartAt = Date.now() + PUBLIC_LOBBY_AUTOSTART_SECONDS * 1000;
    room.autostartTimer = setTimeout(() => {
      room.autostartTimer = null;
      room.autostartAt = null;
      if (this.store.get(room.code) === room && room.phase === "LOBBY") this.onMatchStart(room);
    }, PUBLIC_LOBBY_AUTOSTART_SECONDS * 1000);
    room.autostartTimer.unref();
  }

  // ── Lookups ────────────────────────────────────────────────────────────────

  getRoom(rawCode: string): Room | undefined {
    const code = normalizeRoomCode(rawCode);
    return code ? this.store.get(code) : undefined;
  }

  private requireRoom(rawCode: string): Room {
    const room = this.getRoom(rawCode);
    if (!room) throw notFound("No room with that code.");
    return room;
  }

  private requireHost(rawCode: string, playerId: string): Room {
    const room = this.requireRoom(rawCode);
    if (room.hostId !== playerId) throw forbidden("Only the host can change that.");
    return room;
  }

  private verify(room: Room, playerId: string, token: string): boolean {
    const expected = this.sessions.get(room.code)?.get(playerId);
    return Boolean(token) && expected === token;
  }
}
