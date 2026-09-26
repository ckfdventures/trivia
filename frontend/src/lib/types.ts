/** Shapes returned by the TriviaStream API and Socket.IO events. */

export type RoomStatus = "lobby" | "question_active" | "question_review" | "game_over";

export interface RoomPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  /** The host's own player entry, when the host plays along. */
  is_host: boolean;
}

export interface LeaderboardEntry {
  player_id: string;
  nickname: string;
  points: number;
  streak: number;
  cumulative_time: number;
  rank: number;
  tie: boolean;
}

export interface ActiveQuestion {
  id: string;
  index: number;
  text: string;
  options: string[];
  time_limit: number;
  deadline_ts: number;
  server_now: number;
  answers_received: number;
  total_players: number;
}

export interface PlayerResult {
  correct: boolean;
  points_earned: number;
  option_index: number;
}

export interface QuestionReview {
  id: string;
  index: number;
  text: string;
  options: string[];
  correct_index: number;
  distribution: number[];
  answers_received: number;
  total_players: number;
  is_last: boolean;
  player_results: Record<string, PlayerResult>;
}

export interface RoomState {
  pin: string;
  status: RoomStatus;
  quiz_title: string;
  question_count: number;
  current_index: number;
  players: RoomPlayer[];
  max_players: number;
  leaderboard: LeaderboardEntry[];
  question?: ActiveQuestion;
  review?: QuestionReview;
}

export interface RoomEvent {
  type: string;
  data: unknown;
}

export interface CreatedRoom {
  pin: string;
  host_token: string;
  host_id: string;
  /** Present when the host plays along. */
  host_player: JoinedRoom | null;
  room: RoomState;
}

export interface JoinedRoom {
  player_id: string;
  session_token: string;
  pin: string;
  nickname: string;
}

export interface AnswerResult {
  correct: boolean;
  points_earned: number;
  streak: number;
  total_points: number;
}

/** Stored in localStorage as `ts_host_<pin>`. */
export interface HostSession {
  pin: string;
  host_token: string;
  host_id: string;
  quiz_title?: string;
  /** The host's player session when they play along. */
  player?: PlayerSession;
}

/** Stored in localStorage as `ts_player_<pin>`. */
export interface PlayerSession {
  pin: string;
  player_id: string;
  session_token: string;
  nickname: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "host";
}

export interface ThemeSummary {
  id: string;
  name: string;
  question_count: number;
}

export interface QuestionInput {
  text: string;
  options: string[];
  correct_index: number;
  time_limit: number;
}

export interface Question extends QuestionInput {
  id: string;
  theme_id: string;
  created_at: string;
}

export interface UploadPreview {
  total_rows: number;
  valid_count: number;
  error_count: number;
  valid_rows: QuestionInput[];
  errors: string[];
}

export type ImportTarget = { theme_id: string } | { theme_name: string };
