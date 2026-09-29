/**
 * ScribbleX rules and limits. Values come from docs/PRD.md — §4 (game loop and scoring),
 * §7 (reconnects, payload limits) and §13 (resolved open questions).
 */

// ── Room identity ────────────────────────────────────────────────────────────
export const ROOM_CODE_LENGTH = 6;
/** Uppercase alphanumerics minus the pairs people misread aloud: 0/O and 1/I. PRD §13.2. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ── Players ──────────────────────────────────────────────────────────────────
export const MIN_PLAYERS_TO_START = 2;
export const MIN_MAX_PLAYERS = 2;
export const MAX_MAX_PLAYERS = 8;
export const DEFAULT_MAX_PLAYERS = 6;
export const MAX_DISPLAY_NAME_LENGTH = 16;

// ── Match dynamics ───────────────────────────────────────────────────────────
export const ROUND_OPTIONS = [3, 5, 8] as const;
export const DEFAULT_ROUNDS = 3;
export const TURN_SECONDS_OPTIONS = [45, 60, 80] as const;
export const DEFAULT_TURN_SECONDS = 60;

// ── Phase durations ──────────────────────────────────────────────────────────
export const WORD_PICK_SECONDS = 10;
export const REVEAL_SECONDS = 4;
export const RESULTS_SECONDS = 10;
/** Fractions of the turn elapsed at which a hint letter is revealed. */
export const HINT_REVEAL_POINTS = [0.5, 0.75] as const;
export const WORD_CHOICE_COUNT = 3;

// ── Scoring (PRD §4) ─────────────────────────────────────────────────────────
export const GUESS_BASE_POINTS = 50;
export const GUESS_SPEED_POINTS = 250;
export const DRAWER_POINTS_PER_GUESSER = 50;
export const DRAWER_POINTS_CAP = 300;
/** A guess accepted only because Gentle Spelling is on scores this share of the full award. */
export const GENTLE_SPELLING_MULTIPLIER = 0.75;

// ── Custom word lists ────────────────────────────────────────────────────────
export const MIN_CUSTOM_WORDS = 10;
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 32;

// ── Chat ─────────────────────────────────────────────────────────────────────
export const MAX_CHAT_LENGTH = 100;
export const CHAT_MIN_INTERVAL_MS = 500;

// ── Drawing payload limits (PRD §7) ──────────────────────────────────────────
export const MAX_STROKE_POINTS_PER_BATCH = 500;
export const MAX_STROKES_PER_TURN = 5000;

// ── Presence and lifetime ────────────────────────────────────────────────────
/** A disconnected player keeps their seat and score this long. */
export const RECONNECT_GRACE_MS = 30 * 1000;
/** A drawer gone longer than this forfeits the turn. */
export const DRAWER_DISCONNECT_SKIP_MS = 10 * 1000;
/** An empty room is discarded after this. */
export const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
export const ROOM_CLEANUP_INTERVAL_MS = 60 * 1000;

/** Public lobbies start on their own once enough players are waiting. PRD §13.8. */
export const PUBLIC_LOBBY_AUTOSTART_SECONDS = 55;
export const PUBLIC_LOBBY_AUTOSTART_MIN_PLAYERS = 3;
