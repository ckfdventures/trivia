import type { Profile, StoredSeat } from "./types";

/**
 * The player's identity, kept entirely in the browser — there are no accounts (PRD §2).
 *
 * Avatar art does not exist yet: the Stitch export points at Google-hosted generated images
 * that are neither licensed nor durable, so each avatar renders as a tinted disc with an emoji
 * until real illustrations land. PRD §6.2 allows exactly this. See DECISIONS.md P1.
 */

export interface Avatar {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  /** Disc colour behind the emoji; a Warm Doodle Pop token. */
  tint: string;
  /** Level needed to use it, if any. */
  unlockLevel?: number;
}

export const AVATARS: Avatar[] = [
  { id: "pip", name: "Pip Beret", blurb: "Classic Cozy", emoji: "🎨", tint: "#FFDF9A" },
  { id: "barnaby", name: "Barnaby Bark", blurb: "Playful Pup", emoji: "🐶", tint: "#FFDAD2" },
  { id: "mochi", name: "Mochi Whiskers", blurb: "Doodle Cat", emoji: "🐱", tint: "#7CF6EC" },
  { id: "teddy", name: "Professor Ted", blurb: "Thoughtful", emoji: "🧸", tint: "#FEC736" },
  { id: "bot", name: "Bot Scribble", blurb: "Gizmo Bot", emoji: "🤖", tint: "#B39DDB" },
  { id: "penny", name: "Penny Splash", blurb: "Painter", emoji: "🐧", tint: "#FF85A1" },
  { id: "foxy", name: "Foxy Palette", blurb: "Creative Fox", emoji: "🦊", tint: "#FF7A59" },
  { id: "owl", name: "Cosmic Owl", blurb: "Reach level 5", emoji: "🦉", tint: "#7BDCB5", unlockLevel: 5 },
];

export interface Hat {
  id: string;
  name: string;
  emoji: string;
}

export const HATS: Hat[] = [
  { id: "beret", name: "Beret", emoji: "🎩" },
  { id: "party", name: "Party Hat", emoji: "🥳" },
  { id: "scholar", name: "Scholar", emoji: "🎓" },
  { id: "headphones", name: "Headphones", emoji: "🎧" },
  { id: "royal", name: "Royal", emoji: "👑" },
];

export const findAvatar = (id: string): Avatar => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;
export const findHat = (id: string | null): Hat | null =>
  id ? HATS.find((h) => h.id === id) ?? null : null;

// ── Progression ──────────────────────────────────────────────────────────────

export const XP_PER_MATCH = 10;
export const XP_PER_CORRECT_GUESS = 5;
export const XP_PER_LEVEL = 100;

export const levelFor = (xp: number): number => Math.floor(xp / XP_PER_LEVEL) + 1;

/** How far through the current level, 0–1. */
export const levelProgress = (xp: number): number => (xp % XP_PER_LEVEL) / XP_PER_LEVEL;

export const isUnlocked = (avatar: Avatar, xp: number): boolean =>
  !avatar.unlockLevel || levelFor(xp) >= avatar.unlockLevel;

// ── Name generation ──────────────────────────────────────────────────────────

const NAME_PARTS_A = ["Doodle", "Sketch", "Scribble", "Pixel", "Neon", "Turbo", "Wobbly", "Cosmic"];
const NAME_PARTS_B = ["Fox", "Cat", "Bot", "Duck", "Wolf", "Bean", "Ghost", "Moth"];

export function randomName(): string {
  const a = NAME_PARTS_A[Math.floor(Math.random() * NAME_PARTS_A.length)]!;
  const b = NAME_PARTS_B[Math.floor(Math.random() * NAME_PARTS_B.length)]!;
  return `${a}${b}`;
}

export function randomProfile(xp = 0): Profile {
  const available = AVATARS.filter((a) => isUnlocked(a, xp));
  const avatar = available[Math.floor(Math.random() * available.length)]!;
  const hat = HATS[Math.floor(Math.random() * HATS.length)]!;
  return { name: randomName(), avatar_id: avatar.id, hat_id: hat.id };
}

// ── Storage ──────────────────────────────────────────────────────────────────

const PROFILE_KEY = "sx_profile";
const XP_KEY = "sx_xp";
const seatKey = (code: string) => `sx_seat_${code.toUpperCase()}`;

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or a full quota — the player just isn't remembered */
  }
}

export const loadProfile = (): Profile | null => read<Profile>(PROFILE_KEY);
export const saveProfile = (profile: Profile): void => write(PROFILE_KEY, profile);

export const loadXp = (): number => read<number>(XP_KEY) ?? 0;
export const addXp = (amount: number): number => {
  const next = loadXp() + amount;
  write(XP_KEY, next);
  return next;
};

export const loadSeat = (code: string): StoredSeat | null => read<StoredSeat>(seatKey(code));
export const saveSeat = (seat: StoredSeat): void => write(seatKey(seat.code), seat);
export const clearSeat = (code: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(seatKey(code));
  } catch {
    /* nothing to clean up */
  }
};
