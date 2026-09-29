import { parse as parseCsv } from "csv-parse/sync";
import { badRequest } from "../../../shared/http-error.js";
import type { ProfanityFilter } from "../../../services/profanity-filter.js";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from "../domain/constants.js";

export interface WordUploadResult {
  total_rows: number;
  valid_count: number;
  error_count: number;
  valid_words: string[];
  errors: string[];
}

/**
 * Reads an uploaded word list and checks it line by line. Nothing is saved.
 *
 * Mirrors the question-bank upload: analyse, show the owner what will happen, then import on a
 * second call. Accepts the formats a word list actually turns up in — a plain text file, a CSV
 * column, or JSON — because asking someone to reformat a list of words is a poor trade.
 */
export class WordFileParser {
  constructor(private readonly profanity: ProfanityFilter) {}

  analyze(raw: Buffer, filename: string): WordUploadResult {
    if (raw.length === 0) throw badRequest("Empty file");

    const candidates = this.extract(raw, filename);
    const valid: string[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    candidates.forEach((candidate, i) => {
      const line = i + 1;
      const word = candidate.trim().replace(/\s+/g, " ");
      if (!word) return; // blank lines are not an error, just nothing

      const problem = this.problemWith(word, seen);
      if (problem) {
        errors.push(`Line ${line}: ${problem}`);
        return;
      }
      seen.add(word.toLowerCase());
      valid.push(word);
    });

    return {
      total_rows: candidates.filter((c) => c.trim()).length,
      valid_count: valid.length,
      error_count: errors.length,
      valid_words: valid,
      errors,
    };
  }

  /** Why this word cannot be used, or null if it can. */
  private problemWith(word: string, seen: Set<string>): string | null {
    if (word.length < MIN_WORD_LENGTH) return `"${word}" is shorter than ${MIN_WORD_LENGTH} characters`;
    if (word.length > MAX_WORD_LENGTH) return `"${word}" is longer than ${MAX_WORD_LENGTH} characters`;
    // Drawing prompts are words, not sentences or code.
    if (!/^[\p{L}\p{N}][\p{L}\p{N} '-]*$/u.test(word)) return `"${word}" contains unexpected characters`;
    if (seen.has(word.toLowerCase())) return `"${word}" appears more than once`;
    const bad = this.profanity.findOffendingWord(word);
    if (bad) return `"${word}" was rejected by the language filter`;
    return null;
  }

  /** Pull candidate words out of whichever format the file happens to be. */
  private extract(raw: Buffer, filename: string): string[] {
    const text = raw.toString("utf8");
    const name = filename.toLowerCase();

    if (name.endsWith(".json")) return this.fromJson(text);
    if (name.endsWith(".csv")) return this.fromCsv(text);
    // Plain text: one per line, and commas split too so a pasted list works either way.
    return text.split(/[\r\n,]+/);
  }

  private fromJson(text: string): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw badRequest(`Invalid JSON: ${(err as Error).message}`);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      parsed = (parsed as Record<string, unknown>).words ?? [];
    }
    if (!Array.isArray(parsed)) throw badRequest("Expected a JSON array of words, or { words: [...] }");

    return parsed.map((entry) => {
      if (typeof entry === "string") return entry;
      // Tolerate [{ word: "cat" }], which is what a spreadsheet export often produces.
      if (entry && typeof entry === "object" && typeof (entry as { word?: unknown }).word === "string") {
        return (entry as { word: string }).word;
      }
      return String(entry ?? "");
    });
  }

  private fromCsv(text: string): string[] {
    let rows: Record<string, unknown>[];
    try {
      rows = parseCsv(text, { columns: true, skip_empty_lines: true, trim: true });
    } catch {
      // No header row: treat the first column of each line as the word.
      return text.split(/[\r\n]+/).map((line) => line.split(",")[0] ?? "");
    }
    return rows.map((row) => {
      const named = row.word ?? row.Word ?? row.words ?? row.text;
      if (typeof named === "string") return named;
      const first = Object.values(row)[0];
      return typeof first === "string" ? first : "";
    });
  }
}
