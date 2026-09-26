export interface ProfanityFilter {
  /** The first offending word found in `text`, or null if it is clean. */
  findOffendingWord(text: string): string | null;
}

// Small demo wordlist — kept SFW to avoid embedding slurs in source.
// Extend as needed; matching is case-insensitive and word-boundary aware.
export const DEFAULT_BAD_WORDS = [
  "idiot",
  "stupid",
  "damn",
  "hell",
  "crap",
  "sucks",
  "moron",
  "loser",
  "shutup",
  "shut-up",
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class WordListProfanityFilter implements ProfanityFilter {
  private readonly patterns: { word: string; regex: RegExp }[];

  constructor(words: readonly string[] = DEFAULT_BAD_WORDS) {
    // Unicode-aware word boundaries, so e.g. "hello" or "shell" don't match "hell".
    this.patterns = words.map((word) => ({
      word,
      regex: new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`, "u"),
    }));
  }

  findOffendingWord(text: string): string | null {
    if (!text) return null;
    const lowered = text.toLowerCase();
    return this.patterns.find((p) => p.regex.test(lowered))?.word ?? null;
  }
}
