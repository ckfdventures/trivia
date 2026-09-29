import {
  DRAWER_POINTS_CAP,
  DRAWER_POINTS_PER_GUESSER,
  GENTLE_SPELLING_MULTIPLIER,
  GUESS_BASE_POINTS,
  GUESS_SPEED_POINTS,
} from "./constants.js";
import type { Room } from "./room.js";

/**
 * Scoring. PRD §4.
 *
 * A correct guess is worth a flat amount plus a share of the time left, so guessing at all is
 * always worth something and guessing early is worth much more.
 */
export function pointsForGuess(params: {
  msRemaining: number;
  turnSeconds: number;
  /** True when only Gentle Spelling let this guess through. */
  lenient?: boolean;
}): number {
  const total = params.turnSeconds * 1000;
  const fraction = total <= 0 ? 0 : Math.min(1, Math.max(0, params.msRemaining / total));
  const raw = GUESS_BASE_POINTS + GUESS_SPEED_POINTS * fraction;
  return Math.round(params.lenient ? raw * GENTLE_SPELLING_MULTIPLIER : raw);
}

/** The drawer is paid per player who got there, up to a cap. */
export function pointsForDrawer(correctGuessers: number): number {
  return Math.min(DRAWER_POINTS_CAP, correctGuessers * DRAWER_POINTS_PER_GUESSER);
}

export interface Standing {
  player_id: string;
  name: string;
  avatar_id: string;
  hat_id: string | null;
  score: number;
  /** 1-based. Equal scores share a place, and the next place skips accordingly. */
  rank: number;
  tied: boolean;
}

/** Final placings, highest first. Equal scores share a rank. PRD §4. */
export function buildStandings(room: Room): Standing[] {
  const rows = [...room.players.values()]
    .map((p) => ({
      player_id: p.id,
      name: p.name,
      avatar_id: p.avatarId,
      hat_id: p.hatId,
      score: p.score,
      rank: 0,
      tied: false,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  let rank = 0;
  let previousScore: number | null = null;
  rows.forEach((row, i) => {
    if (row.score !== previousScore) {
      rank = i + 1;
      previousScore = row.score;
    }
    row.rank = rank;
  });

  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.score, (counts.get(row.score) ?? 0) + 1);
  for (const row of rows) row.tied = (counts.get(row.score) ?? 0) > 1;

  return rows;
}
