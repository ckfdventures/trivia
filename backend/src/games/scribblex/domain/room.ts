import {
  DEFAULT_MAX_PLAYERS,
  DEFAULT_ROUNDS,
  DEFAULT_TURN_SECONDS,
  MIN_CUSTOM_WORDS,
  MIN_PLAYERS_TO_START,
} from "./constants.js";

/** Transport-agnostic handle to a connected client, mirroring the trivia game's `RoomConnection`. */
export interface RoomConnection {
  readonly id: string;
  send(event: string, data: unknown): void;
}

/**
 * Where a room is in the match.
 *
 * `LOBBY` is the only phase this module drives today; the rest are declared now so the
 * drawing and game-loop work has a shape to slot into rather than a type to rewrite.
 */
export type RoomPhase = "LOBBY" | "WORD_PICK" | "DRAWING" | "REVEAL" | "RESULTS";

export interface RoomSettings {
  /** Ids of the word decks in play. Empty only while `customOnly` is set. */
  decks: string[];
  customWords: string[];
  customOnly: boolean;
  rounds: number;
  turnSeconds: number;
  maxPlayers: number;
  letterHints: boolean;
  threeWordChoice: boolean;
  gentleSpelling: boolean;
  /** Private rooms are joinable by code but never listed publicly. */
  isPrivate: boolean;
}

export function defaultSettings(): RoomSettings {
  return {
    decks: [],
    customWords: [],
    customOnly: false,
    rounds: DEFAULT_ROUNDS,
    turnSeconds: DEFAULT_TURN_SECONDS,
    maxPlayers: DEFAULT_MAX_PLAYERS,
    letterHints: true,
    threeWordChoice: true,
    gentleSpelling: true,
    isPrivate: false,
  };
}

/** The part of a player that belongs to their device, not to any one room. */
export interface PlayerProfile {
  name: string;
  avatarId: string;
  hatId: string | null;
}

export interface Player extends PlayerProfile {
  /** Stable across reconnects; the browser holds it in localStorage. */
  id: string;
  score: number;
  connected: boolean;
  ready: boolean;
  guessedThisTurn: boolean;
  joinedAt: number;
  /** Set while the seat is being held open for a reconnect. */
  disconnectedAt: number | null;
  reconnectTimer: NodeJS.Timeout | null;
}

export interface Room {
  code: string;
  hostId: string;
  createdAt: number;
  settings: RoomSettings;
  players: Map<string, Player>;
  connections: Map<string, RoomConnection>;
  phase: RoomPhase;

  // ── Match progress. Unused until the game loop lands, but owned by the room from the start.
  round: number;
  drawerOrder: string[];
  drawerIndex: number;
  word: string | null;
  revealedIdx: number[];
  endsAt: number | null;
  usedWords: Set<string>;

  /** Countdown that auto-starts a public lobby once enough players are waiting. */
  autostartAt: number | null;
  autostartTimer: NodeJS.Timeout | null;
  /** Players removed by the host; they cannot rejoin this room. */
  kicked: Set<string>;
}

export function createRoom(params: {
  code: string;
  hostId: string;
  settings?: Partial<RoomSettings>;
}): Room {
  return {
    code: params.code,
    hostId: params.hostId,
    createdAt: Date.now(),
    settings: { ...defaultSettings(), ...params.settings },
    players: new Map(),
    connections: new Map(),
    phase: "LOBBY",
    round: 0,
    drawerOrder: [],
    drawerIndex: -1,
    word: null,
    revealedIdx: [],
    endsAt: null,
    usedWords: new Set(),
    autostartAt: null,
    autostartTimer: null,
    kicked: new Set(),
  };
}

export function createPlayer(id: string, profile: PlayerProfile): Player {
  return {
    id,
    ...profile,
    score: 0,
    connected: false,
    ready: false,
    guessedThisTurn: false,
    joinedAt: Date.now(),
    disconnectedAt: null,
    reconnectTimer: null,
  };
}

/** Players still holding a seat, oldest first — the order turns are taken in. */
export function playersByArrival(room: Room): Player[] {
  return [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
}

export function connectedPlayers(room: Room): Player[] {
  return [...room.players.values()].filter((p) => p.connected);
}

export function isFull(room: Room): boolean {
  return room.players.size >= room.settings.maxPlayers;
}

/** Everyone but the host has to be ready; the host starts the match instead. */
export function everyoneReady(room: Room): boolean {
  const others = [...room.players.values()].filter((p) => p.id !== room.hostId);
  return others.length > 0 && others.every((p) => p.ready);
}

/** Somewhere to draw words from. A room can exist without one; a match cannot start without one. */
export function hasWordSource(room: Room): boolean {
  const { customOnly, customWords, decks } = room.settings;
  if (customOnly) return customWords.length >= MIN_CUSTOM_WORDS;
  return decks.length > 0 || customWords.length > 0;
}

/**
 * Whether the host may start, and if not, what to tell them.
 *
 * A freshly created room fails this — it has no decks chosen yet — which is why it is a
 * question the lobby asks rather than a condition enforced when settings change.
 */
export function canStart(room: Room): { ok: boolean; reason: string | null } {
  if (room.phase !== "LOBBY") return { ok: false, reason: "The match has already started." };
  if (room.players.size < MIN_PLAYERS_TO_START) {
    return { ok: false, reason: `Waiting for ${MIN_PLAYERS_TO_START - room.players.size} more.` };
  }
  if (!hasWordSource(room)) return { ok: false, reason: "Pick at least one word deck." };
  return { ok: true, reason: null };
}

export function clearRoomTimers(room: Room): void {
  if (room.autostartTimer) clearTimeout(room.autostartTimer);
  room.autostartTimer = null;
  for (const player of room.players.values()) {
    if (player.reconnectTimer) clearTimeout(player.reconnectTimer);
    player.reconnectTimer = null;
  }
}
