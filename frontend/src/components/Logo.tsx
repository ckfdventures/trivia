"use client";

import React from "react";
import { Lightning } from "@phosphor-icons/react";

/** `compact` hides the wordmark below the `sm` breakpoint, leaving room for header controls on phones. */
export function Logo({ inverse = false, size = 22, compact = false }: { inverse?: boolean; size?: number; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 select-none" data-testid="app-logo">
      <div
        className={
          "grid place-items-center rounded-xl h-9 w-9 " +
          (inverse ? "bg-white text-indigo-950" : "bg-indigo-950 text-white")
        }
      >
        <Lightning size={size} weight="fill" />
      </div>
      <div
        className={
          "font-display font-black tracking-tight text-xl " +
          (inverse ? "text-white" : "text-indigo-950") +
          (compact ? " hidden sm:block" : "")
        }
      >
        TRIVIA<span className={inverse ? "text-orange-300" : "text-orange-500"}>STREAM</span>
      </div>
    </div>
  );
}
