"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BACKEND_URL, SOCKET_PATH } from "../lib/api";
import type { RoomState, SettingsPatch } from "../lib/scribblex/types";

interface Options {
  code: string;
  playerId: string | undefined;
  token: string | undefined;
}

export interface RoomActions {
  updateSettings(patch: SettingsPatch): void;
  setReady(ready: boolean): void;
  kick(playerId: string): void;
  leave(): void;
}

export interface ScribbleRoom {
  connected: boolean;
  state: RoomState | null;
  /** A refusal from the server — settings rejected, not the host, kicked. */
  error: string | null;
  /** Set when this client has been removed and should stop trying to reconnect. */
  removed: boolean;
  actions: RoomActions;
  dismissError(): void;
}

/**
 * Live connection to one ScribbleX room.
 *
 * The server is authoritative: every action is fire-and-forget, and the UI only ever renders
 * the `room:state` snapshots that come back. Nothing is applied optimistically, so a rejected
 * settings change simply never appears rather than flickering in and out.
 */
export function useScribbleRoom({ code, playerId, token }: Options): ScribbleRoom {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!code || !playerId || !token) return undefined;

    const socket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      auth: { role: "scribblex", code, playerId, token },
      reconnectionDelay: 1500,
      reconnectionDelayMax: 1500,
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (data: RoomState) => setState(data));
    socket.on("room:error", (data: { message?: string }) => {
      setError(data?.message ?? "Something went wrong.");
    });
    socket.on("room:kicked", () => {
      setRemoved(true);
      socket.close();
    });

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [code, playerId, token]);

  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const actions = useMemo<RoomActions>(
    () => ({
      updateSettings: (patch) => emit("room:updateSettings", patch),
      setReady: (ready) => emit("room:ready", { ready }),
      kick: (id) => emit("room:kick", { player_id: id }),
      leave: () => emit("room:leave"),
    }),
    [emit],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { connected, state, error, removed, actions, dismissError };
}
