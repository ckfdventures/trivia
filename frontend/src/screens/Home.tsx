"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LockSimple } from "@phosphor-icons/react";
import { AnswerShape } from "../components/AnswerShape";
import { GAMES, PLATFORM_NAME } from "../lib/brand";
import { useNavigate } from "../lib/navigation";
import { routes } from "../lib/routes";

/**
 * The platform home: two game territories meeting at an ink seam.
 *
 * Each territory carries its own game's colour world and holds that game's real entry
 * control — you type a PIN here, rather than being sent to a page that asks for one. The
 * shell itself contributes only structure: ink, linework and the shared tactile press.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-shell-ink flex flex-col">
      <ShellBar />
      <main className="flex-1 grid lg:grid-cols-2 gap-px bg-shell-ink">
        <TriviaGate />
        <ScribbleGate />
      </main>
    </div>
  );
}

function ShellBar() {
  return (
    <header className="bg-shell-ink text-shell-bone">
      <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 h-14 flex items-center justify-between">
        <span className="font-shell text-[17px] font-extrabold tracking-tight">
          {PLATFORM_NAME}
        </span>
        <Link
          href={routes.admin.login}
          data-testid="shell-admin-login"
          className="font-shell text-[13px] font-bold text-shell-dim hover:text-shell-bone inline-flex items-center gap-1.5 rounded-full px-3 h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-bone transition-colors"
        >
          <LockSimple size={13} weight="bold" />
          Admin
        </Link>
      </div>
    </header>
  );
}

/** Shared entrance: the two territories arrive from their own edges, once, on load. */
const gateMotion = (from: number) => ({
  initial: { opacity: 0, x: from, y: 0 },
  animate: { opacity: 1, x: 0, y: 0 },
  transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const },
});

// ─────────────────────────────────────────────────────────────── Trivia

function TriviaGate() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pin.replace(/\D/g, "");
    if (clean.length !== 6) {
      setError("A game PIN is 6 digits.");
      return;
    }
    navigate(routes.trivia.join(clean));
  };

  return (
    <motion.section
      {...gateMotion(-24)}
      data-testid="gate-trivia"
      className="bg-trivia-violet text-white relative overflow-hidden grain px-6 sm:px-10 lg:px-14 py-14 lg:py-20 flex flex-col justify-center"
    >
      <div className="relative z-10 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto lg:mr-14">
        <div className="flex items-center gap-2.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-9 w-9 rounded-xl grid place-items-center ${
                ["bg-[#EF4444]", "bg-[#3B82F6]", "bg-[#EAB308]", "bg-[#22C55E]"][i]
              }`}
            >
              <AnswerShape index={i} size={16} />
            </div>
          ))}
        </div>

        <h1 className="font-shell text-[13vw] sm:text-[64px] lg:text-[72px] leading-[0.92] font-extrabold tracking-[-0.03em] mt-7">
          {GAMES.trivia.name}
        </h1>
        <p className="font-shell text-lg font-medium text-trivia-peach/90 mt-3 max-w-xs">
          {GAMES.trivia.tagline}
        </p>

        <form onSubmit={submit} className="mt-9">
          <label
            htmlFor="trivia-pin"
            className="font-shell text-sm font-bold text-white/70 block mb-2"
          >
            Game PIN
          </label>
          <input
            id="trivia-pin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setError("");
              setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            placeholder="000000"
            data-testid="trivia-pin-input"
            aria-describedby={error ? "trivia-pin-error" : undefined}
            className="w-full h-16 rounded-2xl bg-white text-trivia-deep font-shell font-extrabold text-3xl text-center tracking-[0.35em] indent-[0.35em] placeholder:text-trivia-deep/20 focus:outline-none focus:ring-4 focus:ring-trivia-peach"
          />
          {error && (
            <p
              id="trivia-pin-error"
              data-testid="trivia-pin-error"
              className="font-shell text-sm font-bold text-trivia-peach mt-2"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            data-testid="trivia-join-btn"
            className="press mt-4 w-full h-14 rounded-full bg-trivia-peach text-trivia-deep font-shell font-extrabold text-lg shadow-[0_5px_0_#7C2D12] hover:shadow-[0_8px_0_#7C2D12] active:shadow-[0_0_0_#7C2D12] hover:bg-trivia-peach-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
          >
            Join game
          </button>
        </form>

        <button
          onClick={() => navigate(routes.trivia.hostCreate)}
          data-testid="trivia-host-btn"
          className="mt-4 w-full h-12 rounded-full border-2 border-white/35 text-white font-shell font-bold hover:bg-white hover:text-trivia-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-trivia-peach transition-colors"
        >
          Host a game
        </button>
      </div>
    </motion.section>
  );
}

// ─────────────────────────────────────────────────────────────── ScribbleX

function ScribbleGate() {
  const navigate = useNavigate();

  return (
    <motion.section
      {...gateMotion(24)}
      data-testid="gate-scribblex"
      className="sx-dots text-sx-ink relative overflow-hidden px-6 sm:px-10 lg:px-14 py-14 lg:py-20 flex flex-col justify-center"
    >
      <div className="relative z-10 w-full max-w-md mx-auto lg:mx-0 lg:mr-auto lg:ml-14">
        <Scribble />

        <div className="flex items-center gap-3 mt-7">
          <h1 className="font-shell text-[13vw] sm:text-[64px] lg:text-[72px] leading-[0.92] font-extrabold tracking-[-0.03em]">
            {GAMES.scribblex.name}
          </h1>
          <span className="sx-tilt-b shrink-0 rounded-full bg-sx-butter border-[1.5px] border-sx-ink px-3 py-1 font-shell text-xs font-extrabold">
            Soon
          </span>
        </div>
        <p className="font-shell text-lg font-medium text-sx-on-surface-variant mt-3 max-w-xs">
          {GAMES.scribblex.tagline}
        </p>

        <div className="mt-9">
          <label
            htmlFor="sx-code"
            className="font-shell text-sm font-bold text-sx-on-surface-variant block mb-2"
          >
            Room code
          </label>
          <input
            id="sx-code"
            disabled
            placeholder="ABC123"
            data-testid="scribblex-code-input"
            className="w-full h-16 rounded-2xl bg-white border-[2.5px] border-sx-ink text-sx-ink font-shell font-extrabold text-3xl text-center tracking-[0.3em] indent-[0.3em] placeholder:text-sx-ink/20 disabled:cursor-not-allowed disabled:opacity-55"
          />

          <button
            disabled
            data-testid="scribblex-join-btn"
            className="mt-4 w-full h-14 rounded-full bg-sx-coral text-sx-ink border-[2.5px] border-sx-ink font-shell font-extrabold text-lg shadow-sticker disabled:cursor-not-allowed disabled:opacity-55"
          >
            Join room
          </button>
        </div>

        <button
          onClick={() => navigate(routes.scribblex.home)}
          data-testid="scribblex-more-btn"
          className="mt-4 w-full h-12 rounded-full border-2 border-sx-ink/35 text-sx-ink font-shell font-bold hover:bg-sx-ink hover:text-sx-cream focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-coral transition-colors"
        >
          What is ScribbleX?
        </button>
      </div>
    </motion.section>
  );
}

/** A single hand-drawn mark — the ScribbleX side's one piece of decoration. */
function Scribble() {
  return (
    <svg
      viewBox="0 0 160 44"
      className="h-11 w-auto text-sx-coral"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 30c10-16 20-16 27-4s14 14 21 2 13-22 21-10 12 20 20 12 14-20 23-12 14 16 20 12"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
