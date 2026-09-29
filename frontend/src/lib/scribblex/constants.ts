/**
 * Client-side mirrors of the server's ScribbleX limits.
 *
 * These exist so a form can stop a player before a round trip; the server validates
 * independently and its answer always wins. Keep in step with
 * `backend/src/games/scribblex/domain/constants.ts`.
 */

export const MAX_NAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 6;
/** Mirrors the server: no 0/O or 1/I, because codes get read aloud. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Canonicalise whatever the player typed — lower case, spaces, the dash from the displayed
 * form — or null if it could never be a room code. The server checks again regardless.
 */
export function normalizeRoomCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== ROOM_CODE_LENGTH) return null;
  return [...cleaned].every((ch) => ROOM_CODE_ALPHABET.includes(ch)) ? cleaned : null;
}

export const ROUND_OPTIONS = [3, 5, 8] as const;
export const TURN_SECONDS_OPTIONS = [45, 60, 80] as const;

export const MIN_MAX_PLAYERS = 2;
export const MAX_MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;

export const MIN_CUSTOM_WORDS = 10;
export const MAX_CHAT_LENGTH = 100;
