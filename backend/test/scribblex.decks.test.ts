import type { Db } from "mongodb";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { createContainer } from "../src/container.js";
import type {
  DeckDocument,
  DeckRepository,
  DeckSummary,
} from "../src/games/scribblex/repositories/deck.repository.js";
import { DuplicateDeckError } from "../src/games/scribblex/repositories/deck.repository.js";
import { ScribbleDeckService } from "../src/games/scribblex/services/deck.service.js";
import { WordFileParser } from "../src/games/scribblex/services/word-file-parser.js";
import { WordListProfanityFilter } from "../src/services/profanity-filter.js";
import { silentLogger } from "../src/shared/logger.js";

const filter = () => new WordListProfanityFilter();

/** In-memory stand-in so the deck rules can be tested without a database. */
class FakeDeckRepo implements DeckRepository {
  readonly decks = new Map<string, DeckDocument>();

  async list(): Promise<DeckSummary[]> {
    return [...this.decks.values()]
      .map((d) => ({ id: d.id, name: d.name, blurb: d.blurb, emoji: d.emoji, word_count: d.words.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async findById(id: string) {
    return this.decks.get(id) ?? null;
  }
  async wordsFor(ids: string[]) {
    return ids.flatMap((id) => this.decks.get(id)?.words ?? []);
  }
  async insert(deck: DeckDocument) {
    if (this.decks.has(deck.id)) throw new DuplicateDeckError(deck.id);
    this.decks.set(deck.id, { ...deck, words: [...deck.words] });
  }
  async updateMeta(id: string, meta: Pick<DeckDocument, "name" | "blurb" | "emoji">) {
    const deck = this.decks.get(id);
    if (!deck) return false;
    Object.assign(deck, meta);
    return true;
  }
  async addWords(id: string, words: string[]) {
    const deck = this.decks.get(id);
    if (!deck) return 0;
    const seen = new Set(deck.words.map((w) => w.toLowerCase()));
    const fresh = words.filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
    deck.words.push(...fresh);
    return fresh.length;
  }
  async removeWord(id: string, word: string) {
    const deck = this.decks.get(id);
    if (!deck) return false;
    const before = deck.words.length;
    deck.words = deck.words.filter((w) => w !== word);
    return deck.words.length < before;
  }
  async deleteById(id: string) {
    return this.decks.delete(id);
  }
  async ensureIndexes() {}
  async seedIfEmpty() {
    return 0;
  }
}

const service = () => {
  const repo = new FakeDeckRepo();
  return { repo, decks: new ScribbleDeckService(repo, filter()) };
};

describe("word file parser", () => {
  const parse = (body: string, name: string) => new WordFileParser(filter()).analyze(Buffer.from(body), name);

  it("reads one word per line from a text file", () => {
    const res = parse("penguin\notter\nsloth\n", "words.txt");
    expect(res.valid_words).toEqual(["penguin", "otter", "sloth"]);
    expect(res.error_count).toBe(0);
  });

  it("also splits a pasted comma list", () => {
    expect(parse("penguin, otter, sloth", "words.txt").valid_words).toEqual(["penguin", "otter", "sloth"]);
  });

  it("ignores blank lines rather than calling them errors", () => {
    const res = parse("penguin\n\n\notter\n", "words.txt");
    expect(res.valid_count).toBe(2);
    expect(res.error_count).toBe(0);
  });

  it("reads a JSON array, and the { words: [...] } wrapper", () => {
    expect(parse('["penguin","otter"]', "w.json").valid_words).toEqual(["penguin", "otter"]);
    expect(parse('{"words":["penguin"]}', "w.json").valid_words).toEqual(["penguin"]);
  });

  it("tolerates the object form a spreadsheet export produces", () => {
    expect(parse('[{"word":"penguin"}]', "w.json").valid_words).toEqual(["penguin"]);
  });

  it("reads a named CSV column", () => {
    expect(parse("word,notes\npenguin,cute\notter,\n", "w.csv").valid_words).toEqual(["penguin", "otter"]);
  });

  it("reports each rejected word with its line", () => {
    const res = parse("penguin\nab\notter\n", "words.txt");
    expect(res.valid_words).toEqual(["penguin", "otter"]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatch(/line 2/i);
    expect(res.errors[0]).toMatch(/shorter than/i);
  });

  it("rejects duplicates, whatever the casing", () => {
    const res = parse("penguin\nPenguin\n", "words.txt");
    expect(res.valid_count).toBe(1);
    expect(res.errors[0]).toMatch(/more than once/i);
  });

  it("rejects words the language filter objects to", () => {
    const res = parse("penguin\nidiot\n", "words.txt");
    expect(res.valid_count).toBe(1);
    expect(res.errors[0]).toMatch(/language filter/i);
  });

  it("rejects things that are not drawing prompts", () => {
    const res = parse("penguin\n<script>alert(1)</script>\n", "words.txt");
    expect(res.valid_count).toBe(1);
    expect(res.errors[0]).toMatch(/unexpected characters/i);
  });

  it("refuses an empty file", () => {
    expect(() => parse("", "words.txt")).toThrow(/empty/i);
  });

  it("refuses malformed JSON with a readable message", () => {
    expect(() => parse("{oh no", "w.json")).toThrow(/invalid json/i);
  });
});

describe("deck service", () => {
  it("derives a readable id from the name", async () => {
    const { decks } = service();
    expect((await decks.create({ name: "Cute Animals!" })).id).toBe("cute-animals");
    expect((await decks.create({ name: "  Crème  Brûlée " })).id).toBe("creme-brulee");
  });

  it("refuses a second deck with the same name", async () => {
    const { decks } = service();
    await decks.create({ name: "Animals" });
    await expect(decks.create({ name: "animals" })).rejects.toThrow(/already exists/i);
  });

  it("refuses a name the language filter objects to", async () => {
    const { decks } = service();
    await expect(decks.create({ name: "idiot" })).rejects.toThrow(/rejected/i);
  });

  it("keeps the id when a deck is renamed", async () => {
    const { decks } = service();
    const made = await decks.create({ name: "Animals" });
    const renamed = await decks.update(made.id, { name: "Creatures" });

    // Rooms in play hold deck ids in their settings; changing one would pull the words out
    // from under a live match.
    expect(renamed.id).toBe("animals");
    expect(renamed.name).toBe("Creatures");
  });

  it("tops a deck up rather than doubling it when the same list is added twice", async () => {
    const { decks } = service();
    const made = await decks.create({ name: "Animals" });

    expect(await decks.addWords(made.id, ["penguin", "otter"])).toEqual({ added: 2, word_count: 2 });
    expect(await decks.addWords(made.id, ["penguin", "sloth"])).toEqual({ added: 1, word_count: 3 });
  });

  it("drops unusable words instead of failing the whole import", async () => {
    const { decks } = service();
    const made = await decks.create({ name: "Animals" });
    const res = await decks.addWords(made.id, ["penguin", "ab", "idiot", "otter"]);
    expect(res).toEqual({ added: 2, word_count: 2 });
  });

  it("refuses an import with nothing usable in it", async () => {
    const { decks } = service();
    const made = await decks.create({ name: "Animals" });
    await expect(decks.addWords(made.id, ["ab", "x"])).rejects.toThrow(/no usable words/i);
  });

  it("removes a single word", async () => {
    const { decks } = service();
    const made = await decks.create({ name: "Animals" });
    await decks.addWords(made.id, ["penguin", "otter"]);

    expect(await decks.removeWord(made.id, "penguin")).toEqual({ word_count: 1 });
    await expect(decks.removeWord(made.id, "nothere")).rejects.toThrow(/not in the deck/i);
  });

  it("reports an unknown deck rather than failing obscurely", async () => {
    const { decks } = service();
    await expect(decks.get("nope")).rejects.toThrow(/no deck/i);
    await expect(decks.delete("nope")).rejects.toThrow(/no deck/i);
  });
});

describe("deck admin API", () => {
  const config: AppConfig = {
    port: 0,
    mongoUrl: "mongodb://unused",
    dbName: "test",
    corsOrigins: ["*"],
    jwtSecret: "test-secret",
    jwtExpiresHours: 1,
    adminEmail: "admin@example.com",
    adminPassword: "password123",
    turn: null,
  };
  const stubDb = () => ({ collection: () => ({}) }) as unknown as Db;
  const app = () => createApp(createContainer(config, stubDb(), silentLogger));

  it("requires authentication for every deck route", async () => {
    const server = app();
    const calls: (() => request.Test)[] = [
      () => request(server).get("/api/admin/scribblex/decks"),
      () => request(server).post("/api/admin/scribblex/decks").send({ name: "X" }),
      () => request(server).get("/api/admin/scribblex/decks/animals"),
      () => request(server).patch("/api/admin/scribblex/decks/animals").send({ name: "X" }),
      () => request(server).delete("/api/admin/scribblex/decks/animals"),
      () => request(server).post("/api/admin/scribblex/decks/animals/words").send({ words: ["cat"] }),
      () => request(server).delete("/api/admin/scribblex/decks/animals/words").send({ word: "cat" }),
      () => request(server).post("/api/admin/scribblex/decks/upload"),
    ];
    for (const call of calls) {
      const res = await call();
      expect([401, 403]).toContain(res.status);
    }
  });

  it("leaves the public deck catalogue open", async () => {
    // Choosing decks in a lobby needs no account; only editing them does.
    const res = await request(app()).get("/api/scribblex/decks");
    expect(res.status).not.toBe(401);
  });
});
