"use client";

import React, { useCallback, useEffect, useRef } from "react";
import type { CanvasChannel } from "../../hooks/useScribbleRoom";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CanvasPainter,
  type Point,
  type Tool,
} from "../../lib/scribblex/drawing";

export type CanvasTool = Tool | "fill";

interface Props {
  channel: CanvasChannel;
  /** False for everyone who is not drawing right now: the canvas becomes a viewer. */
  enabled: boolean;
  tool: CanvasTool;
  color: string;
  size: number;
}

/** Points are streamed in batches rather than one message per pointer move. PRD §7. */
const BATCH_INTERVAL_MS = 30;
/** Beyond 2× the extra pixels cost far more than they show. */
const MAX_PIXEL_RATIO = 2;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * The shared drawing surface.
 *
 * Fixed 4:3 logical space scaled to whatever width it is given, so every client sees the same
 * drawing whatever their screen. Painting is imperative: the painter subscribes to the channel
 * and draws, rather than React re-rendering for each of the dozens of updates a second a stroke
 * produces.
 */
export function Canvas({ channel, enabled, tool, color, size }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const painterRef = useRef<CanvasPainter | null>(null);

  const strokeRef = useRef<{ id: string; pending: Point[] } | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  // Current tool settings, read inside pointer handlers without re-binding them every render.
  // Written after paint rather than during render; handlers only ever run after that anyway.
  const settingsRef = useRef({ enabled, tool, color, size });
  useEffect(() => {
    settingsRef.current = { enabled, tool, color, size };
  });

  /** Size the backing store to the element and repaint the whole log. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.round(rect.width * ratio);
    const height = Math.round((rect.width * CANVAS_HEIGHT) / CANVAS_WIDTH) * ratio;
    canvas.width = width;
    canvas.height = height;

    // No `willReadFrequently`: it moves the context off the GPU to optimise getImageData,
    // which would slow every stroke to speed up the occasional bucket fill.
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The painter works in device pixels, so normalised points and brush widths scale with the
    // backing store and flood fill reads the buffer it actually painted.
    painterRef.current = new CanvasPainter(ctx, width, height);
    painterRef.current.replay(channel.ops.current ?? []);
  }, [channel]);

  useEffect(() => {
    resize();
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [resize]);

  // Paint whatever the channel reports.
  useEffect(
    () =>
      channel.subscribe((change) => {
        const painter = painterRef.current;
        if (!painter) return;
        if (change.type === "replay") painter.replay(channel.ops.current ?? []);
        else painter.apply(change.op);
      }),
    [channel],
  );

  /** Paint immediately, and queue the same points for the next network batch. */
  const addPoints = useCallback(
    (points: Point[]) => {
      const stroke = strokeRef.current;
      if (!stroke || points.length === 0) return;
      const { tool: t, color: c, size: s } = settingsRef.current;
      const meta = { id: stroke.id, tool: t === "fill" ? ("pencil" as const) : t, color: c, size: s };

      channel.paintLocal({ ...meta, points });
      stroke.pending.push(...points);
    },
    [channel],
  );

  /** Hand whatever has accumulated to the server. Paints nothing — that already happened. */
  const flush = useCallback(() => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pending.length === 0) return;
    const { tool: t, color: c, size: s } = settingsRef.current;
    channel.sendStroke({
      id: stroke.id,
      tool: t === "fill" ? "pencil" : t,
      color: c,
      size: s,
      points: stroke.pending,
    });
    stroke.pending = [];
  }, [channel]);

  const stopBatching = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopBatching, [stopBatching]);

  /** Pointer position as 0–1 within the canvas, clamped to its edges. */
  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!settingsRef.current.enabled) return;
    const point = toPoint(e);

    if (settingsRef.current.tool === "fill") {
      channel.sendFill({ id: newId(), color: settingsRef.current.color, x: point.x, y: point.y });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    strokeRef.current = { id: newId(), pending: [] };
    addPoints([point]);
    stopBatching();
    flushTimerRef.current = window.setInterval(flush, BATCH_INTERVAL_MS);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!strokeRef.current || !settingsRef.current.enabled) return;
    // Coalesced events recover the positions the browser dropped between frames, so a fast
    // stroke stays smooth instead of turning into straight chords between samples.
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    addPoints(
      events.map((ev) => ({
        x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
      })),
    );
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!strokeRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    flush();
    stopBatching();
    strokeRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="sx-canvas"
      aria-label={enabled ? "Drawing canvas" : "Drawing canvas, view only"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={endStroke}
      className={`w-full rounded-sx-md border-2 border-sx-ink bg-sx-cream ${
        enabled ? (tool === "fill" ? "cursor-cell" : "cursor-crosshair") : "cursor-default"
      }`}
      // The page must not scroll or zoom under a finger that is drawing.
      style={{ touchAction: "none", aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
    />
  );
}
