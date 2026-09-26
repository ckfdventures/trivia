import { MAX_THEME_NAME_LENGTH, MAX_TIME_LIMIT, MIN_TIME_LIMIT, OPTIONS_PER_QUESTION } from "../domain/constants.js";
import type { QuestionInput } from "../domain/models.js";
import { badRequest } from "../shared/http-error.js";
import type { ProfanityFilter } from "./profanity-filter.js";

/** Business rules for question-pool content: theme names and questions. */
export class QuestionValidator {
  constructor(private readonly profanity: ProfanityFilter) {}

  /** Returns the trimmed name, or throws a 400 if it is empty, too long or profane. */
  validThemeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) throw badRequest("Theme name is required");
    if (trimmed.length > MAX_THEME_NAME_LENGTH) throw badRequest(`Theme name must be ${MAX_THEME_NAME_LENGTH} characters or fewer`);
    const word = this.profanity.findOffendingWord(trimmed);
    if (word) throw badRequest(`Theme name contains inappropriate language ('${word}')`);
    return trimmed;
  }

  /** Throws a 400 describing the first rule `q` (at zero-based `idx`) violates. */
  assertValidQuestion(q: QuestionInput, idx: number): void {
    const label = `Question ${idx + 1}`;
    if (!q.text.trim()) throw badRequest(`${label}: text is required`);
    if (q.options.length !== OPTIONS_PER_QUESTION) throw badRequest(`${label}: exactly 4 options are required`);
    q.options.forEach((opt, j) => {
      if (!opt.trim()) throw badRequest(`${label}: option ${j + 1} is empty`);
    });
    if (q.correct_index < 0 || q.correct_index > OPTIONS_PER_QUESTION - 1) {
      throw badRequest(`${label}: correct_index must be 0-3`);
    }
    if (q.time_limit < MIN_TIME_LIMIT || q.time_limit > MAX_TIME_LIMIT) {
      throw badRequest(`${label}: time_limit must be 5-120s`);
    }

    const textWord = this.profanity.findOffendingWord(q.text);
    if (textWord) throw badRequest(`${label}: contains inappropriate language ('${textWord}')`);
    q.options.forEach((opt, j) => {
      const word = this.profanity.findOffendingWord(opt);
      if (word) throw badRequest(`${label}, option ${j + 1}: contains inappropriate language ('${word}')`);
    });
  }
}
