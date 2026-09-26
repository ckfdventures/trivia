import type { Collection, Db } from "mongodb";
import type { Question } from "../domain/models.js";

export interface QuestionRepository {
  insertMany(questions: Question[]): Promise<void>;
  /** Number of questions per theme id (themes with no questions are absent). */
  countByTheme(): Promise<Map<string, number>>;
  /** Count questions in one theme, or across all themes when `themeId` is null. */
  count(themeId: string | null): Promise<number>;
  /** Random sample of up to `size` questions from one theme, or from all themes when `themeId` is null. */
  sample(themeId: string | null, size: number): Promise<Question[]>;
  listByTheme(themeId: string): Promise<Question[]>;
  /** Returns false if no question had that id. */
  deleteById(id: string): Promise<boolean>;
  deleteByTheme(themeId: string): Promise<void>;
  ensureIndexes(): Promise<void>;
}

const themeFilter = (themeId: string | null) => (themeId === null ? {} : { theme_id: themeId });

export class MongoQuestionRepository implements QuestionRepository {
  private readonly collection: Collection<Question>;

  constructor(db: Db) {
    this.collection = db.collection<Question>("questions");
  }

  async insertMany(questions: Question[]): Promise<void> {
    if (questions.length === 0) return;
    await this.collection.insertMany(questions.map((q) => ({ ...q })));
  }

  async countByTheme(): Promise<Map<string, number>> {
    const rows = await this.collection
      .aggregate<{ _id: string; count: number }>([{ $group: { _id: "$theme_id", count: { $sum: 1 } } }])
      .toArray();
    return new Map(rows.map((r) => [r._id, r.count]));
  }

  count(themeId: string | null): Promise<number> {
    return this.collection.countDocuments(themeFilter(themeId));
  }

  sample(themeId: string | null, size: number): Promise<Question[]> {
    return this.collection
      .aggregate<Question>([{ $match: themeFilter(themeId) }, { $sample: { size } }, { $project: { _id: 0 } }])
      .toArray();
  }

  listByTheme(themeId: string): Promise<Question[]> {
    return this.collection.find({ theme_id: themeId }, { projection: { _id: 0 } }).sort({ created_at: 1 }).toArray();
  }

  async deleteById(id: string): Promise<boolean> {
    return (await this.collection.deleteOne({ id })).deletedCount > 0;
  }

  async deleteByTheme(themeId: string): Promise<void> {
    await this.collection.deleteMany({ theme_id: themeId });
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ id: 1 }, { unique: true });
    await this.collection.createIndex({ theme_id: 1 });
  }
}
