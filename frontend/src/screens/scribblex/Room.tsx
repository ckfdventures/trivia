"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Arena from "./Arena";
import Lobby from "./Lobby";
import { useScribbleRoom } from "../../hooks/useScribbleRoom";
import { routes } from "../../lib/routes";
import { clearSeat, loadSeat } from "../../lib/scribblex/profile";
import type { StoredSeat } from "../../lib/scribblex/types";

/**
 * One room, two faces.
 *
 * The connection lives here rather than in either screen, so moving between the lobby and the
 * arena is a render, not a reconnect — the socket, the canvas log and the chat all survive the
 * switch. Which face shows is decided purely by the phase the server reports.
 */
export default function Room() {
  const router = useRouter();
  const params = useParams<{ code?: string }>();
  const code = (params.code ?? "").toUpperCase();

  // Client-only screen (see room/[code]/RoomClient.tsx), so the seat resolves synchronously.
  const [seat] = useState<StoredSeat | null>(() => (code ? loadSeat(code) : null));

  // No seat in this browser: send them through the profile step to get one.
  useEffect(() => {
    if (seat === null && code) {
      router.replace(`${routes.scribblex.profile}?intent=join&code=${encodeURIComponent(code)}`);
    }
  }, [seat, code, router]);

  const room = useScribbleRoom({
    code,
    playerId: seat?.player_id,
    token: seat?.session_token,
  });

  useEffect(() => {
    if (!room.removed) return;
    clearSeat(code);
    router.replace(routes.scribblex.home);
  }, [room.removed, code, router]);

  const leave = () => {
    room.actions.leave();
    clearSeat(code);
    router.push(routes.scribblex.home);
  };

  if (!seat || !room.state) {
    return (
      <div className="min-h-screen sx-dots grid place-items-center px-sx-md">
        <p className="font-sx-body text-sx-body-lg text-sx-on-surface-variant">
          {room.connected ? "Loading the room…" : "Connecting…"}
        </p>
      </div>
    );
  }

  return room.state.phase === "LOBBY" ? (
    <Lobby room={room} meId={seat.player_id} onLeave={leave} />
  ) : (
    <Arena room={room} meId={seat.player_id} onLeave={leave} />
  );
}
