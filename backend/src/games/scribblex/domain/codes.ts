import { randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants.js";

/**
 * Room codes are read aloud and typed by hand, so the alphabet leaves out the characters
 * people confuse (0/O, 1/I) and everything is upper case. PRD §13.2.
 */
export function generateRoomCode(): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Accept what a person actually types — lower case, spaces, the dash from the displayed
 * form — and return the canonical code, or null if it could never be one.
 */
export function normalizeRoomCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/** `ABC123` → `ABC-123`, the form shown on screen. */
export function formatRoomCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}
