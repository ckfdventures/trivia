/**
 * Shapes returned by the ScribbleX API and its socket events.
 *
 * Mirrors `backend/src/games/scribblex/domain/room-view.ts` by hand, the same way the trivia
 * game's `lib/types.ts` mirrors its backend. The secret word is deliberately absent: it never
 * travels in room state, only in a targeted event to the drawer and to players who have
 * already guessed.
 */

export type RoomPhase = "LOBBY" | "WORD_PICK" | "DRAWING" | "REVEAL" | "RESULTS";

export interface RoomPlayer {
  id: string;
  name: string;
  avatar_id: string;
  hat_id: string | null;
  score: number;
  connected: boolean;
  ready: boolean;
  guessed_this_turn: boolean;
  is_host: boolean;
}

export interface RoomSettings {
  decks: string[];
  custom_word_count: number;
  custom_only: boolean;
  rounds: number;
  turn_seconds: number;
  max_players: number;
  letter_hints: boolean;
  three_word_choice: boolean;
  gentle_spelling: boolean;
  is_private: boolean;
}

/** The half of the settings a host may change, in wire shape. Every field optional. */
export type SettingsPatch = Partial<
  Pick<
    RoomSettings,
    | "decks"
    | "custom_only"
    | "rounds"
    | "turn_seconds"
    | "max_players"
    | "letter_hints"
    | "three_word_choice"
    | "gentle_spelling"
    | "is_private"
  >
> & { custom_words?: string[] };

export interface RoomState {
  code: string;
  display_code: string;
  host_id: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: RoomPlayer[];
  round: number;
  total_rounds: number;
  drawer_id: string | null;
  /** Blanks plus any revealed hints. The word itself never travels in room state. */
  word_mask: (string | null)[] | null;
  word_length: number;
  ends_at: number | null;
  autostart_at: number | null;
  can_start: boolean;
  start_blocked_reason: string | null;
  server_now: number;
}

export interface DeckSummary {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  word_count: number;
}

export interface RoomSummary {
  code: string;
  display_code: string;
  phase: RoomPhase;
  player_count: number;
  max_players: number;
  round: number;
  total_rounds: number;
}

/** What the server hands back when you create or join — enough to open a socket. */
export interface Seat {
  code: string;
  display_code: string;
  player_id: string;
  session_token: string;
  room: RoomState;
}

/** Stored in localStorage as `sx_seat_<CODE>`. */
export interface StoredSeat {
  code: string;
  player_id: string;
  session_token: string;
}

/** Stored in localStorage as `sx_profile`. */
export interface Profile {
  name: string;
  avatar_id: string;
  hat_id: string | null;
}

/** Wire shape of a profile — the API uses snake_case throughout. */
export interface ProfilePayload {
  name: string;
  avatar_id: string;
  hat_id: string | null;
}

// ── Match events ─────────────────────────────────────────────────────────────

export interface TurnStart {
  drawer_id: string | null;
  /** One entry per character: a revealed letter, a space between words, or null. */
  word_mask: (string | null)[];
  word_length: number;
  ends_at: number;
  round: number;
  total_rounds: number;
  server_now: number;
}

export interface ScoreDelta {
  player_id: string;
  points: number;
  /** Set on the drawer's own line, which is earned differently from a guess. */
  as_drawer?: boolean;
}

export interface TurnEnd {
  word: string;
  ends_at: number;
  deltas: ScoreDelta[];
}

export interface Standing {
  player_id: string;
  name: string;
  avatar_id: string;
  hat_id: string | null;
  score: number;
  rank: number;
  tied: boolean;
}

export interface MatchStandings {
  standings: Standing[];
  ends_at: number;
}

export type ChatKind = "chat" | "system" | "close" | "correct";

export interface ChatMessage {
  kind: ChatKind;
  /** Null for messages from the game itself rather than a player. */
  from: { id: string; name: string } | null;
  text: string;
  points?: number;
}
