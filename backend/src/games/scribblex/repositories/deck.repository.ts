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

export interface DeckRepository {
  list(): Promise<DeckSummary[]>;
  wordsFor(deckIds: string[]): Promise<string[]>;
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
