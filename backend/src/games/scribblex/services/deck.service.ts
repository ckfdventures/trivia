import { badRequest, conflict, notFound } from "../../../shared/http-error.js";
import type { ProfanityFilter } from "../../../services/profanity-filter.js";
import { WORD_CHOICE_COUNT } from "../domain/constants.js";
import type { RoomSettings } from "../domain/room.js";
import { normalizeWord } from "../domain/words.js";
import {
  DuplicateDeckError,
  type DeckDocument,
  type DeckRepository,
  type DeckSummary,
} from "../repositories/deck.repository.js";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from "../domain/constants.js";

/** Supplies the words a match plays. */
export interface WordSource {
  /**
   * Offer `count` words a drawer may choose from, skipping anything already played this match.
   * Falls back to repeating words only once the pool is genuinely exhausted.
   */
  drawChoices(settings: RoomSettings, used: Set<string>, count?: number): Promise<string[]>;
}

/** A deck id: lower-case, url-safe, derived from the name so links stay readable. */
function toDeckId(name: string): string {
  const id = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!id) throw badRequest("Give the deck a name with letters or numbers in it.");
  return id;
}

export class ScribbleDeckService implements WordSource {
  constructor(
    private readonly decks: DeckRepository,
    private readonly profanity: ProfanityFilter,
  ) {}

  list(): Promise<DeckSummary[]> {
    return this.decks.list();
  }

  // ── Owner-facing ───────────────────────────────────────────────────────────

  /** One deck with its words, for the admin editor. */
  async get(id: string): Promise<DeckDocument> {
    const deck = await this.decks.findById(id);
    if (!deck) throw notFound("No deck with that id.");
    return deck;
  }

  async create(input: { name: string; blurb?: string; emoji?: string }): Promise<DeckSummary> {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) throw badRequest("Give the deck a name.");
    if (this.profanity.findOffendingWord(name)) throw badRequest("That deck name was rejected.");

    const deck: DeckDocument = {
      id: toDeckId(name),
      name,
      blurb: (input.blurb ?? "").trim().slice(0, 120),
      emoji: (input.emoji ?? "🎨").trim().slice(0, 8) || "🎨",
      words: [],
      created_at: new Date().toISOString(),
    };
    try {
      await this.decks.insert(deck);
    } catch (err) {
      if (err instanceof DuplicateDeckError) throw conflict(`A deck called "${name}" already exists.`);
      throw err;
    }
    return { id: deck.id, name: deck.name, blurb: deck.blurb, emoji: deck.emoji, word_count: 0 };
  }

  async update(
    id: string,
    input: { name?: string; blurb?: string; emoji?: string },
  ): Promise<DeckSummary> {
    const deck = await this.get(id);
    const name = (input.name ?? deck.name).trim().replace(/\s+/g, " ");
    if (!name) throw badRequest("Give the deck a name.");
    if (this.profanity.findOffendingWord(name)) throw badRequest("That deck name was rejected.");

    const meta = {
      name,
      blurb: (input.blurb ?? deck.blurb ?? "").trim().slice(0, 120),
      emoji: (input.emoji ?? deck.emoji ?? "🎨").trim().slice(0, 8) || "🎨",
    };
    // The id is deliberately left alone: rooms in play hold deck ids in their settings, and
    // renaming a deck should not pull the words out from under a match.
    await this.decks.updateMeta(id, meta);
    return { id, ...meta, word_count: deck.words?.length ?? 0 };
  }

  async delete(id: string): Promise<void> {
    if (!(await this.decks.deleteById(id))) throw notFound("No deck with that id.");
  }

  /** Add validated words to a deck. Returns how many were new. */
  async addWords(id: string, words: string[]): Promise<{ added: number; word_count: number }> {
    await this.get(id);
    const clean = this.cleanWords(words);
    if (clean.length === 0) throw badRequest("No usable words in that list.");

    const added = await this.decks.addWords(id, clean);
    const deck = await this.get(id);
    return { added, word_count: deck.words?.length ?? 0 };
  }

  async removeWord(id: string, word: string): Promise<{ word_count: number }> {
    await this.get(id);
    if (!(await this.decks.removeWord(id, word))) throw notFound("That word is not in the deck.");
    const deck = await this.get(id);
    return { word_count: deck.words?.length ?? 0 };
  }

  /** Trim, de-duplicate and filter. The parser does this for uploads; typed words come here. */
  private cleanWords(words: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of words) {
      const word = raw.trim().replace(/\s+/g, " ");
      const key = word.toLowerCase();
      if (
        word.length < MIN_WORD_LENGTH ||
        word.length > MAX_WORD_LENGTH ||
        seen.has(key) ||
        this.profanity.findOffendingWord(word)
      ) {
        continue;
      }
      seen.add(key);
      out.push(word);
    }
    return out;
  }

  async drawChoices(
    settings: RoomSettings,
    used: Set<string>,
    count = WORD_CHOICE_COUNT,
  ): Promise<string[]> {
    const pool = await this.pool(settings);
    if (pool.length === 0) throw badRequest("No words to play with — pick a deck.");

    const fresh = pool.filter((w) => !used.has(normalizeWord(w)));
    // Once every word has been played, start again rather than ending the match early.
    const source = fresh.length >= count ? fresh : fresh.length > 0 ? fresh : pool;
    return sample(source, Math.min(count, source.length));
  }

  /** The words in play: the chosen decks, plus any custom list — or only the custom list. */
  private async pool(settings: RoomSettings): Promise<string[]> {
    if (settings.customOnly) return [...settings.customWords];
    const fromDecks = await this.decks.wordsFor(settings.decks);
    if (settings.customWords.length === 0) return fromDecks;

    const seen = new Set(fromDecks.map((w) => w.toLowerCase()));
    return [...fromDecks, ...settings.customWords.filter((w) => !seen.has(w.toLowerCase()))];
  }
}

/** `count` distinct items, chosen uniformly — a partial Fisher-Yates over a copy. */
function sample<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(index, 1)[0]!);
  }
  return out;
}
