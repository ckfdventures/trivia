import { api } from "./api";

export async function submitAnswer(pin, playerId, sessionToken, questionId, optionIndex) {
  const { data } = await api.post(`/rooms/${pin}/answer`, {
    player_id: playerId,
    session_token: sessionToken,
    question_id: questionId,
    option_index: optionIndex,
  });
  return data;
}

export async function hostNext(pin, hostToken) {
  const { data } = await api.post(`/rooms/${pin}/next`, null, {
    params: { host_token: hostToken },
  });
  return data;
}

export async function hostSkip(pin, hostToken) {
  const { data } = await api.post(`/rooms/${pin}/skip`, null, {
    params: { host_token: hostToken },
  });
  return data;
}

export async function hostEnd(pin, hostToken) {
  const { data } = await api.post(`/rooms/${pin}/end`, null, {
    params: { host_token: hostToken },
  });
  return data;
}
