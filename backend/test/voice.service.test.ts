import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoom, emptyScore, type Room, type RoomConnection } from "../src/domain/room.js";
import { PUBLIC_STUN, type IceServerProvider } from "../src/services/ice-servers.js";
import { RoomStore } from "../src/services/room-store.js";
import { VoiceEvents, VoiceService } from "../src/services/voice.service.js";
import { silentLogger } from "../src/shared/logger.js";

class FakeConn implements RoomConnection {
  readonly sent: { event: string; data: any }[] = [];
  constructor(readonly id: string) {}
  send(event: string, data: unknown): void {
    this.sent.push({ event, data });
  }
  last(event: string) {
    return this.sent.filter((m) => m.event === event).at(-1)?.data;
  }
}

const iceServers: IceServerProvider = { getIceServers: () => Promise.resolve(PUBLIC_STUN) };
const HOLD_MS = 30_000;

function setup(capacity = 8) {
  const store = new RoomStore();
  const room: Room = createRoom({
    pin: "123456",
    quiz: { title: "Quiz", questions: [] },
    hostToken: "host-token",
    hostId: "host-id",
  });
  store.add(room);
  const voice = new VoiceService(store, iceServers, silentLogger, HOLD_MS, capacity);
  const addPlayer = (id: string) => {
    room.players.set(id, { id, nickname: id, connected: true, session_token: `tok-${id}`, joined_at: "" });
    room.scores.set(id, emptyScore());
  };
  /** Connect a player's voice socket and take a slot. */
  const joinVoice = async (id: string, conn = new FakeConn(`sock-${id}`), sessionId = `sess-${id}`) => {
    if (!room.players.has(id)) addPlayer(id);
    expect(voice.connect(room.pin, `tok-${id}`, conn)).toEqual({ ok: true, playerId: id });
    await voice.join(room.pin, id, conn, { sessionId, micOn: true, speakerOn: true });
    return conn;
  };
  return { store, room, voice, addPlayer, joinVoice };
}

describe("VoiceService", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rejects voice sockets without a valid player session", () => {
    const { voice, room } = setup();
    expect(voice.connect(room.pin, "wrong", new FakeConn("x"))).toEqual({ ok: false, message: "Player not found in room" });
    expect(voice.connect("000000", "tok-a", new FakeConn("x"))).toEqual({ ok: false, message: "Room not found" });
  });

  it("gives a joining member ICE servers and tells everyone the roster", async () => {
    const { joinVoice } = setup();
    const a = await joinVoice("a");
    const b = await joinVoice("b");
    expect(b.last(VoiceEvents.Joined)).toEqual({ session_id: "sess-b", ice_servers: PUBLIC_STUN });
    const roster = a.last(VoiceEvents.Roster);
    expect(roster.members.map((m: any) => m.player_id)).toEqual(["a", "b"]);
    expect(roster.members[1]).toMatchObject({ session_id: "sess-b", mic_on: true, speaker_on: true, connected: true });
  });

  it("caps voice at the slot limit and lets a waiting player in once a slot frees up", async () => {
    const { voice, room, joinVoice } = setup(2);
    const a = await joinVoice("a");
    await joinVoice("b");
    const c = await joinVoice("c");
    expect(c.last(VoiceEvents.Full)).toEqual({ capacity: 2 });
    expect(room.voice.members.has("c")).toBe(false);

    voice.leave(room.pin, "a", a);
    await voice.join(room.pin, "c", c, { sessionId: "sess-c", micOn: true, speakerOn: true });
    expect([...room.voice.members.keys()]).toEqual(["b", "c"]);
  });

  it("stamps relayed signals with the real sender, ignoring what the client claims", async () => {
    const { voice, room, joinVoice } = setup();
    const a = await joinVoice("a");
    await joinVoice("b");
    const vikram = await joinVoice("vikram");

    voice.signal(room.pin, "vikram", vikram, { to: "a", toSession: "sess-a", data: { from: "b", description: "offer" } });
    expect(a.last(VoiceEvents.Signal)).toEqual({
      from: "vikram",
      from_session: "sess-vikram",
      to_session: "sess-a",
      data: { from: "b", description: "offer" },
    });
  });

  it("only relays signals between current voice members", async () => {
    const { voice, room, joinVoice, addPlayer } = setup();
    const a = await joinVoice("a");
    addPlayer("watcher");
    const watcher = new FakeConn("sock-watcher");
    voice.connect(room.pin, "tok-watcher", watcher);

    voice.signal(room.pin, "watcher", watcher, { to: "a", toSession: "sess-a", data: {} });
    // A stale socket of a member can't speak for them either.
    const oldSocket = new FakeConn("old");
    voice.signal(room.pin, "a", oldSocket, { to: "a", toSession: "sess-a", data: {} });
    expect(a.last(VoiceEvents.Signal)).toBeUndefined();
  });

  it("holds a disconnected member's slot, then frees it after the grace period", async () => {
    const { voice, room, joinVoice } = setup(2);
    const a = await joinVoice("a");
    const b = await joinVoice("b");
    voice.disconnect(room.pin, a);
    expect(b.last(VoiceEvents.Roster).members[0]).toMatchObject({ player_id: "a", connected: false });

    const c = await joinVoice("c");
    expect(c.last(VoiceEvents.Full)).toEqual({ capacity: 2 });

    vi.advanceTimersByTime(HOLD_MS);
    expect([...room.voice.members.keys()]).toEqual(["b"]);
  });

  it("gives the held slot back when the member reconnects in time", async () => {
    const { voice, room, joinVoice } = setup();
    const a = await joinVoice("a");
    voice.disconnect(room.pin, a);
    vi.advanceTimersByTime(HOLD_MS / 2);
    await joinVoice("a", new FakeConn("sock-a2"), "sess-a2");
    vi.advanceTimersByTime(HOLD_MS);
    expect(room.voice.members.get("a")).toMatchObject({ sessionId: "sess-a2", conn: { id: "sock-a2" } });
  });

  it("mutes every member except the playing host, and needs the host token", async () => {
    const { voice, room, joinVoice } = setup();
    const host = await joinVoice("host");
    const a = await joinVoice("a");
    room.hostPlayerId = "host";

    expect(() => voice.muteAll(room.pin, "wrong")).toThrow("Invalid host token");
    expect(voice.muteAll(room.pin, "host-token")).toEqual({ muted: 1 });
    expect(a.last(VoiceEvents.MutedByHost)).toEqual({});
    expect(host.last(VoiceEvents.MutedByHost)).toBeUndefined();
    expect(room.voice.members.get("a")?.micOn).toBe(false);
    expect(room.voice.members.get("host")?.micOn).toBe(true);
  });

  it("broadcasts mic and speaker changes", async () => {
    const { voice, room, joinVoice } = setup();
    const a = await joinVoice("a");
    const b = await joinVoice("b");
    voice.setState(room.pin, "b", b, { micOn: false, speakerOn: false });
    expect(a.last(VoiceEvents.Roster).members[1]).toMatchObject({ mic_on: false, speaker_on: false });
  });
});
