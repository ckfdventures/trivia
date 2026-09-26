import type { QuestionInput } from "./models.js";

export type RoomStatus = "lobby" | "question_active" | "question_review" | "game_over";

/** Transport-agnostic handle to a connected client (host or player). */
export interface RoomConnection {
  readonly id: string;
  send(event: string, data: unknown): void;
}

export interface Player {
  id: string;
  nickname: string;
  connected: boolean;
  session_token: string;
  joined_at: string;
}

/** The questions a room plays, drawn from the pool when the room is created. */
export interface GameQuiz {
  title: string;
  questions: (QuestionInput & { id: string })[];
}

export interface PlayerScore {
  points: number;
  streak: number;
  cumulative_time: number;
}

export interface PlayerAnswer {
  option_index: number;
  time_taken: number;
  correct: boolean;
  points_earned: number;
  streak_after: number;
}

/** Live, in-memory state for one game room. */
export interface Room {
  pin: string;
  quiz: GameQuiz;
  hostToken: string;
  hostId: string;
  host: RoomConnection | null;
  players: Map<string, Player>;
  /** The host's own player entry when the host plays along; their presence follows the host connection. */
  hostPlayerId: string | null;
  /** Players who left the player list mid-game (promoted to host); their scores stay on the leaderboard. */
  departedPlayers: Map<string, { nickname: string }>;
  connections: Map<string, RoomConnection>;
  status: RoomStatus;
  createdAt: Date;
  currentIndex: number;
  questionId: string | null;
  questionStartedAt: number | null;
  deadlineTs: number | null;
  /** question index -> (player id -> answer) */
  answers: Map<number, Map<string, PlayerAnswer>>;
  scores: Map<string, PlayerScore>;
  questionTimer: NodeJS.Timeout | null;
  hostPromotionTimer: NodeJS.Timeout | null;
}

export function createRoom(params: { pin: string; quiz: GameQuiz; hostToken: string; hostId: string }): Room {
  return {
    ...params,
    host: null,
    players: new Map(),
    hostPlayerId: null,
    departedPlayers: new Map(),
    connections: new Map(),
    status: "lobby",
    createdAt: new Date(),
    currentIndex: -1,
    questionId: null,
    questionStartedAt: null,
    deadlineTs: null,
    answers: new Map(),
    scores: new Map(),
    questionTimer: null,
    hostPromotionTimer: null,
  };
}

export const emptyScore = (): PlayerScore => ({ points: 0, streak: 0, cumulative_time: 0 });

export function currentQuestion(room: Room) {
  const idx = room.currentIndex;
  if (idx < 0 || idx >= room.quiz.questions.length) return null;
  return room.quiz.questions[idx] ?? null;
}

export function answersFor(room: Room, index: number): Map<string, PlayerAnswer> {
  let map = room.answers.get(index);
  if (!map) {
    map = new Map();
    room.answers.set(index, map);
  }
  return map;
}

export function scoreFor(room: Room, playerId: string): PlayerScore {
  let score = room.scores.get(playerId);
  if (!score) {
    score = emptyScore();
    room.scores.set(playerId, score);
  }
  return score;
}

export function isLastQuestion(room: Room): boolean {
  return room.currentIndex >= room.quiz.questions.length - 1;
}
