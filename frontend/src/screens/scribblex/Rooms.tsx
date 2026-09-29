"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, ArrowLeft, Lightning, Users } from "@phosphor-icons/react";
import { Button, Card, Chip, Toast } from "../../components/scribblex/ui";
import { errorMessage } from "../../lib/api";
import { ScribbleNav } from "../../components/scribblex/ScribbleNav";
import { routes } from "../../lib/routes";
import { listPublicRooms } from "../../lib/scribblex/api";
import type { RoomSummary } from "../../lib/scribblex/types";

/** How often the list refreshes itself. PRD §6.1. */
const POLL_MS = 10_000;

/**
 * Public rooms anyone can drop into.
 *
 * Rooms already playing are listed and joinable — a latecomer guesses along and takes a turn
 * when the rotation reaches them, which beats sitting on a lobby screen waiting for strangers.
 * Full rooms stay listed but without a button, so the count on screen matches what is really
 * going on rather than quietly hiding the busiest games.
 */
export default function Rooms() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setRooms(await listPublicRooms());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void load();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  const go = (intent: "join" | "quick", code?: string) => {
    const query = new URLSearchParams({ intent });
    if (code) query.set("code", code);
    router.push(`${routes.scribblex.profile}?${query.toString()}`);
  };

  const joinable = rooms.filter((r) => r.joinable).length;

  return (
    <div className="min-h-screen sx-dots pb-28">
      <header className="mx-auto w-full max-w-2xl px-sx-md pt-sx-md flex items-center justify-between gap-sx-sm">
        <button
          onClick={() => router.push(routes.home)}
          data-testid="sx-rooms-back"
          aria-label="Back"
          className="press grid h-11 w-11 place-items-center rounded-full bg-white border-[2.5px] border-sx-ink shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <button
          onClick={() => void load()}
          data-testid="sx-rooms-refresh"
          className="press inline-flex items-center gap-2 h-11 rounded-full bg-white border-[2.5px] border-sx-ink px-sx-md font-sx-display text-sx-label-md shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
        >
          <ArrowClockwise size={14} weight="bold" /> Refresh
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl px-sx-md pt-sx-lg">
        <h1 className="font-sx-display text-sx-hero-m text-sx-ink">Live rooms</h1>
        <p className="font-sx-body text-sx-body-md text-sx-on-surface-variant mt-1.5">
          {loading
            ? "Looking for games…"
            : joinable === 0
              ? "Nothing open right now. Start one and people can find it here."
              : `${joinable} room${joinable === 1 ? "" : "s"} you can drop into.`}
        </p>

        <Button onClick={() => go("quick")} data-testid="sx-rooms-quick" className="mt-sx-md w-full">
          <Lightning size={18} weight="fill" /> Quick play
        </Button>

        <div className="mt-sx-lg space-y-sx-sm">
          {rooms.map((room) => (
            <RoomRow key={room.code} room={room} onJoin={() => go("join", room.code)} />
          ))}

          {!loading && rooms.length === 0 && (
            <Card tinted className="text-center">
              <p className="font-sx-body text-sx-body-md text-sx-on-surface-variant">
                No public rooms yet. Quick play will open one for you.
              </p>
            </Card>
          )}
        </div>
      </main>

      {error && <Toast message={error} onDismiss={() => setError(null)} />}
      <ScribbleNav />
    </div>
  );
}

function RoomRow({ room, onJoin }: { room: RoomSummary; onJoin(): void }) {
  const playing = room.phase !== "LOBBY";
  const status = playing ? `Round ${room.round} of ${room.total_rounds}` : "Waiting to start";

  return (
    <div
      data-testid={`sx-room-${room.code}`}
      className={`flex items-center gap-sx-sm rounded-sx-md border-2 border-sx-ink bg-white p-sx-sm ${
        room.joinable ? "" : "opacity-60"
      }`}
    >
      <span
        aria-hidden="true"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-sx border-2 border-sx-ink bg-sx-secondary-fixed text-2xl"
      >
        {room.emoji}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-sx-display text-sx-label-lg text-sx-ink truncate">{room.name}</p>
        <p className="flex items-center gap-1.5 font-sx-body text-sx-body-sm text-sx-on-surface-variant">
          <Users size={13} weight="bold" aria-hidden="true" />
          {room.player_count}/{room.max_players}
          <span aria-hidden="true">·</span>
          {status}
        </p>
      </div>

      {room.joinable ? (
        <Button onClick={onJoin} data-testid={`sx-join-${room.code}`} className="h-11 px-sx-md shrink-0">
          Join
        </Button>
      ) : (
        <Chip className="shrink-0">Full</Chip>
      )}
    </div>
  );
}
