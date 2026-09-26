"use client";

import React, { useLayoutEffect, useRef } from "react";

interface TimerBarProps {
  /** Server deadline for the question (ms epoch). */
  deadlineTs: number | undefined;
  /** Server clock at the time of the latest snapshot (ms epoch). */
  serverNow: number | undefined;
  timeLimitSeconds: number;
}

/**
 * Shrinking countdown bar. Instead of re-rendering every tick, each server snapshot starts one
 * linear CSS transform transition from the current fraction down to empty, which the browser runs
 * on the compositor at full frame rate.
 */
export function TimerBar({ deadlineTs, serverNow, timeLimitSeconds }: TimerBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !deadlineTs || !serverNow || !timeLimitSeconds) return;
    // The snapshot was just received, so "now" on the server is serverNow.
    const remainingMs = Math.max(0, deadlineTs - serverNow);
    const fraction = Math.min(1, remainingMs / (timeLimitSeconds * 1000));

    bar.style.transition = "none";
    bar.style.transform = `scaleX(${fraction})`;
    bar.getBoundingClientRect(); // commit the start position before animating from it
    bar.style.transition = `transform ${remainingMs}ms linear`;
    bar.style.transform = "scaleX(0)";
  }, [deadlineTs, serverNow, timeLimitSeconds]);

  return (
    <div className="mt-4 h-3 rounded-full bg-white/10 overflow-hidden" data-testid="host-timer-bar">
      <div ref={barRef} className="h-full w-full bg-orange-300 origin-left will-change-transform" />
    </div>
  );
}
