import type { QuestionInput, ThemeSummary } from "../domain/models.js";
import type { QuestionRepository } from "../repositories/question.repository.js";
import { badRequest } from "../shared/http-error.js";
import { newId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type { QuestionValidator } from "./question-validator.js";
import type { ThemeService } from "./theme.service.js";

/** Target theme for an import: an existing theme by id, or a name to find-or-create. */
export type ImportTarget = { theme_id: string } | { theme_name: string };

export interface ImportResult {
  theme: ThemeSummary;
  imported: number;
}

/** Adds validated questions to a theme's pool. */
export class QuestionImportService {
  constructor(
    private readonly validator: QuestionValidator,
    private readonly themes: ThemeService,
    private readonly questions: QuestionRepository,
  ) {}

  /** Append questions to a theme's pool. All questions are validated before anything is written. */
  async importInto(target: ImportTarget, input: QuestionInput[]): Promise<ImportResult> {
    if (input.length === 0) throw badRequest("Nothing to import");
    input.forEach((q, i) => this.validator.assertValidQuestion(q, i));

    const theme =
      "theme_id" in target ? await this.themes.get(target.theme_id) : await this.themes.findOrCreate(target.theme_name);
    const themeId = theme.id;

    const createdAt = nowIso();
    await this.questions.insertMany(
      input.map((q) => ({
        id: newId(),
        theme_id: themeId,
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()),
        correct_index: q.correct_index,
        time_limit: q.time_limit,
        created_at: createdAt,
      })),
    );
    return { theme: await this.themes.get(themeId), imported: input.length };
  }
}
