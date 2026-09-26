import type { Question, Theme, ThemeSummary } from "../domain/models.js";
import type { GameQuiz } from "../domain/room.js";
import type { QuestionRepository } from "../repositories/question.repository.js";
import { DuplicateThemeError, type ThemeRepository } from "../repositories/theme.repository.js";
import { badRequest, conflict, notFound } from "../shared/http-error.js";
import { newId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type { QuestionValidator } from "./question-validator.js";

export const MIX_TITLE = "Mix";

const nameKey = (name: string) => name.trim().toLowerCase();

/** Supplies the questions for a new game. */
export interface QuestionSource {
  /** Draw `count` random questions from a theme, or from every theme when `themeId` is null. */
  drawQuestions(themeId: string | null, count: number): Promise<GameQuiz>;
}

/** The catalogue of themes and their question pools. */
export class ThemeService implements QuestionSource {
  constructor(
    private readonly themes: ThemeRepository,
    private readonly questions: QuestionRepository,
    private readonly validator: QuestionValidator,
  ) {}

  async list(): Promise<ThemeSummary[]> {
    const [themes, counts] = await Promise.all([this.themes.list(), this.questions.countByTheme()]);
    return themes.map((t) => ({ id: t.id, name: t.name, question_count: counts.get(t.id) ?? 0 }));
  }

  async get(id: string): Promise<ThemeSummary> {
    const theme = await this.require(id);
    return { id: theme.id, name: theme.name, question_count: await this.questions.count(id) };
  }

  async create(name: string): Promise<ThemeSummary> {
    const clean = this.validator.validThemeName(name);
    const theme: Theme = { id: newId(), name: clean, name_key: nameKey(clean), created_at: nowIso() };
    try {
      await this.themes.insert(theme);
    } catch (err) {
      if (err instanceof DuplicateThemeError) throw conflict(`A theme named '${clean}' already exists`);
      throw err;
    }
    return { id: theme.id, name: theme.name, question_count: 0 };
  }

  /** Find a theme by name (case-insensitive), creating it if it doesn't exist. */
  async findOrCreate(name: string): Promise<Theme> {
    const clean = this.validator.validThemeName(name);
    const key = nameKey(clean);
    const existing = await this.themes.findByNameKey(key);
    if (existing) return existing;
    const theme: Theme = { id: newId(), name: clean, name_key: key, created_at: nowIso() };
    try {
      await this.themes.insert(theme);
      return theme;
    } catch (err) {
      // Lost a race with a concurrent create of the same name; use the winner.
      if (!(err instanceof DuplicateThemeError)) throw err;
      return (await this.themes.findByNameKey(key))!;
    }
  }

  async rename(id: string, name: string): Promise<ThemeSummary> {
    await this.require(id);
    const clean = this.validator.validThemeName(name);
    try {
      await this.themes.rename(id, clean, nameKey(clean));
    } catch (err) {
      if (err instanceof DuplicateThemeError) throw conflict(`A theme named '${clean}' already exists`);
      throw err;
    }
    return { id, name: clean, question_count: await this.questions.count(id) };
  }

  /** Delete a theme and every question in it. */
  async delete(id: string): Promise<void> {
    await this.require(id);
    await this.questions.deleteByTheme(id);
    await this.themes.deleteById(id);
  }

  async listQuestions(themeId: string): Promise<Question[]> {
    await this.require(themeId);
    return this.questions.listByTheme(themeId);
  }

  async deleteQuestion(id: string): Promise<void> {
    if (!(await this.questions.deleteById(id))) throw notFound("Question not found");
  }

  async drawQuestions(themeId: string | null, count: number): Promise<GameQuiz> {
    const title = themeId === null ? MIX_TITLE : (await this.require(themeId)).name;
    const available = await this.questions.count(themeId);
    if (available === 0) throw badRequest(`No questions available in ${title} yet`);
    if (count > available) {
      throw badRequest(`Only ${available} question${available === 1 ? "" : "s"} available in ${title}`);
    }
    const drawn = await this.questions.sample(themeId, count);
    return {
      title,
      questions: drawn.map((q) => ({
        id: q.id,
        text: q.text,
        options: q.options,
        correct_index: q.correct_index,
        time_limit: q.time_limit,
      })),
    };
  }

  private async require(id: string): Promise<Theme> {
    const theme = await this.themes.findById(id);
    if (!theme) throw notFound("Theme not found");
    return theme;
  }
}
