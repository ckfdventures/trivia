import { describe, expect, it } from "vitest";
import {
  BRUSH_SIZES,
  PALETTE,
  mergeStroke,
  packColor,
  within,
  type DrawOp,
  type StrokeOp,
} from "./drawing";

/**
 * The pure parts of the canvas: colour packing for the bucket fill, and merging the stroke
 * batches that arrive while someone draws. The painting itself needs a real canvas, so it is
 * not covered here.
 */

const stroke = (id: string, points: { x: number; y: number }[]): StrokeOp => ({
  kind: "stroke",
  id,
  tool: "pencil",
  color: PALETTE[6],
  size: BRUSH_SIZES[1],
  points,
});

describe("packColor", () => {
  it("packs a hex colour into the byte order an ImageData view uses", () => {
    // #FF7A59 → r=FF g=7A b=59, stored little-endian as ABGR.
    expect(packColor("#FF7A59")).toBe(0xff597aff);
  });

  it("returns an unsigned value that can be compared with Uint32Array reads", () => {
    for (const color of PALETTE) {
      const packed = packColor(color);
      expect(packed).toBeGreaterThanOrEqual(0);

      // The comparison the flood fill actually makes: a value written into a pixel buffer and
      // read back must equal the packed colour, or "already this colour" can never be detected.
      const buffer = new Uint32Array(1);
      buffer[0] = packed;
      expect(buffer[0]).toBe(packed);
    }
  });

  it("packs opaque white without going negative", () => {
    const white = packColor("#FFFFFF");
    expect(white).toBe(0xffffffff);
    expect(white).toBeGreaterThan(0);
  });
});

describe("within", () => {
  it("treats identical pixels as matching", () => {
    expect(within(packColor("#FF7A59"), packColor("#FF7A59"), 0)).toBe(true);
  });

  it("accepts near-identical pixels so antialiased edges still fill", () => {
    const a = packColor("#FF7A59");
    const b = packColor("#FB7655");
    expect(within(a, b, 40)).toBe(true);
    expect(within(a, b, 1)).toBe(false);
  });

  it("rejects clearly different colours", () => {
    expect(within(packColor("#FFFFFF"), packColor("#1F1A21"), 40)).toBe(false);
  });
});

describe("mergeStroke", () => {
  it("starts a stroke that has not been seen before", () => {
    const { ops, merged } = mergeStroke([], stroke("s1", [{ x: 0, y: 0 }]));
    expect(ops).toHaveLength(1);
    expect(merged.points).toHaveLength(1);
  });

  it("returns the whole stroke, not just the batch that arrived", () => {
    // The regression this file exists for. The painter tracks how many points of a stroke it
    // has drawn and indexes into `points` absolutely, so it must be handed every point so far.
    // Handed only the newest batch, it skipped the join between batches — and when a batch
    // held one point, its index ran past the end and it drew nothing. Strokes came out as
    // disconnected fragments and, at speed, as isolated dots.
    let ops: DrawOp[] = [];
    let merged: StrokeOp;

    ({ ops, merged } = mergeStroke(ops, stroke("s1", [{ x: 0, y: 0 }])));
    expect(merged.points).toHaveLength(1);

    ({ ops, merged } = mergeStroke(ops, stroke("s1", [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }])));
    expect(merged.points).toHaveLength(3);

    // A single-point batch is the case that used to render nothing at all.
    ({ ops, merged } = mergeStroke(ops, stroke("s1", [{ x: 0.3, y: 0.3 }])));
    expect(merged.points).toHaveLength(4);
    expect(merged.points.at(-1)).toEqual({ x: 0.3, y: 0.3 });
  });

  it("keeps the log and the merged stroke pointing at the same object", () => {
    // The painter is given `merged` while later batches are appended to the op inside `ops`;
    // if they diverged, a replay and an incremental draw would disagree.
    let { ops, merged } = mergeStroke([], stroke("s1", [{ x: 0, y: 0 }]));
    expect(ops[0]).toBe(merged);

    ({ ops, merged } = mergeStroke(ops, stroke("s1", [{ x: 1, y: 1 }])));
    expect(ops[0]).toBe(merged);
    expect(ops).toHaveLength(1);
  });

  it("keeps separate strokes separate", () => {
    let { ops } = mergeStroke([], stroke("s1", [{ x: 0, y: 0 }]));
    ({ ops } = mergeStroke(ops, stroke("s2", [{ x: 1, y: 1 }])));
    expect(ops.map((o) => o.id)).toEqual(["s1", "s2"]);
  });

  it("copies the incoming points rather than aliasing the caller's array", () => {
    const incoming = stroke("s1", [{ x: 0, y: 0 }]);
    const { ops } = mergeStroke([], incoming);
    incoming.points.push({ x: 9, y: 9 });
    expect((ops[0] as StrokeOp).points).toHaveLength(1);
  });

  it("leaves a fill in place when a stroke shares nothing with it", () => {
    const fill: DrawOp = { kind: "fill", id: "f1", color: PALETTE[0], x: 0.5, y: 0.5 };
    const { ops } = mergeStroke([fill], stroke("s1", [{ x: 0, y: 0 }]));
    expect(ops.map((o) => o.kind)).toEqual(["fill", "stroke"]);
  });
});

describe("shared constants", () => {
  it("offers exactly the eight palette colours the server accepts", () => {
    expect(PALETTE).toHaveLength(8);
    expect(new Set(PALETTE).size).toBe(8);
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("offers three brush sizes, ascending", () => {
    expect(BRUSH_SIZES).toHaveLength(3);
    expect([...BRUSH_SIZES]).toEqual([...BRUSH_SIZES].sort((a, b) => a - b));
  });
});
