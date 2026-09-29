import { MAX_STROKES_PER_TURN } from "./constants.js";

/**
 * The canvas as an ordered log of operations rather than pixels.
 *
 * Every client replays the same log to reach the same image, which is what makes late joins,
 * reconnects and undo work without the server ever rasterising anything. Points are normalised
 * to 0–1 so the drawing survives any canvas size. PRD §7.
 */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export type Tool = "pencil" | "marker" | "eraser";

/** The fixed palette from the arena design (PRD §6.4). Anything else is rejected. */
export const PALETTE = [
  "#FF85A1",
  "#7CF6EC",
  "#2BB4AB",
  "#FEC736",
  "#FF7A59",
  "#785A00",
  "#1F1A21",
  "#FFFFFF",
] as const;

/** Stroke widths as a fraction of canvas width, so they scale with the rendered size. */
export const BRUSH_SIZES = [0.006, 0.013, 0.026] as const;

export interface Point {
  x: number;
  y: number;
}

export interface StrokeOp {
  kind: "stroke";
  id: string;
  playerId: string;
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
}

export interface FillOp {
  kind: "fill";
  id: string;
  playerId: string;
  color: string;
  x: number;
  y: number;
}

export type DrawOp = StrokeOp | FillOp;

export interface CanvasState {
  ops: DrawOp[];
  /** Per-player redo stacks; a player only ever undoes their own marks. */
  undone: Map<string, DrawOp[]>;
  /** Bumped on clear so a client that missed the event can tell its replay is stale. */
  generation: number;
}

export function createCanvas(): CanvasState {
  return { ops: [], undone: new Map(), generation: 0 };
}

export const isPalette = (color: string): boolean => (PALETTE as readonly string[]).includes(color);

const inUnit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
export const isPoint = (p: Point): boolean => inUnit(p.x) && inUnit(p.y);
export const isBrushSize = (n: number): boolean => (BRUSH_SIZES as readonly number[]).includes(n);

/**
 * Add points to a stroke, starting it if this is the first batch.
 *
 * Drawing streams in batches while the pointer moves, so the same id arrives repeatedly and
 * each call appends. Returns false when the canvas is at its op limit or the stroke belongs to
 * someone else — a client cannot extend another player's line.
 */
export function appendStroke(
  canvas: CanvasState,
  op: Omit<StrokeOp, "kind">,
): { ok: boolean; started: boolean } {
  const existing = canvas.ops.find((o): o is StrokeOp => o.kind === "stroke" && o.id === op.id);
  if (existing) {
    if (existing.playerId !== op.playerId) return { ok: false, started: false };
    existing.points.push(...op.points);
    return { ok: true, started: false };
  }
  if (canvas.ops.length >= MAX_STROKES_PER_TURN) return { ok: false, started: false };

  canvas.ops.push({ kind: "stroke", ...op });
  // A fresh mark invalidates anything that player had undone, as in any editor.
  canvas.undone.delete(op.playerId);
  return { ok: true, started: true };
}

export function addFill(canvas: CanvasState, op: Omit<FillOp, "kind">): boolean {
  if (canvas.ops.length >= MAX_STROKES_PER_TURN) return false;
  canvas.ops.push({ kind: "fill", ...op });
  canvas.undone.delete(op.playerId);
  return true;
}

/** Remove a player's most recent op. Returns its id, or null if they have nothing to undo. */
export function undo(canvas: CanvasState, playerId: string): string | null {
  for (let i = canvas.ops.length - 1; i >= 0; i--) {
    const op = canvas.ops[i]!;
    if (op.playerId !== playerId) continue;
    canvas.ops.splice(i, 1);
    const stack = canvas.undone.get(playerId) ?? [];
    stack.push(op);
    canvas.undone.set(playerId, stack);
    return op.id;
  }
  return null;
}

/** Put back the last op this player undid. Returns it, or null if their stack is empty. */
export function redo(canvas: CanvasState, playerId: string): DrawOp | null {
  const stack = canvas.undone.get(playerId);
  const op = stack?.pop();
  if (!op) return null;
  if (stack!.length === 0) canvas.undone.delete(playerId);
  canvas.ops.push(op);
  return op;
}

export function clear(canvas: CanvasState): void {
  canvas.ops = [];
  canvas.undone.clear();
  canvas.generation += 1;
}

/** The whole canvas, for a client that is joining or reconnecting. */
export function toCanvasSync(canvas: CanvasState) {
  return { generation: canvas.generation, ops: canvas.ops };
}
