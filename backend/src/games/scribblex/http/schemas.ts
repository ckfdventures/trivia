import { z } from "zod";
import {
  MAX_CHAT_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_STROKE_POINTS_PER_BATCH,
  MAX_MAX_PLAYERS,
  MAX_WORD_LENGTH,
  MIN_MAX_PLAYERS,
  MIN_WORD_LENGTH,
  ROUND_OPTIONS,
  TURN_SECONDS_OPTIONS,
} from "../domain/constants.js";
import { isBrushSize, isPalette } from "../domain/drawing.js";

/**
 * Every socket payload is parsed through one of these before it reaches a service. The server
 * is authoritative, so nothing a client sends is trusted — including the sender's own identity,
 * which is taken from the authenticated connection rather than the message. PRD §7.
 */

export const profileSchema = z.object({
  name: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH),
  avatar_id: z.string().min(1).max(64),
  hat_id: z.string().min(1).max(64).nullish().transform((v) => v ?? null),
});

const customWordSchema = z.string().trim().min(MIN_WORD_LENGTH).max(MAX_WORD_LENGTH);

/** Settings a host may change. Every field is optional: the client sends only what changed. */
export const settingsPatchSchema = z
  .object({
    decks: z.array(z.string().min(1).max(64)).max(32),
    custom_words: z.array(customWordSchema).max(2000),
    custom_only: z.boolean(),
    rounds: z.union(ROUND_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]),
    turn_seconds: z.union(
      TURN_SECONDS_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]],
    ),
    max_players: z.number().int().min(MIN_MAX_PLAYERS).max(MAX_MAX_PLAYERS),
    letter_hints: z.boolean(),
    three_word_choice: z.boolean(),
    gentle_spelling: z.boolean(),
    is_private: z.boolean(),
  })
  .partial();

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;

export const createRoomSchema = z.object({
  profile: profileSchema,
  settings: settingsPatchSchema.optional(),
});

/** Joining and quick play both carry just a profile; the room code travels in the path. */
export const profileBodySchema = z.object({ profile: profileSchema });

export const readySchema = z.object({ ready: z.boolean() });

export const kickSchema = z.object({ player_id: z.string().min(1).max(64) });

export const chatSchema = z.object({ text: z.string().min(1).max(MAX_CHAT_LENGTH) });

// ── Drawing ──────────────────────────────────────────────────────────────────

const unit = z.number().min(0).max(1);
const pointSchema = z.object({ x: unit, y: unit });

/**
 * A batch of points for one stroke. The same `id` arrives repeatedly while the pointer moves
 * and each batch appends, so a long line never becomes one oversized message.
 */
export const strokeSchema = z.object({
  id: z.string().min(1).max(64),
  tool: z.enum(["pencil", "marker", "eraser"]),
  color: z.string().refine(isPalette, "colour is not on the palette"),
  size: z.number().refine(isBrushSize, "unknown brush size"),
  points: z.array(pointSchema).min(1).max(MAX_STROKE_POINTS_PER_BATCH),
});

export const fillSchema = z.object({
  id: z.string().min(1).max(64),
  color: z.string().refine(isPalette, "colour is not on the palette"),
  x: unit,
  y: unit,
});
