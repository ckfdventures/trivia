import { parse as parseCsv } from "csv-parse/sync";
import { DEFAULT_TIME_LIMIT, MAX_TIME_LIMIT, MIN_TIME_LIMIT, OPTIONS_PER_QUESTION } from "../domain/constants.js";
import type { QuestionInput } from "../domain/models.js";
import { badRequest } from "../shared/http-error.js";
import type { ProfanityFilter } from "./profanity-filter.js";

type RawRow = Record<string, unknown>;

export interface BankUploadResult {
  total_rows: number;
  valid_count: number;
  error_count: number;
  valid_rows: QuestionInput[];
  errors: string[];
}

/** Parses uploaded CSV/JSON question banks and validates them row by row. Nothing is saved. */
export class QuestionFileParser {
  constructor(private readonly profanity: ProfanityFilter) {}

  analyze(raw: Buffer, filename: string): BankUploadResult {
    if (raw.length === 0) throw badRequest("Empty file");
    const rows = this.parseRows(raw, filename);

    const valid: QuestionInput[] = [];
    const errors: string[] = [];
    rows.forEach((row, i) => {
      const result = this.validateRow(row, i + 1);
      if ("question" in result) valid.push(result.question);
      else errors.push(result.error);
    });
    return { total_rows: rows.length, valid_count: valid.length, error_count: errors.length, valid_rows: valid, errors };
  }

  private parseRows(raw: Buffer, filename: string): RawRow[] {
    const text = raw.toString("utf8");
    if (filename.toLowerCase().endsWith(".json")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw badRequest(`Invalid JSON: ${(err as Error).message}`);
      }
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsed = (parsed as RawRow).questions ?? [];
      }
      if (!Array.isArray(parsed)) throw badRequest("JSON must be a list of questions");
      return parsed.map((row) => (row !== null && typeof row === "object" && !Array.isArray(row) ? (row as RawRow) : {}));
    }

    // Anything else is treated as CSV with a header row.
    const records = parseCsv(text, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }) as RawRow[];
    return records;
  }

  private validateRow(row: RawRow, rowNumber: number): { question: QuestionInput } | { error: string } {
    const fail = (msg: string) => ({ error: `Row ${rowNumber}: ${msg}` });
    const pick = (...keys: string[]): unknown => {
      for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== "") return v;
      }
      return null;
    };

    const text = pick("text", "question", "question_text");
    if (!text) return fail("missing question text");

    const options: string[] = [];
    for (let i = 1; i <= OPTIONS_PER_QUESTION; i++) {
      const opt = pick(`option${i}`, `option_${i}`, `opt${i}`, `o${i}`);
      if (opt === null) return fail(`missing option${i}`);
      options.push(String(opt).trim());
    }
    if (!options.every(Boolean)) return fail("empty option value");

    // `correct_index` is zero-based like the API; the human-facing columns are numbered 1-4.
    const zeroBased = pick("correct_index");
    const oneBased = pick("correct_option", "correct", "answer");
    const correct = zeroBased ?? oneBased;
    if (correct === null) return fail("missing correct_option field");
    const correctIndex = this.resolveCorrectIndex(String(correct).trim().toLowerCase(), options, zeroBased !== null ? 0 : 1);
    if (correctIndex === null) {
      return fail(
        zeroBased !== null
          ? "correct_index must be 0-3 or match option text"
          : "correct_option must be 1-4 or match option text",
      );
    }

    let timeLimit = DEFAULT_TIME_LIMIT;
    const rawTime = pick("time_limit", "time", "seconds");
    if (rawTime !== null) {
      const s = String(rawTime);
      if (!/^\s*[+-]?\d+\s*$/.test(s)) return fail("time_limit must be an integer");
      timeLimit = parseInt(s, 10);
      if (timeLimit < MIN_TIME_LIMIT || timeLimit > MAX_TIME_LIMIT) return fail("time_limit must be 5-120 seconds");
    }

    for (const chunk of [String(text), ...options]) {
      const word = this.profanity.findOffendingWord(chunk);
      if (word) return fail(`contains inappropriate language ('${word}')`);
    }

    return { question: { text: String(text).trim(), options, correct_index: correctIndex, time_limit: timeLimit } };
  }

  /** A number counted from `base` (0 or 1), or the exact text of one of the options. */
  private resolveCorrectIndex(value: string, options: string[], base: 0 | 1): number | null {
    if (/^\d+$/.test(value)) {
      const idx = parseInt(value, 10) - base;
      return idx >= 0 && idx < OPTIONS_PER_QUESTION ? idx : null;
    }
    const idx = options.findIndex((o) => o.trim().toLowerCase() === value);
    return idx >= 0 ? idx : null;
  }
}
