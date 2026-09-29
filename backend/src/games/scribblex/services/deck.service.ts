import { badRequest } from "../../../shared/http-error.js";
import { WORD_CHOICE_COUNT } from "../domain/constants.js";
import type { RoomSettings } from "../domain/room.js";
import { normalizeWord } from "../domain/words.js";
import type { DeckRepository, DeckSummary } from "../repositories/deck.repository.js";

/** Supplies the words a match plays. */
export interface WordSource {
  /**
   * Offer `count` words a drawer may choose from, skipping anything already played this match.
   * Falls back to repeating words only once the pool is genuinely exhausted.
   */
  drawChoices(settings: RoomSettings, used: Set<string>, count?: number): Promise<string[]>;
}

export class ScribbleDeckService implements WordSource {
  constructor(private readonly decks: DeckRepository) {}

  list(): Promise<DeckSummary[]> {
    return this.decks.list();
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
