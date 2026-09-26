import axios from "axios";
import type {
  CreatedRoom,
  ImportTarget,
  JoinedRoom,
  Question,
  QuestionInput,
  RoomState,
  ThemeSummary,
  UploadPreview,
} from "./types";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
export const API = `${BACKEND_URL}/api`;
export const SOCKET_PATH = "/api/socket.io";

export const TOKEN_KEY = "ts_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) window.localStorage.removeItem(TOKEN_KEY);
  else window.localStorage.setItem(TOKEN_KEY, token);
}

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Session expired hook — set by AuthProvider
let sessionExpiredHandler: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  sessionExpiredHandler = fn;
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401 && sessionExpiredHandler) {
      sessionExpiredHandler();
    }
    return Promise.reject(err);
  },
);

/** Turn an API `detail` (string, or FastAPI-style validation list) into a readable message. */
export function formatApiError(detail: unknown): string {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  const msgOf = (e: unknown) =>
    e && typeof e === "object" && "msg" in e && typeof e.msg === "string" ? e.msg : JSON.stringify(e);
  if (Array.isArray(detail)) return detail.map(msgOf).filter(Boolean).join(" ");
  if (typeof detail === "object" && "msg" in detail) return msgOf(detail);
  return String(detail);
}

/** HTTP status of a failed request, if it got a response. */
export function errorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

/** Readable message for a failed request. */
export function errorMessage(err: unknown): string {
  return formatApiError(axios.isAxiosError(err) ? err.response?.data?.detail : undefined);
}

// Public API used by hosts and players (no login)
export async function getThemes(): Promise<ThemeSummary[]> {
  const { data } = await api.get<ThemeSummary[]>("/themes");
  return data;
}
/** themeId null = mix of questions from every theme; hostNickname set = the host plays too. */
export async function createRoom(themeId: string | null, questionCount: number, hostNickname: string | null = null): Promise<CreatedRoom> {
  const { data } = await api.post<CreatedRoom>("/rooms", {
    theme_id: themeId,
    question_count: questionCount,
    host_nickname: hostNickname,
  });
  return data;
}
export async function joinRoom(pin: string, nickname: string): Promise<JoinedRoom> {
  const { data } = await api.post<JoinedRoom>(`/rooms/${pin}/join`, { nickname });
  return data;
}
export async function getRoom(pin: string): Promise<RoomState> {
  const { data } = await api.get<RoomState>(`/rooms/${pin}`);
  return data;
}
export async function startRoom(pin: string, hostToken: string): Promise<{ status: string }> {
  const { data } = await api.post(`/rooms/${pin}/start`, null, { params: { host_token: hostToken } });
  return data;
}

// Admin API (owner only)
export const adminApi = {
  async listThemes(): Promise<ThemeSummary[]> {
    const { data } = await api.get<ThemeSummary[]>("/admin/themes");
    return data;
  },
  async createTheme(name: string): Promise<ThemeSummary> {
    const { data } = await api.post<ThemeSummary>("/admin/themes", { name });
    return data;
  },
  async renameTheme(id: string, name: string): Promise<ThemeSummary> {
    const { data } = await api.patch<ThemeSummary>(`/admin/themes/${id}`, { name });
    return data;
  },
  async deleteTheme(id: string): Promise<void> {
    await api.delete(`/admin/themes/${id}`);
  },
  async listQuestions(themeId: string): Promise<Question[]> {
    const { data } = await api.get<Question[]>(`/admin/themes/${themeId}/questions`);
    return data;
  },
  async deleteQuestion(id: string): Promise<void> {
    await api.delete(`/admin/questions/${id}`);
  },
  async previewUpload(file: File): Promise<UploadPreview> {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post<UploadPreview>("/admin/question-bank/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
  async importQuestions(target: ImportTarget, questions: QuestionInput[]): Promise<{ theme: ThemeSummary; imported: number }> {
    const { data } = await api.post("/admin/question-bank/import", { ...target, questions });
    return data;
  },
};
