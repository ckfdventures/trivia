"use client";

import React from "react";
import { WifiSlash } from "@phosphor-icons/react";

export function ReconnectingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-indigo-950/80 backdrop-blur-md flex items-center justify-center p-6"
      data-testid="reconnecting-overlay"
    >
      <div className="max-w-sm w-full bg-white rounded-3xl p-8 text-center card-lift">
        <div className="mx-auto h-16 w-16 rounded-full bg-orange-100 grid place-items-center animate-pulse">
          <WifiSlash size={32} weight="bold" className="text-orange-600" />
        </div>
        <h3 className="font-display font-black text-2xl text-indigo-950 mt-5">
          Reconnecting…
        </h3>
        <p className="text-indigo-950/70 font-semibold text-sm mt-2">
          Hang tight — you&apos;ll rejoin the game automatically. Your score is safe.
        </p>
      </div>
    </div>
  );
}
