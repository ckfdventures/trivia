/** Persisted document shapes (MongoDB collections). Field names are part of the stored data contract. */

export interface QuestionInput {
  text: string;
  options: string[];
  correct_index: number;
  time_limit: number;
}

/** A question in the pool; every question belongs to exactly one theme. */
export interface Question extends QuestionInput {
  id: string;
  theme_id: string;
  created_at: string;
}

export interface Theme {
  id: string;
  name: string;
  /** Lower-cased, trimmed name used for case-insensitive uniqueness. */
  name_key: string;
  created_at: string;
}

export interface ThemeSummary {
  id: string;
  name: string;
  question_count: number;
}

export type UserRole = "host" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface UserWithPassword extends User {
  password_hash: string;
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
