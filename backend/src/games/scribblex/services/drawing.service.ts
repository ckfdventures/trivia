import {
  addFill,
  appendStroke,
  clear,
  redo,
  toCanvasSync,
  undo,
  type Tool,
} from "../domain/drawing.js";
import { canDraw, type Room, type RoomConnection } from "../domain/room.js";
import type { ScribbleRoomNotifier } from "./room-notifier.js";
import type { ScribbleRoomStore } from "./room-store.js";

export const DrawEvents = {
  /** Whole canvas, for a client that has just arrived or reconnected. */
  Sync: "draw:sync",
  Stroke: "draw:stroke",
  Fill: "draw:fill",
  Undo: "draw:undo",
  Redo: "draw:redo",
  Clear: "draw:clear",
} as const;

export interface StrokeInput {
  id: string;
  tool: Tool;
  color: string;
  size: number;
  points: { x: number; y: number }[];
}

export interface FillInput {
  id: string;
  color: string;
  x: number;
  y: number;
}

/**
 * Drawing is relayed, never rasterised.
 *
 * The server holds the op log, decides who is allowed to add to it, and forwards each change to
 * the other players. Clients replay the log to produce the image, so everyone converges on the
 * same picture without any pixels crossing the wire.
 *
 * Only deltas are broadcast while drawing — resending the whole log on every batch would put
 * the canvas back on the wire dozens of times a second.
 */
export class ScribbleDrawingService {
  constructor(
    private readonly store: ScribbleRoomStore,
    private readonly notifier: ScribbleRoomNotifier,
  ) {}

  /** Send the current canvas to one client. */
  sync(room: Room, conn: RoomConnection): void {
    this.notifier.send(conn, DrawEvents.Sync, toCanvasSync(room.canvas));
  }

  stroke(code: string, playerId: string, input: StrokeInput): void {
    const room = this.allowed(code, playerId);
    if (!room) return;

    const result = appendStroke(room.canvas, { ...input, playerId });
    if (!result.ok) return;

    // Forward the batch as sent; receivers append to the stroke with this id, or start it.
    this.notifier.broadcast(room, DrawEvents.Stroke, { ...input, player_id: playerId }, playerId);
  }

  fill(code: string, playerId: string, input: FillInput): void {
    const room = this.allowed(code, playerId);
    if (!room) return;
    if (!addFill(room.canvas, { ...input, playerId })) return;
    this.notifier.broadcast(room, DrawEvents.Fill, { ...input, player_id: playerId }, playerId);
  }

  undo(code: string, playerId: string): void {
    const room = this.allowed(code, playerId);
    if (!room) return;
    const opId = undo(room.canvas, playerId);
    if (!opId) return;
    // Everyone re-renders from their log minus this op, the undoing client included: its own
    // canvas has to be rebuilt too, since removing a mark cannot be painted incrementally.
    this.notifier.broadcast(room, DrawEvents.Undo, { op_id: opId, player_id: playerId });
  }

  redo(code: string, playerId: string): void {
    const room = this.allowed(code, playerId);
    if (!room) return;
    const op = redo(room.canvas, playerId);
    if (!op) return;
    this.notifier.broadcast(room, DrawEvents.Redo, { op });
  }

  clear(code: string, playerId: string): void {
    const room = this.allowed(code, playerId);
    if (!room) return;
    clear(room.canvas);
    this.notifier.broadcast(room, DrawEvents.Clear, { generation: room.canvas.generation });
  }

  /** The room, if this player is allowed to draw in it right now. */
  private allowed(code: string, playerId: string): Room | null {
    const room = this.store.get(code);
    if (!room || !canDraw(room, playerId)) return null;
    return room;
  }
}
