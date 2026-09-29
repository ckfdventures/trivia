import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, RECONNECT_GRACE_MS } from "../src/games/scribblex/domain/constants.js";
import { formatRoomCode, normalizeRoomCode } from "../src/games/scribblex/domain/codes.js";
import { toPublicRoomState } from "../src/games/scribblex/domain/room-view.js";
import type { PlayerProfile, RoomConnection } from "../src/games/scribblex/domain/room.js";
import { ScribbleEvents, ScribbleRoomNotifier } from "../src/games/scribblex/services/room-notifier.js";
import { ScribbleRoomService } from "../src/games/scribblex/services/room.service.js";
import { ScribbleRoomStore } from "../src/games/scribblex/services/room-store.js";
import { WordListProfanityFilter } from "../src/services/profanity-filter.js";

class FakeConn implements RoomConnection {
  readonly sent: { event: string; data: unknown }[] = [];
  closed = false;
  constructor(readonly id: string) {}
  send(event: string, data: unknown): void {
    this.sent.push({ event, data });
  }
  close(): void {
    this.closed = true;
  }
}

const profile = (name: string): PlayerProfile => ({ name, avatarId: "pip", hatId: null });

function setup() {
  const store = new ScribbleRoomStore();
  const notifier = new ScribbleRoomNotifier(store);
  const service = new ScribbleRoomService(store, notifier, new WordListProfanityFilter());
  return { store, notifier, service };
}

/** A room with a word deck chosen and two players connected — the usual starting point. */
function readyRoom() {
  const ctx = setup();
  const host = ctx.service.createRoom(profile("Host"), { decks: ["cute-animals"] });
  const guest = ctx.service.joinRoom(host.room.code, profile("Guest"));
  return { ...ctx, host, guest, code: host.room.code };
}

describe("room codes", () => {
  it("generates codes from an unambiguous alphabet", () => {
    const { service } = setup();
    for (let i = 0; i < 50; i++) {
      const { room } = service.createRoom(profile("Host"));
      expect(room.code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of room.code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it("never generates the characters people misread", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OI]/);
  });

  it("accepts a code however the player types it", () => {
    expect(normalizeRoomCode("abc-234")).toBe("ABC234");
    expect(normalizeRoomCode("  ABC 234 ")).toBe("ABC234");
    expect(normalizeRoomCode("ABC234")).toBe("ABC234");
  });

  it("rejects codes containing excluded or missing characters", () => {
    expect(normalizeRoomCode("ABC23O")).toBeNull(); // O is not in the alphabet
    expect(normalizeRoomCode("ABC2")).toBeNull();
    expect(normalizeRoomCode("ABC2345")).toBeNull();
  });

  it("displays codes split in half", () => {
    expect(formatRoomCode("ABC234")).toBe("ABC-234");
  });
});

describe("creating and joining", () => {
  it("seats the creator as host", () => {
    const { service } = setup();
    const { room, playerId } = service.createRoom(profile("Host"));
    expect(room.hostId).toBe(playerId);
    expect(room.players.size).toBe(1);
    expect(room.phase).toBe("LOBBY");
  });

  it("creates a room even before any deck is chosen", () => {
    const { service } = setup();
    expect(() => service.createRoom(profile("Host"))).not.toThrow();
  });

  it("finds the room whatever case the joiner types", () => {
    const { service } = setup();
    const { room } = service.createRoom(profile("Host"));
    const joined = service.joinRoom(formatRoomCode(room.code).toLowerCase(), profile("Guest"));
    expect(joined.room.code).toBe(room.code);
    expect(joined.room.players.size).toBe(2);
  });

  it("refuses a full room", () => {
    const { service } = setup();
    const { room } = service.createRoom(profile("Host"), { max_players: 2 });
    service.joinRoom(room.code, profile("Guest"));
    expect(() => service.joinRoom(room.code, profile("Third"))).toThrow(/full/i);
  });

  it("refuses a match already under way", () => {
    const { service, code, host } = readyRoom();
    host.room.phase = "DRAWING";
    expect(() => service.joinRoom(code, profile("Latecomer"))).toThrow(/already started/i);
  });

  it("refuses an unknown code", () => {
    const { service } = setup();
    expect(() => service.joinRoom("ZZZZZZ", profile("Guest"))).toThrow(/no room/i);
  });
});

describe("player identity", () => {
  it("keeps session tokens out of the room snapshot", () => {
    const { host, guest } = readyRoom();
    const serialized = JSON.stringify(toPublicRoomState(host.room));
    expect(serialized).not.toContain(host.sessionToken);
    expect(serialized).not.toContain(guest.sessionToken);
  });

  it("issues a different token to every player", () => {
    const { host, guest } = readyRoom();
    expect(host.sessionToken).not.toBe(guest.sessionToken);
    expect(host.playerId).not.toBe(guest.playerId);
  });

  it("refuses a connection presenting another player's id without their token", () => {
    const { service, code, host, guest } = readyRoom();
    const result = service.connect(code, guest.playerId, host.sessionToken, new FakeConn("c1"));
    expect(result).toEqual({ ok: false, message: "Invalid player session" });
  });

  it("accepts a connection with the matching token", () => {
    const { service, code, host } = readyRoom();
    expect(service.connect(code, host.playerId, host.sessionToken, new FakeConn("c1"))).toEqual({
      ok: true,
      playerId: host.playerId,
    });
  });
});

describe("display names", () => {
  it("masks language the filter objects to rather than rejecting the player", () => {
    const { service } = setup();
    const { room, playerId } = service.createRoom(profile("idiot"));
    expect(room.players.get(playerId)!.name).toBe("*****");
  });

  it("collapses whitespace and trims", () => {
    const { service } = setup();
    const { room, playerId } = service.createRoom(profile("  Doodle   Fox  "));
    expect(room.players.get(playerId)!.name).toBe("Doodle Fox");
  });

  it("refuses an empty name", () => {
    const { service } = setup();
    expect(() => service.createRoom(profile("   "))).toThrow(/name/i);
  });

  it("refuses a name past the limit", () => {
    const { service } = setup();
    expect(() => service.createRoom(profile("x".repeat(17)))).toThrow(/16 characters/i);
  });
});

describe("settings", () => {
  it("lets only the host change them", () => {
    const { service, code, guest } = readyRoom();
    expect(() => service.updateSettings(code, guest.playerId, { rounds: 5 })).toThrow(/only the host/i);
  });

  it("applies a partial patch and leaves the rest alone", () => {
    const { service, code, host } = readyRoom();
    const room = service.updateSettings(code, host.playerId, { rounds: 8 });
    expect(room.settings.rounds).toBe(8);
    expect(room.settings.turnSeconds).toBe(60);
    expect(room.settings.decks).toEqual(["cute-animals"]);
  });

  it("refuses a capacity below the players already seated", () => {
    const { service, code, host } = readyRoom();
    expect(() => service.updateSettings(code, host.playerId, { max_players: 1 })).toThrow(/already 2 players/i);
  });

  it("refuses custom-only with too few words", () => {
    const { service, code, host } = readyRoom();
    expect(() =>
      service.updateSettings(code, host.playerId, { custom_only: true, custom_words: ["cat", "dog"] }),
    ).toThrow(/at least 10/i);
  });

  it("drops duplicate and profane custom words", () => {
    const { service, code, host } = readyRoom();
    const room = service.updateSettings(code, host.playerId, {
      custom_words: ["cat", "Cat", " cat ", "idiot", "dog"],
    });
    expect(room.settings.customWords).toEqual(["cat", "dog"]);
  });

  it("locks settings once the match is under way", () => {
    const { service, code, host } = readyRoom();
    host.room.phase = "DRAWING";
    expect(() => service.updateSettings(code, host.playerId, { rounds: 5 })).toThrow(/locked/i);
  });
});

describe("start conditions", () => {
  it("blocks a new room until a deck is chosen", () => {
    const { service } = setup();
    const { room } = service.createRoom(profile("Host"));
    service.joinRoom(room.code, profile("Guest"));
    const state = toPublicRoomState(room);
    expect(state.can_start).toBe(false);
    expect(state.start_blocked_reason).toMatch(/word deck/i);
  });

  it("blocks a room with a deck but only one player", () => {
    const { service } = setup();
    const { room } = service.createRoom(profile("Host"), { decks: ["cute-animals"] });
    const state = toPublicRoomState(room);
    expect(state.can_start).toBe(false);
    expect(state.start_blocked_reason).toMatch(/waiting for 1/i);
  });

  it("allows a room with a deck and two players", () => {
    const { host } = readyRoom();
    expect(toPublicRoomState(host.room).can_start).toBe(true);
  });
});

describe("kicking", () => {
  it("lets only the host kick", () => {
    const { service, code, guest, host } = readyRoom();
    expect(() => service.kick(code, guest.playerId, host.playerId)).toThrow(/only the host/i);
  });

  it("refuses to remove the host", () => {
    const { service, code, host } = readyRoom();
    expect(() => service.kick(code, host.playerId, host.playerId)).toThrow(/cannot be removed/i);
  });

  it("removes the player and blocks them from coming back", () => {
    const { service, code, host, guest } = readyRoom();
    service.kick(code, host.playerId, guest.playerId);
    expect(service.getRoom(code)!.players.has(guest.playerId)).toBe(false);

    const result = service.connect(code, guest.playerId, guest.sessionToken, new FakeConn("c1"));
    expect(result).toEqual({ ok: false, message: "You were removed from this room" });
  });
});

describe("leaving and host transfer", () => {
  it("hands the host role to the longest-present player", () => {
    const { service, code, host, guest } = readyRoom();
    const third = service.joinRoom(code, profile("Third"));

    service.leave(code, host.playerId);
    const room = service.getRoom(code)!;
    expect(room.hostId).toBe(guest.playerId);
    expect(room.players.has(third.playerId)).toBe(true);
  });

  it("discards the room once the last player leaves", () => {
    const { service, code, host, guest } = readyRoom();
    service.leave(code, host.playerId);
    service.leave(code, guest.playerId);
    expect(service.getRoom(code)).toBeUndefined();
  });
});

describe("reconnects", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds the seat and score through a brief drop", () => {
    const { service, code, guest } = readyRoom();
    const conn = new FakeConn("c1");
    service.connect(code, guest.playerId, guest.sessionToken, conn);
    service.getRoom(code)!.players.get(guest.playerId)!.score = 420;

    service.disconnect(code, guest.playerId, conn);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1000);

    const player = service.getRoom(code)!.players.get(guest.playerId);
    expect(player).toBeDefined();
    expect(player!.connected).toBe(false);

    service.connect(code, guest.playerId, guest.sessionToken, new FakeConn("c2"));
    const back = service.getRoom(code)!.players.get(guest.playerId)!;
    expect(back.connected).toBe(true);
    expect(back.score).toBe(420);
  });

  it("releases the seat once the grace period passes", () => {
    const { service, code, guest } = readyRoom();
    const conn = new FakeConn("c1");
    service.connect(code, guest.playerId, guest.sessionToken, conn);

    service.disconnect(code, guest.playerId, conn);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS + 1000);

    expect(service.getRoom(code)!.players.has(guest.playerId)).toBe(false);
  });

  it("ignores a disconnect from a connection the player has already replaced", () => {
    const { service, code, guest } = readyRoom();
    const stale = new FakeConn("stale");
    service.connect(code, guest.playerId, guest.sessionToken, stale);
    service.connect(code, guest.playerId, guest.sessionToken, new FakeConn("fresh"));

    service.disconnect(code, guest.playerId, stale);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS + 1000);

    expect(service.getRoom(code)!.players.get(guest.playerId)!.connected).toBe(true);
  });
});

describe("one seat, one live connection", () => {
  it("drops the socket a newer one takes over from", () => {
    const { service, code, guest } = readyRoom();
    const firstTab = new FakeConn("first");
    service.connect(code, guest.playerId, guest.sessionToken, firstTab);

    const secondTab = new FakeConn("second");
    service.connect(code, guest.playerId, guest.sessionToken, secondTab);

    expect(firstTab.closed).toBe(true);
    expect(secondTab.closed).toBe(false);
    expect(service.getRoom(code)!.connections.get(guest.playerId)).toBe(secondTab);
  });

  it("keeps the player connected when the socket it replaced closes", () => {
    const { service, code, guest } = readyRoom();
    const firstTab = new FakeConn("first");
    const secondTab = new FakeConn("second");
    service.connect(code, guest.playerId, guest.sessionToken, firstTab);
    service.connect(code, guest.playerId, guest.sessionToken, secondTab);

    // The evicted socket's disconnect arrives afterwards; it must not unseat the live one.
    service.disconnect(code, guest.playerId, firstTab);

    const player = service.getRoom(code)!.players.get(guest.playerId)!;
    expect(player.connected).toBe(true);
    expect(service.getRoom(code)!.connections.get(guest.playerId)).toBe(secondTab);
  });

  it("still reaches the player after a takeover", () => {
    const { service, code, host, guest } = readyRoom();
    service.connect(code, guest.playerId, guest.sessionToken, new FakeConn("first"));
    const secondTab = new FakeConn("second");
    service.connect(code, guest.playerId, guest.sessionToken, secondTab);

    service.kick(code, host.playerId, guest.playerId);
    expect(secondTab.sent.some((s) => s.event === ScribbleEvents.Kicked)).toBe(true);
  });
});

describe("public lobby auto-start", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts counting down once enough players are waiting", () => {
    const { service, code } = readyRoom();
    expect(service.getRoom(code)!.autostartAt).toBeNull();

    service.joinRoom(code, profile("Third"));
    expect(service.getRoom(code)!.autostartAt).toBeGreaterThan(Date.now());
  });

  it("does not count down in a private room", () => {
    const { service, code, host } = readyRoom();
    service.updateSettings(code, host.playerId, { is_private: true });
    service.joinRoom(code, profile("Third"));
    expect(service.getRoom(code)!.autostartAt).toBeNull();
  });

  it("calls the match starter when the countdown expires", () => {
    const store = new ScribbleRoomStore();
    const notifier = new ScribbleRoomNotifier(store);
    const onStart = vi.fn();
    const service = new ScribbleRoomService(store, notifier, new WordListProfanityFilter(), onStart);

    const { room } = service.createRoom(profile("Host"), { decks: ["cute-animals"] });
    service.joinRoom(room.code, profile("Guest"));
    service.joinRoom(room.code, profile("Third"));

    vi.advanceTimersByTime(60_000);
    expect(onStart).toHaveBeenCalledWith(room);
  });
});

describe("public room browser", () => {
  it("lists only public lobbies with space", () => {
    const { store, service } = setup();
    const open = service.createRoom(profile("A"), { decks: ["d"] });
    const priv = service.createRoom(profile("B"), { decks: ["d"], is_private: true });
    const full = service.createRoom(profile("C"), { decks: ["d"], max_players: 2 });
    service.joinRoom(full.room.code, profile("D"));

    const codes = store.joinablePublic().map((r) => r.code);
    expect(codes).toContain(open.room.code);
    expect(codes).not.toContain(priv.room.code);
    expect(codes).not.toContain(full.room.code);
  });
});
