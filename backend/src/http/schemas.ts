import { z } from "zod";
import { DEFAULT_TIME_LIMIT } from "../domain/constants.js";

/** Integer that also accepts integer-valued strings such as "20". */
const int = () =>
  z.preprocess((v) => (typeof v === "string" && /^\s*-?\d+\s*$/.test(v) ? Number(v) : v), z.number().int());

export const questionInputSchema = z.object({
  text: z.string(),
  options: z.array(z.string()),
  correct_index: int(),
  time_limit: int().default(DEFAULT_TIME_LIMIT),
});

/** `theme_id: null` (or omitted) means a mix drawn from every theme. */
export const createRoomSchema = z.object({
  theme_id: z.string().nullish().transform((v) => v ?? null),
  /** When set, the host also plays under this nickname. */
  host_nickname: z.string().nullish().transform((v) => v ?? null),
  question_count: int().pipe(z.number().min(1)),
});

export const joinRoomSchema = z.object({ nickname: z.string() });

export const answerSchema = z.object({
  player_id: z.string(),
  session_token: z.string(),
  question_id: z.string(),
  option_index: int(),
});

export const loginSchema = z.object({ email: z.email(), password: z.string() });

export const hostTokenQuerySchema = z.object({ host_token: z.string() });

export const themeNameSchema = z.object({ name: z.string() });

/** Import into an existing theme (`theme_id`) or a named one that is created if missing (`theme_name`). */
export const importQuestionsSchema = z.union([
  z.object({ theme_id: z.string(), questions: z.array(questionInputSchema) }).strict(),
  z.object({ theme_name: z.string(), questions: z.array(questionInputSchema) }).strict(),
]);
