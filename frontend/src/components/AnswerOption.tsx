"use client";

import React from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { AnswerShape, ANSWER_META } from "./AnswerShape";

type Selection = "none" | "selected" | "dimmed";

interface AnswerOptionProps {
  index: number;
  text: string;
  /** "lg" is the host's big-screen card; "md" fits a phone. */
  size?: "lg" | "md";
  /** Makes the card a button. Omit for a display-only card. */
  onSelect?: () => void;
  disabled?: boolean;
  selection?: Selection;
  testId?: string;
}

const SIZES = {
  lg: {
    card: "rounded-3xl px-6 py-6 gap-4",
    tile: "h-14 w-14 rounded-2xl",
    shape: 30,
    text: "text-2xl sm:text-3xl",
  },
  md: {
    card: "rounded-2xl px-4 py-3 gap-3 [@media(max-height:500px)]:py-2",
    tile: "h-11 w-11 rounded-xl [@media(max-height:500px)]:h-8 [@media(max-height:500px)]:w-8",
    shape: 22,
    text: "text-lg sm:text-xl [@media(max-height:500px)]:text-base",
  },
};

/** A colour + shape coded answer card, shared by the host and player screens. */
export function AnswerOption({ index, text, size = "lg", onSelect, disabled, selection = "none", testId }: AnswerOptionProps) {
  const meta = ANSWER_META[index] ?? ANSWER_META[0]!;
  const s = SIZES[size];
  const className =
    `${s.card} ${meta.bg} text-white flex items-center card-lift` +
    (onSelect ? " w-full text-left transition active:translate-y-1 disabled:cursor-default" : "") +
    (selection === "selected" ? " ring-4 ring-white" : "") +
    (selection === "dimmed" ? " opacity-40" : "");

  const content = (
    <>
      <div className={`${s.tile} bg-white/25 grid place-items-center shrink-0`}>
        <AnswerShape index={index} size={s.shape} />
      </div>
      <div className={`font-display font-black ${s.text} leading-tight break-words min-w-0 flex-1`}>{text}</div>
      {selection === "selected" && <CheckCircle size={size === "lg" ? 32 : 26} weight="fill" className="shrink-0" aria-label="Your answer" />}
    </>
  );

  if (!onSelect) {
    return (
      <div className={className} data-testid={testId}>
        {content}
      </div>
    );
  }
  return (
    <button type="button" onClick={onSelect} disabled={disabled} aria-pressed={selection === "selected"} className={className} data-testid={testId}>
      {content}
    </button>
  );
}
