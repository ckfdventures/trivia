import { MAX_NICKNAME_LENGTH, MAX_PLAYERS_PER_ROOM, OPTIONS_PER_QUESTION } from "../domain/constants.js";
import {
  answersFor,
  createRoom,
  currentQuestion,
  emptyScore,
  isLastQuestion,
  scoreFor,
  type Room,
} from "../domain/room.js";
import { toPublicRoomState } from "../domain/room-view.js";
import { pointsForCorrectAnswer } from "../domain/scoring.js";
import { badRequest, conflict, forbidden, notFound } from "../shared/http-error.js";
import { newId } from "../shared/ids.js";
import { nowIso, nowMs } from "../shared/time.js";
import type { ProfanityFilter } from "./profanity-filter.js";
import { RoomEvents, type RoomNotifier } from "./room-notifier.js";
import type { RoomStore } from "./room-store.js";
import type { QuestionSource } from "./theme.service.js";

export interface AnswerInput {
  player_id: string;
  session_token: string;
  question_id: string;
  option_index: number;
}

/** Server-authoritative game lifecycle: rooms, joining, questions, timers, scoring. */
export class GameService {
  constructor(
    private readonly store: RoomStore,
    private readonly notifier: RoomNotifier,
    private readonly questionSource: QuestionSource,
    private readonly profanity: ProfanityFilter,
  ) {}

  // ---------- Room setup ----------

  /**
   * Open a lobby playing `questionCount` random questions from a theme, or from all themes when `themeId` is null.
   * With `hostNickname`, the host also joins as a player and gets a player session to answer with.
   */
  async createRoom(themeId: string | null, questionCount: number, hostNickname: string | null = null) {
    if (questionCount < 1) throw badRequest("Pick at least 1 question");
    const nickname = hostNickname === null ? null : this.validNickname(hostNickname);
    const quiz = await this.questionSource.drawQuestions(themeId, questionCount);

    const room = createRoom({ pin: this.store.generatePin(), quiz, hostToken: newId(), hostId: newId() });
    this.store.add(room);
    const hostPlayer = nickname === null ? null : this.addPlayer(room, nickname);
    room.hostPlayerId = hostPlayer?.player_id ?? null;
    return {
      pin: room.pin,
      host_token: room.hostToken,
      host_id: room.hostId,
      host_player: hostPlayer,
      room: toPublicRoomState(room),
    };
  }

  getPublicState(pin: string) {
    return toPublicRoomState(this.requireRoom(pin));
  }

  join(pin: string, rawNickname: string) {
    const room = this.requireRoom(pin, "Room not found. Check the PIN.");
    if (room.status !== "lobby") throw conflict("Game Already Started");
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) throw conflict("Room Full");

    const player = this.addPlayer(room, this.validNickname(rawNickname));
    this.notifier.broadcastState(room);
    return player;
  }

  /** Trimmed nickname, or a 400 if it is empty, too long or profane. */
  private validNickname(raw: string): string {
    const nickname = raw.trim();
    if (!nickname) throw badRequest("Nickname is required");
    if (nickname.length > MAX_NICKNAME_LENGTH) throw badRequest("Nickname must be 20 characters or fewer");
    if (this.profanity.findOffendingWord(nickname)) throw badRequest("Nickname contains inappropriate language");
    return nickname;
  }

  private addPlayer(room: Room, nickname: string) {
    const lower = nickname.toLowerCase();
    for (const p of room.players.values()) {
      if (p.nickname.toLowerCase() === lower) throw conflict("That nickname is already taken");
    }

    const playerId = newId();
    const sessionToken = newId();
    room.players.set(playerId, {
      id: playerId,
      nickname,
      connected: false,
      session_token: sessionToken,
      joined_at: nowIso(),
    });
    room.scores.set(playerId, emptyScore());
    return { player_id: playerId, session_token: sessionToken, pin: room.pin, nickname };
  }

  // ---------- Host controls ----------

  start(pin: string, hostToken: string) {
    const room = this.requireHostedRoom(pin, hostToken);
    if (room.status !== "lobby") throw conflict("Game already started");
    if (room.players.size === 0) throw badRequest("At least 1 player is required to start");

    this.notifier.broadcast(room, RoomEvents.GameStarted, { pin });
    this.startNextQuestion(room);
    return { status: room.status };
  }

  next(pin: string, hostToken: string) {
    const room = this.requireHostedRoom(pin, hostToken);
    if (room.status !== "question_review" && room.status !== "lobby") {
      throw conflict(`Cannot advance from status ${room.status}`);
    }
    if (room.status === "question_review" && isLastQuestion(room)) {
      this.endGame(room);
    } else {
      this.startNextQuestion(room);
    }
    return { status: room.status };
  }

  skip(pin: string, hostToken: string) {
    const room = this.requireHostedRoom(pin, hostToken);
    if (room.status !== "question_active") throw conflict("No active question to skip");
    this.endQuestion(room, room.questionId);
    return { status: room.status };
  }

  end(pin: string, hostToken: string) {
    const room = this.requireHostedRoom(pin, hostToken);
    if (room.status === "game_over") throw conflict("Game already over");
    this.endGame(room);
    return { status: room.status };
  }

  // ---------- Players ----------

  submitAnswer(pin: string, input: AnswerInput) {
    const room = this.requireRoom(pin);
    const player = room.players.get(input.player_id);
    if (!player || player.session_token !== input.session_token) throw forbidden("Invalid player session");
    if (room.status !== "question_active") throw conflict("No active question");
    if (room.questionId !== input.question_id) throw conflict("Stale question");
    if (input.option_index < 0 || input.option_index > OPTIONS_PER_QUESTION - 1) throw badRequest("Invalid option");

    const answers = answersFor(room, room.currentIndex);
    if (answers.has(input.player_id)) throw conflict("Answer already submitted");

    const q = currentQuestion(room)!;
    const timeTaken = Math.max(0, (nowMs() - room.questionStartedAt!) / 1000);
    const correct = input.option_index === q.correct_index;
    const score = scoreFor(room, input.player_id);

    let pointsEarned = 0;
    if (correct) {
      pointsEarned = pointsForCorrectAnswer(timeTaken, q.time_limit, score.streak);
      score.streak += 1;
    } else {
      score.streak = 0;
    }
    score.points += pointsEarned;
    score.cumulative_time += timeTaken;

    answers.set(input.player_id, {
      option_index: input.option_index,
      time_taken: timeTaken,
      correct,
      points_earned: pointsEarned,
      streak_after: score.streak,
    });

    this.notifier.broadcast(room, RoomEvents.AnswerReceived, {
      answers_received: answers.size,
      total_players: room.players.size,
    });
    if (answers.size >= room.players.size) this.endQuestion(room, room.questionId);

    return { correct, points_earned: pointsEarned, streak: score.streak, total_points: score.points };
  }

  // ---------- Lifecycle ----------

  /** Finish the game: stop the question timer and notify everyone. */
  endGame(room: Room): void {
    room.status = "game_over";
    this.clearQuestionTimer(room);
    this.notifier.broadcastState(room);
  }

  /** Stop any timers owned by a room (used when the room is discarded). */
  disposeRoom(room: Room): void {
    this.clearQuestionTimer(room);
    if (room.hostPromotionTimer) clearTimeout(room.hostPromotionTimer);
    room.hostPromotionTimer = null;
  }

  private startNextQuestion(room: Room): void {
    room.currentIndex += 1;
    const q = currentQuestion(room);
    if (!q) {
      this.endGame(room);
      return;
    }
    const questionId = newId();
    room.questionId = questionId;
    room.questionStartedAt = nowMs();
    room.deadlineTs = room.questionStartedAt + q.time_limit * 1000;
    room.status = "question_active";
    answersFor(room, room.currentIndex);

    this.clearQuestionTimer(room);
    room.questionTimer = setTimeout(() => this.onQuestionTimeout(room.pin, questionId), q.time_limit * 1000);
    room.questionTimer.unref();
    this.notifier.broadcastState(room);
  }

  private onQuestionTimeout(pin: string, questionId: string): void {
    const room = this.store.get(pin);
    if (room) this.endQuestion(room, questionId);
  }

  /** Close the active question (if `questionId` is still current) and move to review. */
  private endQuestion(room: Room, questionId: string | null): void {
    if (room.questionId !== questionId || room.status !== "question_active") return;
    if (!currentQuestion(room)) return;

    // Anyone who didn't answer loses their streak.
    const answers = answersFor(room, room.currentIndex);
    for (const playerId of room.players.keys()) {
      if (!answers.has(playerId)) scoreFor(room, playerId).streak = 0;
    }
    room.status = "question_review";
    this.clearQuestionTimer(room);
    this.notifier.broadcastState(room);
  }

  private clearQuestionTimer(room: Room): void {
    if (room.questionTimer) clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }

  private requireRoom(pin: string, message = "Room not found"): Room {
    const room = this.store.get(pin);
    if (!room) throw notFound(message);
    return room;
  }

  private requireHostedRoom(pin: string, hostToken: string): Room {
    const room = this.requireRoom(pin);
    if (room.hostToken !== hostToken) throw forbidden("Invalid host token");
    return room;
  }
}
