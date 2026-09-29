/**
 * Replaying the canvas op log onto a `<canvas>`.
 *
 * The server never rasterises anything — it forwards an ordered log and every client paints it
 * the same way. Mirrors `backend/src/games/scribblex/domain/drawing.ts`; the two must agree or
 * players see different pictures.
 */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const CANVAS_BACKGROUND = "#FFFDF7";

export type Tool = "pencil" | "marker" | "eraser";

/** The arena palette (PRD §6.4). The server rejects anything else. */
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

/** Stroke widths as a fraction of canvas width, so a drawing scales with the surface. */
export const BRUSH_SIZES = [0.006, 0.013, 0.026] as const;

export interface Point {
  x: number;
  y: number;
}

export interface StrokeOp {
  kind: "stroke";
  id: string;
  playerId?: string;
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
}

export interface FillOp {
  kind: "fill";
  id: string;
  playerId?: string;
  color: string;
  x: number;
  y: number;
}

export type DrawOp = StrokeOp | FillOp;

/** Marker lays down translucent ink, so overlaps read as a highlighter rather than paint. */
const MARKER_ALPHA = 0.55;
const MARKER_WIDTH_SCALE = 1.7;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Paints ops onto a 2D context.
 *
 * Strokes arrive in batches while someone draws, so the painter remembers how much of each
 * stroke it has already put down and only draws the new part. Redrawing a whole stroke on every
 * batch would double-blend the translucent marker and get slower the longer the line got.
 */
export class CanvasPainter {
  private drawnUpTo = new Map<string, number>();

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
  ) {}

  /** Blank the surface and forget what has been painted. */
  reset(): void {
    this.drawnUpTo.clear();
    this.ctx.save();
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = CANVAS_BACKGROUND;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  /** Paint the whole log from scratch. Used on sync, undo, redo and clear. */
  replay(ops: DrawOp[]): void {
    this.reset();
    for (const op of ops) this.apply(op);
  }

  /** Paint whatever is new about this op. */
  apply(op: DrawOp): void {
    if (op.kind === "fill") {
      this.floodFill(op);
      return;
    }
    const from = this.drawnUpTo.get(op.id) ?? 0;
    this.strokeFrom(op, from);
    this.drawnUpTo.set(op.id, op.points.length);
  }

  private strokeFrom(op: StrokeOp, startIndex: number): void {
    const { ctx } = this;
    const pts = op.points;
    if (pts.length === 0) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = op.size * this.width * (op.tool === "marker" ? MARKER_WIDTH_SCALE : 1);
    ctx.strokeStyle = op.color;
    ctx.fillStyle = op.color;
    if (op.tool === "marker") ctx.globalAlpha = MARKER_ALPHA;
    // The eraser cuts back to transparent, then the background shows through on composite.
    if (op.tool === "eraser") ctx.globalCompositeOperation = "destination-out";

    const px = (p: Point) => ({ x: p.x * this.width, y: p.y * this.height });

    if (pts.length === 1 && startIndex === 0) {
      // A tap with no movement is a dot.
      const p = px(pts[0]!);
      ctx.beginPath();
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // One path for the whole batch, not one per segment. Segments drawn separately overlap at
    // every shared endpoint, which the translucent marker blends twice into a bead at each
    // point — and it costs a canvas operation per sample instead of per batch.
    const from = Math.max(1, startIndex);
    if (from >= pts.length) {
      ctx.restore();
      return;
    }

    ctx.beginPath();
    const firstPrev = px(pts[from - 1]!);
    const origin = from >= 2 ? mid(px(pts[from - 2]!), firstPrev) : firstPrev;
    ctx.moveTo(origin.x, origin.y);

    for (let i = from; i < pts.length; i++) {
      const prev = px(pts[i - 1]!);
      const curr = px(pts[i]!);
      const end = mid(prev, curr);
      // Curve through each sample, landing on the midpoint to the next — the standard way to
      // get a smooth line out of discrete pointer positions.
      ctx.quadraticCurveTo(prev.x, prev.y, end.x, end.y);
    }
    // Reach the final sample so the stroke ends under the pointer, not short of it.
    const last = px(pts[pts.length - 1]!);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Bucket fill, run on each client rather than the server (PRD §7).
   *
   * Scanline flood over the pixels already painted, with a tolerance so antialiased stroke
   * edges do not leave a halo of unfilled pixels.
   */
  private floodFill(op: FillOp, tolerance = 40): void {
    const { ctx, width, height } = this;
    const startX = Math.round(op.x * width);
    const startY = Math.round(op.y * height);
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;

    const image = ctx.getImageData(0, 0, width, height);
    const px = new Uint32Array(image.data.buffer);
    const target = px[startY * width + startX]!;
    const replacement = packColor(op.color);
    if (target === replacement) return;

    const stack: number[] = [startY * width + startX];
    const seen = new Uint8Array(width * height);

    while (stack.length > 0) {
      const index = stack.pop()!;
      if (seen[index]) continue;

      const y = Math.floor(index / width);
      // Walk left and right along this row while the colour still matches.
      let left = index;
      while (left % width > 0 && !seen[left - 1] && within(px[left - 1]!, target, tolerance)) left--;
      let right = index;
      while (right % width < width - 1 && !seen[right + 1] && within(px[right + 1]!, target, tolerance)) right++;

      for (let i = left; i <= right; i++) {
        px[i] = replacement;
        seen[i] = 1;
        if (y > 0) {
          const up = i - width;
          if (!seen[up] && within(px[up]!, target, tolerance)) stack.push(up);
        }
        if (y < height - 1) {
          const down = i + width;
          if (!seen[down] && within(px[down]!, target, tolerance)) stack.push(down);
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }
}

/** `#RRGGBB` to the little-endian ABGR word an ImageData Uint32 view uses. Exported for tests. */
export function packColor(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // `>>> 0` matters: bit 31 is set by the opaque alpha, and without it this is a negative
  // int32 that can never compare equal to the unsigned values read out of a Uint32Array.
  return (((255 << 24) | (b << 16) | (g << 8) | r) >>> 0);
}

/** Channel-wise closeness of two packed pixels, so antialiased edges still fill. Exported for tests. */
export function within(a: number, b: number, tolerance: number): boolean {
  if (a === b) return true;
  return (
    Math.abs((a & 0xff) - (b & 0xff)) <= tolerance &&
    Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) <= tolerance &&
    Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) <= tolerance &&
    Math.abs(((a >> 24) & 0xff) - ((b >> 24) & 0xff)) <= tolerance
  );
}

/**
 * Apply an incoming batch to the local log, starting the stroke if it is new.
 *
 * Returns the *merged* stroke — every point so far, not just the batch. The painter indexes
 * strokes absolutely, so handing it a batch would make it skip the join between batches and,
 * when a batch held a single point, draw nothing at all.
 */
export function mergeStroke(
  ops: DrawOp[],
  incoming: StrokeOp,
): { ops: DrawOp[]; merged: StrokeOp } {
  const existing = ops.find((o): o is StrokeOp => o.kind === "stroke" && o.id === incoming.id);
  if (!existing) {
    const started: StrokeOp = { ...incoming, points: [...incoming.points] };
    return { ops: [...ops, started], merged: started };
  }
  existing.points.push(...incoming.points);
  return { ops, merged: existing };
}
