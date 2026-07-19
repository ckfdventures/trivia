import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const WS_URL = (() => {
  // Derive ws(s):// URL from https/http backend URL
  const u = new URL(BACKEND_URL);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}`;
})();

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

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
  const { data } = await api.post(`/rooms/${pin}/start`, null, {
    params: { host_token: hostToken },
  });
  return data;
}

export function roomWsUrl(pin, { role, token }) {
  const params = new URLSearchParams({ role, token });
  return `${WS_URL}/api/ws/rooms/${pin}?${params.toString()}`;
}
