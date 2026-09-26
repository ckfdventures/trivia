import { nowMs } from "../shared/time.js";
import { MAX_PLAYERS_PER_ROOM, OPTIONS_PER_QUESTION } from "./constants.js";
import { buildLeaderboard } from "./leaderboard.js";
import { currentQuestion, isLastQuestion, type Room } from "./room.js";

/** The room snapshot sent to clients. Never includes tokens or, while a question is live, the answer. */
export function toPublicRoomState(room: Room) {
  const q = currentQuestion(room);
  const payload: Record<string, unknown> = {
    pin: room.pin,
    status: room.status,
    quiz_title: room.quiz.title,
    question_count: room.quiz.questions.length,
    current_index: room.currentIndex,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
      is_host: p.id === room.hostPlayerId,
    })),
    max_players: MAX_PLAYERS_PER_ROOM,
    leaderboard: buildLeaderboard(room),
  };

  if (room.status === "question_active" && q) {
    payload.question = {
      id: room.questionId,
      index: room.currentIndex,
      text: q.text,
      options: q.options,
      time_limit: q.time_limit,
      deadline_ts: room.deadlineTs,
      server_now: nowMs(),
      answers_received: room.answers.get(room.currentIndex)?.size ?? 0,
      total_players: room.players.size,
    };
  }

  if (room.status === "question_review" && q) {
    const answers = room.answers.get(room.currentIndex) ?? new Map();
    const distribution: number[] = new Array(OPTIONS_PER_QUESTION).fill(0);
    const playerResults: Record<string, unknown> = {};
    for (const [playerId, a] of answers) {
      if (a.option_index >= 0 && a.option_index < OPTIONS_PER_QUESTION) distribution[a.option_index]! += 1;
      playerResults[playerId] = { correct: a.correct, points_earned: a.points_earned, option_index: a.option_index };
    }
    payload.review = {
      id: room.questionId,
      index: room.currentIndex,
      text: q.text,
      options: q.options,
      correct_index: q.correct_index,
      distribution,
      answers_received: answers.size,
      total_players: room.players.size,
      is_last: isLastQuestion(room),
      player_results: playerResults,
    };
  }

  return payload;
}
