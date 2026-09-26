import { type Collection, type Db, MongoServerError } from "mongodb";
import type { Theme } from "../domain/models.js";

export class DuplicateThemeError extends Error {}

export interface ThemeRepository {
  /** Throws DuplicateThemeError if a theme with the same name_key exists. */
  insert(theme: Theme): Promise<void>;
  findById(id: string): Promise<Theme | null>;
  findByNameKey(nameKey: string): Promise<Theme | null>;
  list(): Promise<Theme[]>;
  /** Throws DuplicateThemeError if another theme already uses the name. */
  rename(id: string, name: string, nameKey: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  ensureIndexes(): Promise<void>;
}

const isDuplicateKey = (err: unknown) => err instanceof MongoServerError && err.code === 11000;

export class MongoThemeRepository implements ThemeRepository {
  private readonly collection: Collection<Theme>;

  constructor(db: Db) {
    this.collection = db.collection<Theme>("themes");
  }

  async insert(theme: Theme): Promise<void> {
    try {
      await this.collection.insertOne({ ...theme });
    } catch (err) {
      if (isDuplicateKey(err)) throw new DuplicateThemeError(theme.name);
      throw err;
    }
  }

  findById(id: string): Promise<Theme | null> {
    return this.collection.findOne({ id }, { projection: { _id: 0 } });
  }

  findByNameKey(nameKey: string): Promise<Theme | null> {
    return this.collection.findOne({ name_key: nameKey }, { projection: { _id: 0 } });
  }

  list(): Promise<Theme[]> {
    return this.collection.find({}, { projection: { _id: 0 } }).sort({ name_key: 1 }).toArray();
  }

  async rename(id: string, name: string, nameKey: string): Promise<void> {
    try {
      await this.collection.updateOne({ id }, { $set: { name, name_key: nameKey } });
    } catch (err) {
      if (isDuplicateKey(err)) throw new DuplicateThemeError(name);
      throw err;
    }
  }

  async deleteById(id: string): Promise<void> {
    await this.collection.deleteOne({ id });
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ id: 1 }, { unique: true });
    await this.collection.createIndex({ name_key: 1 }, { unique: true });
  }
}
