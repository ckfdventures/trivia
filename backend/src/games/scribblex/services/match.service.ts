import { conflict, forbidden, notFound } from "../../../shared/http-error.js";
import type { Logger } from "../../../shared/logger.js";
import { clear as clearCanvas } from "../domain/drawing.js";
import {
  HINT_REVEAL_POINTS,
  MAX_CHAT_LENGTH,
  REVEAL_SECONDS,
  RESULTS_SECONDS,
  WORD_PICK_SECONDS,
} from "../domain/constants.js";
import {
  activeGuessers,
  canStart,
  clearPhaseTimers,
  currentDrawer,
  playersByArrival,
  type Player,
  type Room,
  type RoomConnection,
} from "../domain/room.js";
import { buildStandings, pointsForDrawer, pointsForGuess } from "../domain/scoring.js";
import { judgeGuess, maskWord, nextHintIndex, normalizeWord, revealsWord } from "../domain/words.js";
import type { WordSource } from "./deck.service.js";
import type { ScribbleRoomNotifier } from "./room-notifier.js";
import type { ScribbleRoomStore } from "./room-store.js";

export const MatchEvents = {
  TurnStart: "turn:start",
  WordChoices: "turn:wordChoices",
  Word: "turn:word",
  Hint: "turn:hint",
  TurnEnd: "turn:end",
  MatchEnd: "match:end",
  Chat: "chat:message",
} as const;

export type ChatKind = "chat" | "system" | "close" | "correct";

/**
 * The match state machine.
 *
 *   LOBBY → WORD_PICK → DRAWING → REVEAL → (WORD_PICK …) → RESULTS → LOBBY
 *
 * Every timer runs here, on the server. Clients are told when a phase ends (`ends_at`) and
 * render their own countdown against it, so a slow or lying client cannot change what happens.
 *
 * The secret word is the thing this class most carefully guards: it is never in a broadcast,
 * only in `turn:word` sent to the drawer and, afterwards, to each player as they guess it.
 */
export class ScribbleMatchService {
  constructor(
    private readonly store: ScribbleRoomStore,
    private readonly notifier: ScribbleRoomNotifier,
    private readonly words: WordSource,
    private readonly logger: Logger,
  ) {}

  // ── Starting ───────────────────────────────────────────────────────────────

  /** Host-triggered start. */
  start(code: string, playerId: string): void {
    const room = this.requireRoom(code);
    if (room.hostId !== playerId) throw forbidden("Only the host can start the match.");
    const gate = canStart(room);
    if (!gate.ok) throw conflict(gate.reason ?? "Not ready to start.");
    void this.begin(room);
  }

  /** Used by the public-lobby countdown, which has no player behind it. */
  autoStart(room: Room): void {
    if (room.phase !== "LOBBY" || !canStart(room).ok) return;
    void this.begin(room);
  }

  private async begin(room: Room): Promise<void> {
    room.drawerOrder = playersByArrival(room).map((p) => p.id);
    room.drawerIndex = -1;
    room.round = 1;
    room.usedWords.clear();
    for (const player of room.players.values()) {
      player.score = 0;
      player.ready = false;
    }
    await this.nextTurn(room);
  }

  // ── Turn lifecycle ─────────────────────────────────────────────────────────

  private async nextTurn(room: Room): Promise<void> {
    clearPhaseTimers(room);
    room.drawerIndex += 1;

    if (room.drawerIndex >= room.drawerOrder.length) {
      room.drawerIndex = 0;
      room.round += 1;
    }
    if (room.round > room.settings.rounds) {
      this.finish(room);
      return;
    }

    // Skip anyone who has left or dropped; if nobody is left to draw, the match is over.
    const startedAt = room.drawerIndex;
    let drawer = currentDrawer(room);
    while (!drawer || !drawer.connected) {
      room.drawerIndex += 1;
      if (room.drawerIndex >= room.drawerOrder.length) {
        room.drawerIndex = 0;
        room.round += 1;
        if (room.round > room.settings.rounds) {
          this.finish(room);
          return;
        }
      }
      if (room.drawerIndex === startedAt) {
        this.finish(room);
        return;
      }
      drawer = currentDrawer(room);
    }

    room.word = null;
    room.revealedIdx = [];
    room.turnGuesses.clear();
    room.turnStartedAt = null;
    for (const player of room.players.values()) player.guessedThisTurn = false;
    clearCanvas(room.canvas);
    this.notifier.broadcast(room, "draw:clear", { generation: room.canvas.generation });

    let choices: string[];
    try {
      choices = await this.words.drawChoices(room.settings, room.usedWords);
    } catch (err) {
      this.logger.error(`scribblex: no words available in ${room.code}`, err);
      this.finish(room);
      return;
    }
    if (this.store.get(room.code) !== room) return; // room went away while we were loading

    if (!room.settings.threeWordChoice) {
      this.beginDrawing(room, choices[0]!);
      return;
    }

    room.wordChoices = choices;
    room.phase = "WORD_PICK";
    room.endsAt = Date.now() + WORD_PICK_SECONDS * 1000;
    this.notifier.broadcastState(room);

    const drawerConn = room.connections.get(drawer.id);
    if (drawerConn) this.notifier.send(drawerConn, MatchEvents.WordChoices, { words: choices });

    // Dithering costs the drawer nothing: on timeout the first word is taken for them.
    room.phaseTimer = this.after(room, WORD_PICK_SECONDS * 1000, () => {
      if (room.phase === "WORD_PICK") this.beginDrawing(room, room.wordChoices[0]!);
    });
  }

  pickWord(code: string, playerId: string, index: number): void {
    const room = this.requireRoom(code);
    if (room.phase !== "WORD_PICK") throw conflict("Not picking a word right now.");
    if (currentDrawer(room)?.id !== playerId) throw forbidden("Only the drawer picks the word.");

    const word = room.wordChoices[index];
    if (!word) throw conflict("That word is not on offer.");
    this.beginDrawing(room, word);
  }

  private beginDrawing(room: Room, word: string): void {
    clearPhaseTimers(room);
    room.word = word;
    room.wordChoices = [];
    room.usedWords.add(normalizeWord(word));
    room.revealedIdx = [];
    room.phase = "DRAWING";
    room.turnStartedAt = Date.now();
    room.endsAt = room.turnStartedAt + room.settings.turnSeconds * 1000;

    const drawer = currentDrawer(room);
    this.notifier.broadcast(room, MatchEvents.TurnStart, {
      drawer_id: drawer?.id ?? null,
      // Blanks only. The word itself goes to the drawer alone, below.
      word_mask: maskWord(word, []),
      word_length: word.length,
      ends_at: room.endsAt,
      round: room.round,
      total_rounds: room.settings.rounds,
      server_now: Date.now(),
    });

    const drawerConn = drawer ? room.connections.get(drawer.id) : undefined;
    if (drawerConn) this.notifier.send(drawerConn, MatchEvents.Word, { word });

    if (room.settings.letterHints) this.scheduleHints(room, word);
    room.phaseTimer = this.after(room, room.settings.turnSeconds * 1000, () => this.endTurn(room));
    this.notifier.broadcastState(room);
  }

  /** Give a letter away at each of the configured points through the turn. */
  private scheduleHints(room: Room, word: string): void {
    const turnMs = room.settings.turnSeconds * 1000;
    for (const fraction of HINT_REVEAL_POINTS) {
      const timer = this.after(room, Math.round(turnMs * fraction), () => {
        if (room.phase !== "DRAWING" || room.word !== word) return;
        const index = nextHintIndex(word, room.revealedIdx);
        if (index === null) return;
        room.revealedIdx.push(index);
        this.notifier.broadcast(room, MatchEvents.Hint, {
          word_mask: maskWord(word, room.revealedIdx),
        });
      });
      room.hintTimers.push(timer);
    }
  }

  // ── Guessing ───────────────────────────────────────────────────────────────

  /**
   * A chat message, which may or may not be a guess.
   *
   * Who sees it depends on who has already solved the word: players still guessing talk to
   * everyone, while those who are done talk only to each other and the drawer, so a casual
   * "it's obviously a penguin" cannot spoil it. PRD §4.
   */
  guess(code: string, playerId: string, rawText: string): void {
    const room = this.requireRoom(code);
    const player = room.players.get(playerId);
    if (!player) throw notFound("You are not in this room.");

    const text = rawText.trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;

    const drawer = currentDrawer(room);
    const isDrawer = drawer?.id === playerId;
    const playing = room.phase === "DRAWING" && Boolean(room.word);

    if (!playing) {
      this.say(room, { from: player, text, kind: "chat" });
      return;
    }

    // The drawer must not spell it out, deliberately or otherwise — including with the word
    // buried in a sentence, which a whole-message comparison would sail straight past.
    if (isDrawer) {
      if (revealsWord(text, room.word!)) {
        this.whisper(room, playerId, { text: "That would give it away.", kind: "system" });
        return;
      }
      this.say(room, { from: player, text, kind: "chat", audience: "solved" });
      return;
    }

    if (player.guessedThisTurn) {
      this.say(room, { from: player, text, kind: "chat", audience: "solved" });
      return;
    }

    const verdict = judgeGuess(text, room.word!);
    const lenient = verdict === "close" && room.settings.gentleSpelling;

    if (verdict === "correct" || lenient) {
      this.award(room, player, lenient);
      return;
    }
    if (verdict === "close") {
      // Only the guesser is told, so a near-miss never narrows it down for everyone else.
      this.whisper(room, playerId, { text: "So close!", kind: "close" });
      this.say(room, { from: player, text, kind: "chat" });
      return;
    }
    this.say(room, { from: player, text, kind: "chat" });
  }

  private award(room: Room, player: Player, lenient: boolean): void {
    const points = pointsForGuess({
      msRemaining: Math.max(0, (room.endsAt ?? 0) - Date.now()),
      turnSeconds: room.settings.turnSeconds,
      lenient,
    });
    player.score += points;
    player.guessedThisTurn = true;
    room.turnGuesses.set(player.id, points);

    // The guess text itself is never broadcast — only that they got it.
    this.notifier.broadcast(room, MatchEvents.Chat, {
      kind: "correct" satisfies ChatKind,
      from: { id: player.id, name: player.name },
      text: `${player.name} guessed the word!`,
      points,
    });

    // They have earned the word, so they can now read the rest of the chat in context.
    const conn = room.connections.get(player.id);
    if (conn) this.notifier.send(conn, MatchEvents.Word, { word: room.word });

    this.notifier.broadcastState(room);

    // Nobody left to guess: no point running the clock down.
    if (activeGuessers(room).every((p) => p.guessedThisTurn)) this.endTurn(room);
  }

  // ── Ending a turn ──────────────────────────────────────────────────────────

  private endTurn(room: Room): void {
    if (room.phase !== "DRAWING") return;
    clearPhaseTimers(room);

    const drawer = currentDrawer(room);
    const drawerPoints = pointsForDrawer(room.turnGuesses.size);
    if (drawer) drawer.score += drawerPoints;

    room.phase = "REVEAL";
    room.endsAt = Date.now() + REVEAL_SECONDS * 1000;

    this.notifier.broadcast(room, MatchEvents.TurnEnd, {
      word: room.word,
      ends_at: room.endsAt,
      deltas: [
        ...[...room.turnGuesses].map(([id, points]) => ({ player_id: id, points })),
        ...(drawer && drawerPoints > 0
          ? [{ player_id: drawer.id, points: drawerPoints, as_drawer: true }]
          : []),
      ],
    });
    this.notifier.broadcastState(room);

    room.phaseTimer = this.after(room, REVEAL_SECONDS * 1000, () => void this.nextTurn(room));
  }

  private finish(room: Room): void {
    clearPhaseTimers(room);
    room.phase = "RESULTS";
    room.word = null;
    room.endsAt = Date.now() + RESULTS_SECONDS * 1000;

    this.notifier.broadcast(room, MatchEvents.MatchEnd, {
      standings: buildStandings(room),
      ends_at: room.endsAt,
    });
    this.notifier.broadcastState(room);

    room.phaseTimer = this.after(room, RESULTS_SECONDS * 1000, () => this.backToLobby(room));
  }

  /** Host-triggered "play again", or the results screen timing out. */
  playAgain(code: string, playerId: string): void {
    const room = this.requireRoom(code);
    if (room.hostId !== playerId) throw forbidden("Only the host can start another match.");
    if (room.phase !== "RESULTS") throw conflict("The match is still going.");
    this.backToLobby(room);
  }

  private backToLobby(room: Room): void {
    if (this.store.get(room.code) !== room) return;
    clearPhaseTimers(room);
    room.phase = "LOBBY";
    room.round = 0;
    room.drawerIndex = -1;
    room.drawerOrder = [];
    room.word = null;
    room.wordChoices = [];
    room.revealedIdx = [];
    room.endsAt = null;
    room.turnStartedAt = null;
    room.turnGuesses.clear();
    for (const player of room.players.values()) {
      player.ready = false;
      player.guessedThisTurn = false;
      // The podium has already been shown; carrying the scores back into the lobby would
      // just put stale points beside everyone's name while they wait for the next match.
      player.score = 0;
    }
    clearCanvas(room.canvas);
    this.notifier.broadcast(room, "draw:clear", { generation: room.canvas.generation });
    this.notifier.broadcastState(room);
  }

  /**
   * The drawer vanished mid-turn. Their turn is forfeit rather than letting everyone sit out
   * the clock in front of a canvas nobody is drawing on. PRD §7.
   */
  onDrawerLost(room: Room): void {
    if (room.phase === "DRAWING" || room.phase === "WORD_PICK") this.endTurn(room);
  }

  /**
   * Re-send whatever a reconnecting player is entitled to see of the current turn.
   *
   * Room state carries only the masked word, so without this a drawer who refreshed would be
   * left drawing something they can no longer read.
   */
  syncPlayer(room: Room, playerId: string, conn: RoomConnection): void {
    const isDrawer = currentDrawer(room)?.id === playerId;
    if (isDrawer && room.phase === "WORD_PICK" && room.wordChoices.length > 0) {
      this.notifier.send(conn, MatchEvents.WordChoices, { words: room.wordChoices });
      return;
    }
    if (!room.word) return;
    const solved = room.players.get(playerId)?.guessedThisTurn ?? false;
    if (isDrawer || solved) this.notifier.send(conn, MatchEvents.Word, { word: room.word });
  }

  // ── Chat plumbing ──────────────────────────────────────────────────────────

  private say(
    room: Room,
    msg: { from: Player; text: string; kind: ChatKind; audience?: "all" | "solved" },
  ): void {
    const payload = {
      kind: msg.kind,
      from: { id: msg.from.id, name: msg.from.name },
      text: msg.text,
    };
    if (msg.audience !== "solved") {
      this.notifier.broadcast(room, MatchEvents.Chat, payload);
      return;
    }
    // Only players who already have the word, plus the drawer.
    const drawerId = currentDrawer(room)?.id;
    for (const [playerId, conn] of [...room.connections]) {
      const player = room.players.get(playerId);
      if (!player) continue;
      if (player.guessedThisTurn || playerId === drawerId) {
        this.notifier.send(conn, MatchEvents.Chat, payload);
      }
    }
  }

  private whisper(room: Room, playerId: string, msg: { text: string; kind: ChatKind }): void {
    const conn = room.connections.get(playerId);
    if (conn) this.notifier.send(conn, MatchEvents.Chat, { kind: msg.kind, from: null, text: msg.text });
  }

  // ── Timers ─────────────────────────────────────────────────────────────────

  /** A timer that does nothing if the room has been discarded by the time it fires. */
  private after(room: Room, ms: number, action: () => void): NodeJS.Timeout {
    const timer = setTimeout(() => {
      if (this.store.get(room.code) !== room) return;
      try {
        action();
      } catch (err) {
        this.logger.error(`scribblex: phase timer failed in ${room.code}`, err);
      }
    }, ms);
    timer.unref();
    return timer;
  }

  private requireRoom(code: string): Room {
    const room = this.store.get(code);
    if (!room) throw notFound("No room with that code.");
    return room;
  }
}
