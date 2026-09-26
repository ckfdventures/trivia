import { roundHalfEven } from "../shared/math.js";
import { BASE_POINTS, STREAK_BONUS_STEP } from "./constants.js";

/**
 * Points for a correct answer: up to BASE_POINTS scaled by how much of the
 * time limit remained, plus a bonus for each consecutive correct answer before it.
 */
export function pointsForCorrectAnswer(timeTakenS: number, timeLimitS: number, previousStreak: number): number {
  const elapsedFraction = Math.min(timeTakenS / timeLimitS, 1);
  const base = roundHalfEven(BASE_POINTS * Math.max(0, 1 - elapsedFraction));
  return base + STREAK_BONUS_STEP * previousStreak;
}
