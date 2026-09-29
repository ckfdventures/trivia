"use client";

import React from "react";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  Eraser,
  HighlighterCircle,
  PaintBucket,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import type { CanvasTool } from "./Canvas";
import { BRUSH_SIZES, PALETTE } from "../../lib/scribblex/drawing";

interface Props {
  tool: CanvasTool;
  color: string;
  size: number;
  onTool(tool: CanvasTool): void;
  onColor(color: string): void;
  onSize(size: number): void;
  onUndo(): void;
  onRedo(): void;
  onClear(): void;
  disabled?: boolean;
}

const TOOLS: { id: CanvasTool; label: string; Icon: React.ElementType }[] = [
  { id: "pencil", label: "Pencil", Icon: PencilSimple },
  { id: "marker", label: "Marker", Icon: HighlighterCircle },
  { id: "eraser", label: "Eraser", Icon: Eraser },
  { id: "fill", label: "Fill", Icon: PaintBucket },
];

const SIZE_LABELS = ["Small", "Medium", "Large"] as const;

/** Drawing controls. Rendered only for whoever is allowed to draw. */
export function Toolbar({
  tool,
  color,
  size,
  onTool,
  onColor,
  onSize,
  onUndo,
  onRedo,
  onClear,
  disabled = false,
}: Props) {
  const round =
    "grid place-items-center rounded-full border-2 border-sx-ink transition-colors " +
    "disabled:cursor-not-allowed disabled:opacity-45 " +
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-coral";

  return (
    <div
      data-testid="sx-toolbar"
      className="rounded-sx-md border-2 border-sx-ink bg-sx-surface-container p-sx-sm space-y-sx-sm"
    >
      {/* Tools, sizes, history */}
      <div className="flex flex-wrap items-center gap-sx-sm">
        <div role="radiogroup" aria-label="Tool" className="flex gap-2">
          {TOOLS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={tool === id}
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={() => onTool(id)}
              data-testid={`sx-tool-${id}`}
              className={`${round} h-11 w-11 ${tool === id ? "bg-sx-coral" : "bg-white hover:bg-sx-surface-high"}`}
            >
              <Icon size={18} weight="bold" />
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Brush size" className="flex items-center gap-2">
          {BRUSH_SIZES.map((value, i) => (
            <button
              key={value}
              role="radio"
              aria-checked={size === value}
              aria-label={`${SIZE_LABELS[i]} brush`}
              title={`${SIZE_LABELS[i]} brush`}
              disabled={disabled}
              onClick={() => onSize(value)}
              data-testid={`sx-size-${i}`}
              className={`${round} h-11 w-11 ${size === value ? "bg-sx-butter" : "bg-white hover:bg-sx-surface-high"}`}
            >
              <span
                aria-hidden="true"
                className="rounded-full bg-sx-ink"
                style={{ width: 4 + i * 5, height: 4 + i * 5 }}
              />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onUndo}
            disabled={disabled}
            aria-label="Undo"
            title="Undo"
            data-testid="sx-undo"
            className={`${round} h-11 w-11 bg-white hover:bg-sx-surface-high`}
          >
            <ArrowCounterClockwise size={18} weight="bold" />
          </button>
          <button
            onClick={onRedo}
            disabled={disabled}
            aria-label="Redo"
            title="Redo"
            data-testid="sx-redo"
            className={`${round} h-11 w-11 bg-white hover:bg-sx-surface-high`}
          >
            <ArrowClockwise size={18} weight="bold" />
          </button>
          <button
            onClick={onClear}
            disabled={disabled}
            aria-label="Clear the canvas"
            title="Clear the canvas"
            data-testid="sx-clear"
            className={`${round} h-11 w-11 bg-white hover:bg-sx-error-container`}
          >
            <Trash size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* Palette */}
      <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            role="radio"
            aria-checked={color === swatch}
            aria-label={swatch}
            title={swatch}
            disabled={disabled}
            onClick={() => onColor(swatch)}
            data-testid={`sx-color-${swatch.slice(1)}`}
            style={{ backgroundColor: swatch }}
            className={`${round} h-10 w-10 ${
              color === swatch ? "ring-4 ring-sx-ink ring-offset-2 ring-offset-sx-surface-container" : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}
