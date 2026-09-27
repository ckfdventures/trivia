import { api } from "./api";
import type { AnswerResult, HostSession, PlayerSession } from "./types";

type StatusResponse = { status: string };

export async function submitAnswer(
  pin: string,
  playerId: string,
  sessionToken: string,
  questionId: string,
  optionIndex: number,
): Promise<AnswerResult> {
  const { data } = await api.post<AnswerResult>(`/rooms/${pin}/answer`, {
    player_id: playerId,
    session_token: sessionToken,
    question_id: questionId,
    option_index: optionIndex,
  });
  return data;
}

async function hostControl(action: "next" | "skip" | "end", pin: string, hostToken: string): Promise<StatusResponse> {
  const { data } = await api.post<StatusResponse>(`/rooms/${pin}/${action}`, null, {
    params: { host_token: hostToken },
  });
  return data;
}

export const hostNext = (pin: string, hostToken: string) => hostControl("next", pin, hostToken);
export const hostSkip = (pin: string, hostToken: string) => hostControl("skip", pin, hostToken);
export const hostEnd = (pin: string, hostToken: string) => hostControl("end", pin, hostToken);

/** Host control: turn off every player's mic in voice chat. */
export async function hostMuteAll(pin: string, hostToken: string): Promise<{ muted: number }> {
  const { data } = await api.post<{ muted: number }>(`/rooms/${pin}/voice/mute-all`, null, {
    params: { host_token: hostToken },
  });
  return data;
}

/**
 * Save the host session for a player the server just promoted to host. They keep playing, so their player
 * session moves into the host session, as for a host who plays along.
 */
export function becomeHost(
  pin: string,
  promotion: { host_token: string; host_id: string },
  player: PlayerSession | null,
  quizTitle: string,
): void {
  const hostSession: HostSession = {
    pin,
    host_token: promotion.host_token,
    host_id: promotion.host_id,
    quiz_title: quizTitle,
    ...(player ? { player } : {}),
  };
  localStorage.setItem(`ts_host_${pin}`, JSON.stringify(hostSession));
  localStorage.removeItem(`ts_player_${pin}`);
}
