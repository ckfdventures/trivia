import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVEAL_SECONDS,
  RESULTS_SECONDS,
  WORD_PICK_SECONDS,
} from "../src/games/scribblex/domain/constants.js";
import type { RoomConnection, RoomSettings } from "../src/games/scribblex/domain/room.js";
import type { SettingsPatchInput } from "../src/games/scribblex/http/schemas.js";
import { buildStandings, pointsForDrawer, pointsForGuess } from "../src/games/scribblex/domain/scoring.js";
import {
  judgeGuess,
  levenshtein,
  maskWord,
  nextHintIndex,
  normalizeWord,
  revealsWord,
} from "../src/games/scribblex/domain/words.js";
import type { WordSource } from "../src/games/scribblex/services/deck.service.js";
import { MatchEvents, ScribbleMatchService } from "../src/games/scribblex/services/match.service.js";
import { ScribbleRoomNotifier } from "../src/games/scribblex/services/room-notifier.js";
import { ScribbleRoomService } from "../src/games/scribblex/services/room.service.js";
import { ScribbleRoomStore } from "../src/games/scribblex/services/room-store.js";
import { WordListProfanityFilter } from "../src/services/profanity-filter.js";
import { silentLogger } from "../src/shared/logger.js";

class FakeConn implements RoomConnection {
  readonly sent: { event: string; data: any }[] = [];
  closed = false;
  constructor(readonly id: string) {}
  send(event: string, data: unknown): void {
    this.sent.push({ event, data });
  }
  close(): void {
    this.closed = true;
  }
  events(name: string) {
    return this.sent.filter((s) => s.event === name);
  }
  last(name: string) {
    return [...this.sent].reverse().find((s) => s.event === name)?.data;
  }
}

const profile = (name: string) => ({ name, avatarId: "pip", hatId: null });

/** Always offers the same three words, so tests can talk about a known secret. */
class FixedWords implements WordSource {
  constructor(private readonly words = ["kitten", "penguin", "dragon"]) {}
  async drawChoices(_s: RoomSettings, _used: Set<string>, count = 3): Promise<string[]> {
    return this.words.slice(0, count);
  }
}

/** A started match: three players connected, turn order fixed by join order. */
function startedMatch(settings: SettingsPatchInput = {}) {
  const store = new ScribbleRoomStore();
  const notifier = new ScribbleRoomNotifier(store);
  const match = new ScribbleMatchService(store, notifier, new FixedWords(), silentLogger);
  const rooms = new ScribbleRoomService(
    store,
    notifier,
    new WordListProfanityFilter(),
    (room) => match.autoStart(room),
    (room) => match.onDrawerLost(room),
  );

  const host = rooms.createRoom(profile("Host"), { decks: ["animals"], ...settings });
  const a = rooms.joinRoom(host.room.code, profile("Ana"));
  const b = rooms.joinRoom(host.room.code, profile("Bo"));
  const code = host.room.code;

  const conns = {
    host: new FakeConn("c-host"),
    a: new FakeConn("c-a"),
    b: new FakeConn("c-b"),
  };
  rooms.connect(code, host.playerId, host.sessionToken, conns.host);
  rooms.connect(code, a.playerId, a.sessionToken, conns.a);
  rooms.connect(code, b.playerId, b.sessionToken, conns.b);

  return { store, notifier, match, rooms, code, host, a, b, conns, room: () => store.get(code)! };
}

describe("normalizeWord", () => {
  it("folds case, accents, punctuation and spacing", () => {
    expect(normalizeWord("  Crème   Brûlée! ")).toBe("creme brulee");
    expect(normalizeWord("HOT-DOG")).toBe("hotdog");
    expect(normalizeWord("ice  cream")).toBe("ice cream");
  });

  it("returns empty for something with nothing to compare", () => {
    expect(normalizeWord("!!!")).toBe("");
  });
});

describe("levenshtein", () => {
  it("measures edits", () => {
    expect(levenshtein("cat", "cat")).toBe(0);
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("gives up early once it cannot come in under the bound", () => {
    expect(levenshtein("abc", "xyzxyzxyz", 2)).toBeGreaterThan(2);
  });
});

describe("judgeGuess", () => {
  it("accepts an exact match however it is typed", () => {
    expect(judgeGuess("Kitten", "kitten")).toBe("correct");
    expect(judgeGuess("  KITTEN!  ", "kitten")).toBe("correct");
  });

  it("calls a one-letter slip close on a short word", () => {
    expect(judgeGuess("kittin", "kitten")).toBe("close");
  });

  it("allows two edits only on longer words", () => {
    expect(judgeGuess("penguim", "penguin")).toBe("close");
    expect(judgeGuess("bat", "cat")).toBe("close");
    // Two edits on a 3-letter word is a different word, not a typo.
    expect(judgeGuess("bad", "cat")).toBe("wrong");
  });

  it("rejects something unrelated", () => {
    expect(judgeGuess("elephant", "kitten")).toBe("wrong");
  });
});

describe("revealsWord", () => {
  it("catches the word buried in a sentence", () => {
    // The case that slipped through a whole-message comparison.
    expect(revealsWord("it's obviously a kitten", "kitten")).toBe(true);
    expect(revealsWord("KITTEN!!", "kitten")).toBe(true);
  });

  it("catches a deliberate misspelling of it", () => {
    expect(revealsWord("think of a kittin", "kitten")).toBe(true);
  });

  it("catches a two-word answer written out", () => {
    expect(revealsWord("looks like an ice cream to me", "ice cream")).toBe(true);
  });

  it("allows a legitimate hint that stops short", () => {
    expect(revealsWord("think small and fluffy", "kitten")).toBe(false);
    expect(revealsWord("it has whiskers", "kitten")).toBe(false);
  });
});

describe("maskWord and hints", () => {
  it("hides letters but shows word shape", () => {
    expect(maskWord("ice cream")).toEqual([null, null, null, " ", null, null, null, null, null]);
  });

  it("shows revealed letters in place", () => {
    expect(maskWord("cat", [0, 2])).toEqual(["c", null, "t"]);
  });

  it("never reveals the last hidden letter", () => {
    // Two letters left is fine; one is not.
    expect(nextHintIndex("cat", [0], () => 0)).not.toBeNull();
    expect(nextHintIndex("cat", [0, 1])).toBeNull();
  });

  it("never offers a space as a hint", () => {
    const picks = new Set<number | null>();
    for (let i = 0; i < 40; i++) picks.add(nextHintIndex("ice cream", []));
    expect(picks.has(3)).toBe(false);
  });
});

describe("scoring", () => {
  it("pays more the earlier the guess", () => {
    const early = pointsForGuess({ msRemaining: 60_000, turnSeconds: 60 });
    const late = pointsForGuess({ msRemaining: 0, turnSeconds: 60 });
    expect(early).toBe(300);
    expect(late).toBe(50);
    expect(early).toBeGreaterThan(late);
  });

  it("stays inside the advertised range", () => {
    for (const ms of [-5000, 0, 15_000, 30_000, 60_000, 90_000]) {
      const points = pointsForGuess({ msRemaining: ms, turnSeconds: 60 });
      expect(points).toBeGreaterThanOrEqual(50);
      expect(points).toBeLessThanOrEqual(300);
    }
  });

  it("pays a lenient guess three quarters", () => {
    const full = pointsForGuess({ msRemaining: 60_000, turnSeconds: 60 });
    const lenient = pointsForGuess({ msRemaining: 60_000, turnSeconds: 60, lenient: true });
    expect(lenient).toBe(Math.round(full * 0.75));
  });

  it("pays the drawer per guesser, up to the cap", () => {
    expect(pointsForDrawer(0)).toBe(0);
    expect(pointsForDrawer(3)).toBe(150);
    expect(pointsForDrawer(20)).toBe(300);
  });
});

describe("standings", () => {
  it("shares a rank between equal scores and skips the next", () => {
    const { room, host, a, b } = startedMatch();
    const r = room();
    r.players.get(host.playerId)!.score = 300;
    r.players.get(a.playerId)!.score = 300;
    r.players.get(b.playerId)!.score = 100;

    const standings = buildStandings(r);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 3]);
    expect(standings.filter((s) => s.tied)).toHaveLength(2);
  });
});

describe("starting a match", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lets only the host start", () => {
    const { match, code, a } = startedMatch();
    expect(() => match.start(code, a.playerId)).toThrow(/only the host/i);
  });

  it("refuses to start without a word source", () => {
    const store = new ScribbleRoomStore();
    const notifier = new ScribbleRoomNotifier(store);
    const m = new ScribbleMatchService(store, notifier, new FixedWords(), silentLogger);
    const rooms = new ScribbleRoomService(store, notifier, new WordListProfanityFilter());
    const host = rooms.createRoom(profile("Host"));
    rooms.joinRoom(host.room.code, profile("Ana"));

    expect(() => m.start(host.room.code, host.playerId)).toThrow(/word deck/i);
  });

  it("moves into word pick and offers choices to the drawer alone", async () => {
    const { match, code, host, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);

    expect(conns.host.last(MatchEvents.WordChoices)?.words).toHaveLength(3);
    expect(conns.a.events(MatchEvents.WordChoices)).toHaveLength(0);
    expect(conns.b.events(MatchEvents.WordChoices)).toHaveLength(0);
  });

  it("takes the first word for a drawer who dithers", async () => {
    const { match, code, host, room, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    expect(room().phase).toBe("WORD_PICK");

    await vi.advanceTimersByTimeAsync(WORD_PICK_SECONDS * 1000 + 10);
    expect(room().phase).toBe("DRAWING");
    expect(conns.host.last(MatchEvents.Word)?.word).toBe("kitten");
  });
});

describe("the secret word", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reaches the drawer but nobody else", async () => {
    const { match, code, host, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    expect(conns.host.last(MatchEvents.Word)?.word).toBe("kitten");
    expect(conns.a.events(MatchEvents.Word)).toHaveLength(0);
    expect(conns.b.events(MatchEvents.Word)).toHaveLength(0);
  });

  it("never appears in anything a guesser receives", async () => {
    // Gentle spelling off, so the near miss below stays wrong and nobody earns the word.
    const { match, code, host, a, b, room, conns } = startedMatch({ gentle_spelling: false });
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    // Everything a guesser could see short of solving it: wrong guesses, a near miss, chat
    // from the drawer, both hint reveals, and every state broadcast along the way.
    match.guess(code, a.playerId, "puppy");
    match.guess(code, b.playerId, "elephant");
    match.guess(code, a.playerId, "kittin");
    match.guess(code, host.playerId, "think small and fluffy");
    await vi.advanceTimersByTimeAsync(room().settings.turnSeconds * 800);

    const guesserTraffic = JSON.stringify([...conns.a.sent, ...conns.b.sent]);
    expect(guesserTraffic).not.toContain("kitten");
    // The hints did fire — this is not passing because nothing happened.
    expect(conns.a.events(MatchEvents.Hint).length).toBeGreaterThan(0);
  });

  it("is sent to a guesser only once they have earned it", async () => {
    const { match, code, host, a, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    expect(conns.a.events(MatchEvents.Word)).toHaveLength(0);
    match.guess(code, a.playerId, "kitten");
    expect(conns.a.last(MatchEvents.Word)?.word).toBe("kitten");
    // Bo still has not guessed.
    expect(conns.b.events(MatchEvents.Word)).toHaveLength(0);
  });

  it("is not in the masked word sent at turn start", async () => {
    const { match, code, host, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    const start = conns.a.last(MatchEvents.TurnStart);
    expect(start.word_mask).toEqual([null, null, null, null, null, null]);
    expect(start.word_length).toBe(6);
  });
});

describe("guessing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function playing(settings: SettingsPatchInput = {}) {
    const ctx = startedMatch(settings);
    ctx.match.start(ctx.code, ctx.host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    ctx.match.pickWord(ctx.code, ctx.host.playerId, 0);
    return ctx;
  }

  it("scores a correct guess without broadcasting the guess text", async () => {
    const { match, code, a, room, conns } = await playing();
    match.guess(code, a.playerId, "kitten");

    expect(room().players.get(a.playerId)!.score).toBeGreaterThan(0);
    const correct = conns.b.events(MatchEvents.Chat).map((e) => e.data).filter((d) => d.kind === "correct");
    expect(correct).toHaveLength(1);
    expect(correct[0].text).toContain("guessed the word");
    expect(correct[0].points).toBeGreaterThan(0);
  });

  it("tells only the guesser they were close", async () => {
    // Gentle spelling off, so a near miss stays a near miss rather than being accepted.
    const { match, code, a, conns } = await playing({ gentle_spelling: false });
    match.guess(code, a.playerId, "kittin");

    const closeToA = conns.a.events(MatchEvents.Chat).filter((e) => e.data.kind === "close");
    const closeToB = conns.b.events(MatchEvents.Chat).filter((e) => e.data.kind === "close");
    expect(closeToA).toHaveLength(1);
    expect(closeToB).toHaveLength(0);
  });

  it("accepts a near miss when gentle spelling is on, for fewer points", async () => {
    const strict = await playing({ gentle_spelling: false });
    strict.match.guess(strict.code, strict.a.playerId, "kittin");
    expect(strict.room().players.get(strict.a.playerId)!.score).toBe(0);

    const gentle = await playing({ gentle_spelling: true });
    gentle.match.guess(gentle.code, gentle.a.playerId, "kittin");
    const lenientScore = gentle.room().players.get(gentle.a.playerId)!.score;
    expect(lenientScore).toBeGreaterThan(0);

    const exact = await playing();
    exact.match.guess(exact.code, exact.a.playerId, "kitten");
    expect(lenientScore).toBeLessThan(exact.room().players.get(exact.a.playerId)!.score);
  });

  it("stops the drawer from spelling it out", async () => {
    const { match, code, host, conns } = await playing();
    match.guess(code, host.playerId, "it's a kitten");

    const leaked = [...conns.a.sent, ...conns.b.sent].some((e) => JSON.stringify(e).includes("kitten"));
    expect(leaked).toBe(false);
    expect(conns.host.events(MatchEvents.Chat).some((e) => e.data.kind === "system")).toBe(true);
  });

  it("keeps a solved player's chatter away from those still guessing", async () => {
    const { match, code, a, conns } = await playing();
    match.guess(code, a.playerId, "kitten");
    const beforeB = conns.b.events(MatchEvents.Chat).length;

    match.guess(code, a.playerId, "so obvious once you see it");
    expect(conns.b.events(MatchEvents.Chat)).toHaveLength(beforeB);
    // The drawer can still see it.
    expect(conns.host.events(MatchEvents.Chat).some((e) => e.data.text?.includes("so obvious"))).toBe(true);
  });

  it("ends the turn as soon as everyone has it", async () => {
    const { match, code, a, b, room } = await playing();
    match.guess(code, a.playerId, "kitten");
    expect(room().phase).toBe("DRAWING");

    match.guess(code, b.playerId, "kitten");
    expect(room().phase).toBe("REVEAL");
  });

  it("pays the drawer for every player who got it", async () => {
    const { match, code, host, a, b, room } = await playing();
    match.guess(code, a.playerId, "kitten");
    match.guess(code, b.playerId, "kitten");
    expect(room().players.get(host.playerId)!.score).toBe(100);
  });
});

describe("turn and match lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reveals the word when the clock runs out, then moves on", async () => {
    const { match, code, host, room, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    await vi.advanceTimersByTimeAsync(room().settings.turnSeconds * 1000 + 10);
    expect(room().phase).toBe("REVEAL");
    expect(conns.a.last(MatchEvents.TurnEnd)?.word).toBe("kitten");

    await vi.advanceTimersByTimeAsync(REVEAL_SECONDS * 1000 + 10);
    expect(["WORD_PICK", "DRAWING"]).toContain(room().phase);
  });

  it("gives away letters as the turn wears on", async () => {
    const { match, code, host, room, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    const turnMs = room().settings.turnSeconds * 1000;
    await vi.advanceTimersByTimeAsync(turnMs * 0.5 + 50);
    expect(conns.a.events(MatchEvents.Hint)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(turnMs * 0.25 + 50);
    expect(conns.a.events(MatchEvents.Hint)).toHaveLength(2);
    expect(conns.a.last(MatchEvents.Hint).word_mask.filter(Boolean)).toHaveLength(2);
  });

  it("gives no hints when the modifier is off", async () => {
    const { match, code, host, rooms, room, conns } = startedMatch();
    rooms.updateSettings(code, host.playerId, { letter_hints: false });
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    await vi.advanceTimersByTimeAsync(room().settings.turnSeconds * 900);
    expect(conns.a.events(MatchEvents.Hint)).toHaveLength(0);
  });

  it("plays every player once per round, then ends and returns to the lobby", async () => {
    const { match, code, host, rooms, room, conns } = startedMatch();
    rooms.updateSettings(code, host.playerId, { rounds: 3, three_word_choice: false });
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);

    const turnMs = room().settings.turnSeconds * 1000;
    // 3 rounds x 3 players, each turn running its full clock plus the reveal.
    for (let i = 0; i < 9; i++) {
      await vi.advanceTimersByTimeAsync(turnMs + 50);
      await vi.advanceTimersByTimeAsync(REVEAL_SECONDS * 1000 + 50);
    }

    expect(room().phase).toBe("RESULTS");
    expect(conns.a.last(MatchEvents.MatchEnd)?.standings).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(RESULTS_SECONDS * 1000 + 50);
    expect(room().phase).toBe("LOBBY");
    expect(room().word).toBeNull();
    // The podium has been shown; the lobby roster should not still carry last match's points.
    expect([...room().players.values()].every((p) => p.score === 0)).toBe(true);
  });

  it("lets the host start another match from the results screen", async () => {
    const { match, code, host, rooms, room } = startedMatch();
    rooms.updateSettings(code, host.playerId, { rounds: 3, three_word_choice: false });
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);

    const turnMs = room().settings.turnSeconds * 1000;
    for (let i = 0; i < 9; i++) {
      await vi.advanceTimersByTimeAsync(turnMs + 50);
      await vi.advanceTimersByTimeAsync(REVEAL_SECONDS * 1000 + 50);
    }
    expect(room().phase).toBe("RESULTS");

    match.playAgain(code, host.playerId);
    expect(room().phase).toBe("LOBBY");
  });

  it("clears the canvas between turns", async () => {
    const { match, code, host, room } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);
    room().canvas.ops.push({
      kind: "stroke", id: "s", playerId: host.playerId, tool: "pencil",
      color: "#1F1A21", size: 0.013, points: [{ x: 0, y: 0 }],
    });

    await vi.advanceTimersByTimeAsync(room().settings.turnSeconds * 1000 + 10);
    await vi.advanceTimersByTimeAsync(REVEAL_SECONDS * 1000 + 10);
    expect(room().canvas.ops).toHaveLength(0);
  });

  it("forfeits the turn when the drawer stays gone", async () => {
    const { match, rooms, code, host, room, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);
    expect(room().phase).toBe("DRAWING");

    rooms.disconnect(code, host.playerId, conns.host);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(room().phase).toBe("REVEAL");
  });

  it("keeps the turn going if the drawer comes straight back", async () => {
    const { match, rooms, code, host, room, conns } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    rooms.disconnect(code, host.playerId, conns.host);
    await vi.advanceTimersByTimeAsync(3000);
    rooms.connect(code, host.playerId, host.sessionToken, new FakeConn("c-host-2"));
    await vi.advanceTimersByTimeAsync(11_000);

    expect(room().phase).toBe("DRAWING");
  });
});

describe("reconnecting mid-turn", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives the drawer their word back", async () => {
    const { match, rooms, code, host, room } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    const fresh = new FakeConn("c-host-2");
    rooms.connect(code, host.playerId, host.sessionToken, fresh);
    match.syncPlayer(room(), host.playerId, fresh);
    expect(fresh.last(MatchEvents.Word)?.word).toBe("kitten");
  });

  it("does not hand the word to a guesser who has not got it", async () => {
    const { match, rooms, code, host, a, room } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);

    const fresh = new FakeConn("c-a-2");
    rooms.connect(code, a.playerId, a.sessionToken, fresh);
    match.syncPlayer(room(), a.playerId, fresh);
    expect(fresh.events(MatchEvents.Word)).toHaveLength(0);
    expect(JSON.stringify(fresh.sent)).not.toContain("kitten");
  });

  it("gives it back to a guesser who already solved it", async () => {
    const { match, rooms, code, host, a, room } = startedMatch();
    match.start(code, host.playerId);
    await vi.advanceTimersByTimeAsync(0);
    match.pickWord(code, host.playerId, 0);
    match.guess(code, a.playerId, "kitten");

    const fresh = new FakeConn("c-a-2");
    rooms.connect(code, a.playerId, a.sessionToken, fresh);
    match.syncPlayer(room(), a.playerId, fresh);
    expect(fresh.last(MatchEvents.Word)?.word).toBe("kitten");
  });
});
