import { api } from "./api";
import type { AnswerResult } from "./types";

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
