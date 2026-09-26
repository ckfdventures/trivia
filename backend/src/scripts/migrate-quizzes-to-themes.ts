/**
 * One-off migration: copy every question from the legacy `quizzes` collection into the
 * themed question pool under an "Uncategorized" theme. Safe to re-run: questions keep their
 * original ids and are only inserted if missing. The legacy collections are left untouched.
 *
 *   npm run migrate:quizzes
 */
import { loadConfig } from "../config/env.js";
import { DEFAULT_TIME_LIMIT, OPTIONS_PER_QUESTION } from "../domain/constants.js";
import type { Question } from "../domain/models.js";
import { connectMongo } from "../infrastructure/mongo.js";
import { MongoQuestionRepository } from "../repositories/question.repository.js";
import { MongoThemeRepository } from "../repositories/theme.repository.js";
import { WordListProfanityFilter } from "../services/profanity-filter.js";
import { QuestionValidator } from "../services/question-validator.js";
import { ThemeService } from "../services/theme.service.js";
import { nowIso } from "../shared/time.js";

const TARGET_THEME = "Uncategorized";

interface LegacyQuiz {
  id: string;
  questions?: { id?: string; text: string; options: string[]; correct_index: number; time_limit?: number }[];
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { client, db } = await connectMongo(config.mongoUrl, config.dbName);
  try {
    const themeRepo = new MongoThemeRepository(db);
    const questionRepo = new MongoQuestionRepository(db);
    await Promise.all([themeRepo.ensureIndexes(), questionRepo.ensureIndexes()]);
    const themes = new ThemeService(themeRepo, questionRepo, new QuestionValidator(new WordListProfanityFilter()));

    const quizzes = await db.collection<LegacyQuiz>("quizzes").find({}, { projection: { _id: 0 } }).toArray();
    const questions = quizzes.flatMap((quiz) => quiz.questions ?? []);
    if (questions.length === 0) {
      console.info("No legacy quiz questions found; nothing to migrate.");
      return;
    }

    const theme = await themes.findOrCreate(TARGET_THEME);
    const pool = db.collection<Question>("questions");
    const createdAt = nowIso();
    let inserted = 0;
    let skipped = 0;
    for (const q of questions) {
      if (!q.id || q.options?.length !== OPTIONS_PER_QUESTION) {
        skipped += 1;
        continue;
      }
      const result = await pool.updateOne(
        { id: q.id },
        {
          $setOnInsert: {
            id: q.id,
            theme_id: theme.id,
            text: q.text,
            options: q.options,
            correct_index: q.correct_index,
            time_limit: q.time_limit ?? DEFAULT_TIME_LIMIT,
            created_at: createdAt,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount) inserted += 1;
    }
    console.info(
      `Migrated ${inserted} new question(s) from ${quizzes.length} quiz(zes) into "${TARGET_THEME}"` +
        (skipped ? `; skipped ${skipped} malformed question(s)` : "") +
        ".",
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
