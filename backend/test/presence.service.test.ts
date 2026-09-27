import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoom, emptyScore, type RoomConnection } from "../src/domain/room.js";
import { GameService } from "../src/services/game.service.js";
import { PresenceService } from "../src/services/presence.service.js";
import { RoomNotifier, RoomEvents } from "../src/services/room-notifier.js";
import { RoomStore } from "../src/services/room-store.js";
import { silentLogger } from "../src/shared/logger.js";

class FakeConn implements RoomConnection {
  readonly sent: { event: string; data: any }[] = [];
  constructor(readonly id: string) {}
  send(event: string, data: unknown): void {
    this.sent.push({ event, data });
  }
}

describe("host promotion", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps the promoted player in the game as the host's player entry", () => {
    const store = new RoomStore();
    const notifier = new RoomNotifier(store);
    const game = new GameService(store, notifier, { drawQuestions: vi.fn() } as any, { findOffendingWord: () => null } as any);
    const presence = new PresenceService(store, notifier, game, silentLogger, 1000);

    const room = createRoom({ pin: "123456", quiz: { title: "Q", questions: [] }, hostToken: "old", hostId: "old-id" });
    store.add(room);
    room.players.set("priya", { id: "priya", nickname: "Priya", connected: false, session_token: "tok-priya", joined_at: "" });
    room.scores.set("priya", { ...emptyScore(), points: 500 });

    const host = new FakeConn("host");
    const priya = new FakeConn("priya");
    expect(presence.connectHost("123456", "old", host).ok).toBe(true);
    expect(presence.connectPlayer("123456", "tok-priya", priya).ok).toBe(true);
    presence.disconnectHost("123456", host);
    vi.advanceTimersByTime(1000);

    const promoted = priya.sent.find((m) => m.event === RoomEvents.PromotedToHost)?.data;
    expect(promoted).toMatchObject({ pin: "123456" });
    expect(room.players.has("priya")).toBe(true);
    expect(room.hostPlayerId).toBe("priya");
    expect(room.scores.get("priya")?.points).toBe(500);

    // Her player entry now follows the new host connection.
    expect(room.players.get("priya")?.connected).toBe(false);
    presence.connectHost("123456", promoted.host_token, new FakeConn("priya-host"));
    expect(room.players.get("priya")?.connected).toBe(true);
  });
});
