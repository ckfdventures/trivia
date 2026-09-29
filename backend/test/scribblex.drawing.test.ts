import { describe, expect, it } from "vitest";
import { MAX_STROKES_PER_TURN } from "../src/games/scribblex/domain/constants.js";
import {
  BRUSH_SIZES,
  PALETTE,
  appendStroke,
  clear,
  createCanvas,
  isBrushSize,
  isPalette,
  redo,
  undo,
} from "../src/games/scribblex/domain/drawing.js";
import { canDraw, createPlayer, createRoom, type RoomConnection } from "../src/games/scribblex/domain/room.js";
import { fillSchema, strokeSchema } from "../src/games/scribblex/http/schemas.js";
import { ScribbleDrawingService, DrawEvents } from "../src/games/scribblex/services/drawing.service.js";
import { ScribbleRoomNotifier } from "../src/games/scribblex/services/room-notifier.js";
import { ScribbleRoomStore } from "../src/games/scribblex/services/room-store.js";

class FakeConn implements RoomConnection {
  readonly sent: { event: string; data: any }[] = [];
  constructor(readonly id: string) {}
  send(event: string, data: unknown): void {
    this.sent.push({ event, data });
  }
  events(name: string) {
    return this.sent.filter((s) => s.event === name);
  }
}

const ink = PALETTE[6];
const coral = PALETTE[4];
const size = BRUSH_SIZES[1];

const strokeOp = (id: string, playerId: string, points = [{ x: 0.1, y: 0.1 }]) => ({
  id,
  playerId,
  tool: "pencil" as const,
  color: ink,
  size,
  points,
});

/** A room with two seated players, each holding a connection. */
function setup() {
  const store = new ScribbleRoomStore();
  const notifier = new ScribbleRoomNotifier(store);
  const drawing = new ScribbleDrawingService(store, notifier);

  const room = createRoom({ code: "ABC234", hostId: "host" });
  room.players.set("host", createPlayer("host", { name: "Host", avatarId: "pip", hatId: null }));
  room.players.set("guest", createPlayer("guest", { name: "Guest", avatarId: "pip", hatId: null }));
  const hostConn = new FakeConn("h");
  const guestConn = new FakeConn("g");
  room.connections.set("host", hostConn);
  room.connections.set("guest", guestConn);
  store.add(room);

  return { store, drawing, room, hostConn, guestConn };
}

describe("canvas op log", () => {
  it("starts a stroke and appends later batches to it", () => {
    const canvas = createCanvas();
    expect(appendStroke(canvas, strokeOp("s1", "p1", [{ x: 0, y: 0 }]))).toEqual({ ok: true, started: true });
    expect(appendStroke(canvas, strokeOp("s1", "p1", [{ x: 0.5, y: 0.5 }]))).toEqual({ ok: true, started: false });

    expect(canvas.ops).toHaveLength(1);
    expect((canvas.ops[0] as { points: unknown[] }).points).toHaveLength(2);
  });

  it("refuses to let a player extend someone else's stroke", () => {
    const canvas = createCanvas();
    appendStroke(canvas, strokeOp("s1", "p1"));
    const result = appendStroke(canvas, strokeOp("s1", "intruder", [{ x: 0.9, y: 0.9 }]));

    expect(result.ok).toBe(false);
    expect((canvas.ops[0] as { points: unknown[] }).points).toHaveLength(1);
  });

  it("stops accepting new ops at the per-turn limit", () => {
    const canvas = createCanvas();
    for (let i = 0; i < MAX_STROKES_PER_TURN; i++) appendStroke(canvas, strokeOp(`s${i}`, "p1"));
    expect(canvas.ops).toHaveLength(MAX_STROKES_PER_TURN);

    expect(appendStroke(canvas, strokeOp("one-too-many", "p1")).ok).toBe(false);
    expect(canvas.ops).toHaveLength(MAX_STROKES_PER_TURN);
  });
});

describe("undo and redo", () => {
  it("removes only the undoing player's most recent mark", () => {
    const canvas = createCanvas();
    appendStroke(canvas, strokeOp("a", "p1"));
    appendStroke(canvas, strokeOp("b", "p2"));
    appendStroke(canvas, strokeOp("c", "p1"));

    expect(undo(canvas, "p1")).toBe("c");
    expect(canvas.ops.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("returns null when a player has nothing of their own to undo", () => {
    const canvas = createCanvas();
    appendStroke(canvas, strokeOp("a", "p1"));
    expect(undo(canvas, "p2")).toBeNull();
    expect(canvas.ops).toHaveLength(1);
  });

  it("puts an undone mark back", () => {
    const canvas = createCanvas();
    appendStroke(canvas, strokeOp("a", "p1"));
    undo(canvas, "p1");
    expect(canvas.ops).toHaveLength(0);

    expect(redo(canvas, "p1")?.id).toBe("a");
    expect(canvas.ops.map((o) => o.id)).toEqual(["a"]);
  });

  it("drops the redo stack once the player draws something new", () => {
    const canvas = createCanvas();
    appendStroke(canvas, strokeOp("a", "p1"));
    undo(canvas, "p1");
    appendStroke(canvas, strokeOp("b", "p1"));

    expect(redo(canvas, "p1")).toBeNull();
    expect(canvas.ops.map((o) => o.id)).toEqual(["b"]);
  });

  it("clears everything and bumps the generation", () => {
    const canvas = createCanvas();
    appendStroke(canvas, strokeOp("a", "p1"));
    undo(canvas, "p1");
    clear(canvas);

    expect(canvas.ops).toHaveLength(0);
    expect(canvas.undone.size).toBe(0);
    expect(canvas.generation).toBe(1);
    expect(redo(canvas, "p1")).toBeNull();
  });
});

describe("who may draw", () => {
  it("lets anyone in the room draw while it is a lobby", () => {
    const { room } = setup();
    expect(canDraw(room, "host")).toBe(true);
    expect(canDraw(room, "guest")).toBe(true);
    expect(canDraw(room, "stranger")).toBe(false);
  });

  it("lets only the drawer draw during a turn", () => {
    const { room } = setup();
    room.phase = "DRAWING";
    room.drawerOrder = ["host", "guest"];
    room.drawerIndex = 0;

    expect(canDraw(room, "host")).toBe(true);
    expect(canDraw(room, "guest")).toBe(false);
  });

  it("lets nobody draw between turns", () => {
    const { room } = setup();
    for (const phase of ["WORD_PICK", "REVEAL", "RESULTS"] as const) {
      room.phase = phase;
      expect(canDraw(room, "host")).toBe(false);
    }
  });
});

describe("relaying", () => {
  it("forwards a stroke to the other players but not back to its author", () => {
    const { drawing, hostConn, guestConn } = setup();
    drawing.stroke("ABC234", "host", { id: "s1", tool: "pencil", color: ink, size, points: [{ x: 0.2, y: 0.2 }] });

    expect(guestConn.events(DrawEvents.Stroke)).toHaveLength(1);
    expect(guestConn.events(DrawEvents.Stroke)[0]!.data).toMatchObject({ id: "s1", player_id: "host" });
    expect(hostConn.events(DrawEvents.Stroke)).toHaveLength(0);
  });

  it("drops a stroke from someone who may not draw", () => {
    const { drawing, room, guestConn } = setup();
    room.phase = "DRAWING";
    room.drawerOrder = ["host"];
    room.drawerIndex = 0;

    drawing.stroke("ABC234", "guest", { id: "s1", tool: "pencil", color: ink, size, points: [{ x: 0.2, y: 0.2 }] });
    expect(room.canvas.ops).toHaveLength(0);
    expect(guestConn.events(DrawEvents.Stroke)).toHaveLength(0);
  });

  it("tells everyone about an undo, including the player who asked for it", () => {
    const { drawing, room, hostConn, guestConn } = setup();
    drawing.stroke("ABC234", "host", { id: "s1", tool: "pencil", color: ink, size, points: [{ x: 0.2, y: 0.2 }] });
    drawing.undo("ABC234", "host");

    expect(room.canvas.ops).toHaveLength(0);
    // Removing a mark cannot be painted incrementally, so the author re-renders too.
    expect(hostConn.events(DrawEvents.Undo)).toHaveLength(1);
    expect(guestConn.events(DrawEvents.Undo)).toHaveLength(1);
    expect(hostConn.events(DrawEvents.Undo)[0]!.data).toMatchObject({ op_id: "s1" });
  });

  it("says nothing when there is nothing to undo", () => {
    const { drawing, hostConn, guestConn } = setup();
    drawing.undo("ABC234", "host");
    expect(hostConn.events(DrawEvents.Undo)).toHaveLength(0);
    expect(guestConn.events(DrawEvents.Undo)).toHaveLength(0);
  });

  it("hands a joining client the canvas as it already stands", () => {
    const { drawing, room } = setup();
    drawing.stroke("ABC234", "host", { id: "s1", tool: "pencil", color: coral, size, points: [{ x: 0.2, y: 0.2 }] });

    const latecomer = new FakeConn("late");
    drawing.sync(room, latecomer);

    const sync = latecomer.events(DrawEvents.Sync)[0]!;
    expect(sync.data.generation).toBe(0);
    expect(sync.data.ops).toHaveLength(1);
    expect(sync.data.ops[0]).toMatchObject({ id: "s1", color: coral });
  });

  it("announces a clear with the new generation", () => {
    const { drawing, guestConn } = setup();
    drawing.stroke("ABC234", "host", { id: "s1", tool: "pencil", color: ink, size, points: [{ x: 0.2, y: 0.2 }] });
    drawing.clear("ABC234", "host");

    expect(guestConn.events(DrawEvents.Clear)[0]!.data).toEqual({ generation: 1 });
  });
});

describe("payload validation", () => {
  it("accepts a well-formed stroke", () => {
    expect(
      strokeSchema.safeParse({ id: "s1", tool: "pencil", color: ink, size, points: [{ x: 0.5, y: 0.5 }] }).success,
    ).toBe(true);
  });

  it("rejects a colour that is not on the palette", () => {
    const res = strokeSchema.safeParse({ id: "s1", tool: "pencil", color: "#123456", size, points: [{ x: 0, y: 0 }] });
    expect(res.success).toBe(false);
  });

  it("rejects an arbitrary brush size", () => {
    const res = strokeSchema.safeParse({ id: "s1", tool: "pencil", color: ink, size: 0.5, points: [{ x: 0, y: 0 }] });
    expect(res.success).toBe(false);
  });

  it("rejects points outside the canvas", () => {
    const res = strokeSchema.safeParse({ id: "s1", tool: "pencil", color: ink, size, points: [{ x: 1.5, y: 0 }] });
    expect(res.success).toBe(false);
  });

  it("rejects an oversized batch", () => {
    const points = Array.from({ length: 501 }, () => ({ x: 0.5, y: 0.5 }));
    expect(strokeSchema.safeParse({ id: "s1", tool: "pencil", color: ink, size, points }).success).toBe(false);
  });

  it("rejects an unknown tool", () => {
    const res = strokeSchema.safeParse({ id: "s1", tool: "airbrush", color: ink, size, points: [{ x: 0, y: 0 }] });
    expect(res.success).toBe(false);
  });

  it("validates fills the same way", () => {
    expect(fillSchema.safeParse({ id: "f1", color: ink, x: 0.5, y: 0.5 }).success).toBe(true);
    expect(fillSchema.safeParse({ id: "f1", color: "#abcdef", x: 0.5, y: 0.5 }).success).toBe(false);
    expect(fillSchema.safeParse({ id: "f1", color: ink, x: -0.1, y: 0.5 }).success).toBe(false);
  });

  it("agrees with the domain predicates", () => {
    expect(isPalette(ink)).toBe(true);
    expect(isPalette("#000000")).toBe(false);
    expect(isBrushSize(size)).toBe(true);
    expect(isBrushSize(0.999)).toBe(false);
  });
});
