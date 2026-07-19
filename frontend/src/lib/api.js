import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const WS_URL = (() => {
  const u = new URL(BACKEND_URL);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}`;
})();

export const TOKEN_KEY = "ts_auth_token";

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setAuthToken(token) {
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

// Session expired hook — call from AuthContext
let sessionExpiredHandler = null;
export function setSessionExpiredHandler(fn) {
  sessionExpiredHandler = fn;
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 && sessionExpiredHandler) {
      sessionExpiredHandler();
    }
    return Promise.reject(err);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

// Public API used by anonymous flows
export async function createQuiz(payload) {
  const { data } = await api.post("/quizzes", payload);
  return data;
}
export async function createRoom(quizId) {
  const { data } = await api.post("/rooms", { quiz_id: quizId });
  return data;
}
export async function joinRoom(pin, nickname) {
  const { data } = await api.post(`/rooms/${pin}/join`, { nickname });
  return data;
}
export async function getRoom(pin) {
  const { data } = await api.get(`/rooms/${pin}`);
  return data;
}
export async function startRoom(pin, hostToken) {
  const { data } = await api.post(`/rooms/${pin}/start`, null, { params: { host_token: hostToken } });
  return data;
}
export function roomWsUrl(pin, { role, token }) {
  const params = new URLSearchParams({ role, token });
  return `${WS_URL}/api/ws/rooms/${pin}?${params.toString()}`;
}
