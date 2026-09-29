import { api } from "../api";
import type { DeckSummary, Profile, RoomState, RoomSummary, Seat, SettingsPatch } from "./types";

/** REST half of ScribbleX: opening a room and getting into one. Live play is over the socket. */

const body = (profile: Profile) => ({
  profile: { name: profile.name, avatar_id: profile.avatar_id, hat_id: profile.hat_id },
});

export async function createRoom(profile: Profile, settings?: SettingsPatch): Promise<Seat> {
  const { data } = await api.post<Seat>("/scribblex/rooms", { ...body(profile), settings });
  return data;
}

export async function joinRoom(code: string, profile: Profile): Promise<Seat> {
  const { data } = await api.post<Seat>(`/scribblex/rooms/${encodeURIComponent(code)}/join`, body(profile));
  return data;
}

export async function quickPlay(profile: Profile): Promise<Seat> {
  const { data } = await api.post<Seat>("/scribblex/rooms/quick-play", body(profile));
  return data;
}

/** Look a room up before joining, so the form can say "full" or "already started". */
export async function getRoom(code: string): Promise<RoomState> {
  const { data } = await api.get<RoomState>(`/scribblex/rooms/${encodeURIComponent(code)}`);
  return data;
}

/** The deck catalogue offered in the lobby. */
export async function listDecks(): Promise<DeckSummary[]> {
  const { data } = await api.get<DeckSummary[]>("/scribblex/decks");
  return data;
}

export async function listPublicRooms(): Promise<RoomSummary[]> {
  const { data } = await api.get<RoomSummary[]>("/scribblex/rooms");
  return data;
}
