"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { BACKEND_URL, SOCKET_PATH } from "../lib/api";
import type { RoomEvent, RoomState } from "../lib/types";

interface Options {
  pin: string;
  role: "host" | "player";
  token: string | undefined;
  enabled?: boolean;
}

export function useRoomSocket({ pin, role, token, enabled = true }: Options) {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<RoomState | null>(null);
  const [lastEvent, setLastEvent] = useState<RoomEvent | null>(null);

  useEffect(() => {
    if (!enabled || !pin || !token) return undefined;

    const socket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      auth: { pin, role, token },
      reconnectionDelay: 1500,
      reconnectionDelayMax: 1500,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    // Server events arrive as (type, data); keep the { type, data } message shape pages consume.
    socket.onAny((type: string, data: unknown) => {
      if (type === "room_state") setState(data as RoomState);
      setLastEvent({ type, data });
    });

    return () => {
      socket.close();
    };
  }, [pin, role, token, enabled]);

  return { connected, state, lastEvent };
}
