/**
 * Words, guesses and hints.
 *
 * Guess evaluation is server-side only: the secret word never reaches a player who has not
 * earned it, so the client cannot be the one deciding whether a guess was right. PRD §4.
 */

/**
 * Fold a word or guess down to what actually matters for comparison: lower case, no accents,
 * no punctuation, single spaces. "Crème Brûlée!" and "creme brulee" are the same answer.
 */
export function normalizeWord(raw: string): string {
  return raw
    .normalize("NFD")
    // Strip combining marks left behind by the decomposition above.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Edit distance, bounded: once it cannot come in under `max` there is no point continuing. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1]! + 1, // insertion
        previous[j]! + 1, // deletion
        previous[j - 1]! + cost, // substitution
      );
      current.push(value);
      if (value < rowBest) rowBest = value;
    }
    if (rowBest > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/** How far off a guess may be and still count as "close". PRD §4. */
export function closeThreshold(word: string): number {
  return word.length <= 5 ? 1 : 2;
}

export type GuessVerdict = "correct" | "close" | "wrong";

/**
 * Judge a guess against the secret word.
 *
 * "close" is reported separately from "correct" so the caller can decide what it means: a
 * private nudge normally, or an accepted answer worth less when Gentle Spelling is on.
 */
export function judgeGuess(guess: string, word: string): GuessVerdict {
  const a = normalizeWord(guess);
  const b = normalizeWord(word);
  if (!a || !b) return "wrong";
  if (a === b) return "correct";

  const threshold = closeThreshold(b);
  return levenshtein(a, b, threshold) <= threshold ? "close" : "wrong";
}

/**
 * Whether a message gives the word away.
 *
 * Distinct from `judgeGuess`, which compares a whole message to the word: here the word may be
 * buried in a sentence, so "it's obviously a kitten" has to be caught as surely as "kitten".
 * Used to stop the drawer typing the answer, deliberately or by accident.
 */
export function revealsWord(text: string, word: string): boolean {
  const haystack = normalizeWord(text);
  const needle = normalizeWord(word);
  if (!haystack || !needle) return false;
  if (haystack.includes(needle)) return true;

  // Also catch a near-spelling sitting inside the sentence, so a deliberate typo is no escape.
  const threshold = closeThreshold(needle);
  const needleTokens = needle.split(" ");
  const tokens = haystack.split(" ");
  for (let i = 0; i + needleTokens.length <= tokens.length; i++) {
    const candidate = tokens.slice(i, i + needleTokens.length).join(" ");
    if (levenshtein(candidate, needle, threshold) <= threshold) return true;
  }
  return false;
}

/**
 * The word as guessers see it: one entry per character, letters hidden unless revealed.
 *
 * Spaces come through as spaces so the shape of a two-word answer is visible, which is a hint
 * everyone gets for free and stops "ice cream" looking like one long word.
 */
export function maskWord(word: string, revealed: number[] = []): (string | null)[] {
  const shown = new Set(revealed);
  return [...word].map((ch, i) => {
    if (ch === " ") return " ";
    return shown.has(i) ? ch : null;
  });
}

/** Indices of the letters in a word — the positions a hint may reveal. Spaces are never hints. */
export function letterIndices(word: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < word.length; i++) if (word[i] !== " ") out.push(i);
  return out;
}

/**
 * Pick one more letter to give away, avoiding those already revealed.
 *
 * Never reveals the last hidden letter: handing over a word with one blank left is barely a
 * puzzle, and it would let a guesser who has stopped trying still score.
 */
export function nextHintIndex(
  word: string,
  revealed: number[],
  random: () => number = Math.random,
): number | null {
  const shown = new Set(revealed);
  const candidates = letterIndices(word).filter((i) => !shown.has(i));
  if (candidates.length <= 1) return null;
  return candidates[Math.floor(random() * candidates.length)] ?? null;
}
