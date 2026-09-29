import type { Collection, Db } from "mongodb";
import { SEED_DECKS } from "../data/decks.js";

/** A word deck as stored. Field names are part of the persisted contract. */
export interface DeckDocument {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  words: string[];
  created_at: string;
}

export interface DeckSummary {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  word_count: number;
}

/** Raised when a deck id is taken; the service turns it into a 409. */
export class DuplicateDeckError extends Error {}

export interface DeckRepository {
  list(): Promise<DeckSummary[]>;
  findById(id: string): Promise<DeckDocument | null>;
  wordsFor(deckIds: string[]): Promise<string[]>;
  insert(deck: DeckDocument): Promise<void>;
  updateMeta(id: string, meta: Pick<DeckDocument, "name" | "blurb" | "emoji">): Promise<boolean>;
  /** Add words, skipping any already present. Returns how many were actually new. */
  addWords(id: string, words: string[]): Promise<number>;
  removeWord(id: string, word: string): Promise<boolean>;
  deleteById(id: string): Promise<boolean>;
  ensureIndexes(): Promise<void>;
  /** Install the shipped decks if the collection is empty. Safe to call on every boot. */
  seedIfEmpty(): Promise<number>;
}

export class MongoDeckRepository implements DeckRepository {
  private readonly collection: Collection<DeckDocument>;

  constructor(db: Db) {
    this.collection = db.collection<DeckDocument>("scribblex_decks");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ id: 1 }, { unique: true });
  }

  async list(): Promise<DeckSummary[]> {
    const decks = await this.collection.find({}, { projection: { _id: 0 } }).toArray();
    return decks
      .map((d) => ({
        id: d.id,
        name: d.name,
        blurb: d.blurb,
        emoji: d.emoji,
        word_count: d.words?.length ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every word across the given decks, de-duplicated. */
  async wordsFor(deckIds: string[]): Promise<string[]> {
    if (deckIds.length === 0) return [];
    const decks = await this.collection
      .find({ id: { $in: deckIds } }, { projection: { _id: 0, words: 1 } })
      .toArray();

    const seen = new Set<string>();
    const out: string[] = [];
    for (const deck of decks) {
      for (const word of deck.words ?? []) {
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(word);
      }
    }
    return out;
  }

  async findById(id: string): Promise<DeckDocument | null> {
    return this.collection.findOne({ id }, { projection: { _id: 0 } });
  }

  async insert(deck: DeckDocument): Promise<void> {
    try {
      await this.collection.insertOne({ ...deck });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new DuplicateDeckError(deck.id);
      throw err;
    }
  }

  async updateMeta(id: string, meta: Pick<DeckDocument, "name" | "blurb" | "emoji">): Promise<boolean> {
    const res = await this.collection.updateOne({ id }, { $set: meta });
    return res.matchedCount > 0;
  }

  /**
   * Words are compared case-insensitively, so importing a list twice tops a deck up rather
   * than doubling it — which is what an owner re-uploading a corrected file expects.
   */
  async addWords(id: string, words: string[]): Promise<number> {
    const deck = await this.findById(id);
    if (!deck) return 0;

    const existing = new Set((deck.words ?? []).map((w) => w.toLowerCase()));
    const fresh: string[] = [];
    for (const word of words) {
      const key = word.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      fresh.push(word);
    }
    if (fresh.length === 0) return 0;

    await this.collection.updateOne({ id }, { $push: { words: { $each: fresh } } });
    return fresh.length;
  }

  async removeWord(id: string, word: string): Promise<boolean> {
    const res = await this.collection.updateOne({ id }, { $pull: { words: word } });
    return res.modifiedCount > 0;
  }

  async deleteById(id: string): Promise<boolean> {
    const res = await this.collection.deleteOne({ id });
    return res.deletedCount > 0;
  }

  async seedIfEmpty(): Promise<number> {
    if ((await this.collection.estimatedDocumentCount()) > 0) return 0;
    const now = new Date().toISOString();
    await this.collection.insertMany(
      SEED_DECKS.map((deck) => ({ ...deck, created_at: now })),
      { ordered: false },
    );
    return SEED_DECKS.length;
  }
}
