"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LockSimple } from "@phosphor-icons/react";
import { AnswerShape } from "../components/AnswerShape";
import { GAMES, PLATFORM_NAME } from "../lib/brand";
import { useNavigate } from "../lib/navigation";
import { routes } from "../lib/routes";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "../lib/scribblex/constants";

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
      <ShellFoot />
    </div>
  );
}

/**
 * The platform mark: one tile split corner to corner, trivia's violet giving way to
 * ScribbleX's coral. Two worlds in a single object — the same idea as the seam below it.
 */
function PlatformMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-10 w-10 shrink-0"
      role="img"
      aria-label={`${PLATFORM_NAME} logo`}
    >
      <defs>
        <clipPath id="shell-mark-clip">
          <rect width="32" height="32" rx="10" />
        </clipPath>
      </defs>
      <g clipPath="url(#shell-mark-clip)">
        <rect width="32" height="32" fill="#2E1065" />
        <path d="M32 0 L32 32 L0 32 Z" fill="#FF7A59" />
      </g>
      <rect x="0.9" y="0.9" width="30.2" height="30.2" rx="9.1" fill="none" stroke="#F5F3EF" strokeOpacity="0.22" strokeWidth="1.8" />
    </svg>
  );
}

function ShellBar() {
  return (
    <header className="bg-shell-ink text-shell-bone border-b border-white/10">
      <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 h-[76px] flex items-center justify-between gap-8">
        <Link
          href={routes.home}
          data-testid="shell-home"
          className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-bone"
        >
          <PlatformMark />
          <span className="font-shell text-2xl sm:text-[26px] font-extrabold tracking-[-0.025em] leading-none">
            {PLATFORM_NAME}
          </span>
        </Link>

        <p className="hidden md:block font-shell text-sm font-medium text-shell-dim text-right max-w-[38ch] leading-snug">
          Share a link and play on any phone. No app, no signup.
        </p>
      </div>
    </header>
  );
}

function ShellFoot() {
  return (
    <footer className="bg-shell-ink text-shell-dim border-t border-white/10">
      <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 min-h-14 py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="font-shell text-[13px] font-medium">
          © {new Date().getFullYear()} {PLATFORM_NAME}
        </span>
        <Link
          href={routes.admin.login}
          data-testid="shell-admin-login"
          className="font-shell text-[13px] font-bold inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 h-9 hover:text-shell-bone hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-bone transition-colors"
        >
          <LockSimple size={13} weight="bold" />
          Admin
        </Link>
      </div>
    </footer>
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
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const toProfile = (intent: "create" | "join" | "quick", roomCode?: string) => {
    const query = new URLSearchParams({ intent });
    if (roomCode) query.set("code", roomCode);
    navigate(`${routes.scribblex.profile}?${query.toString()}`);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeRoomCode(code);
    if (!clean) {
      setError(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`);
      return;
    }
    toProfile("join", clean);
  };

  return (
    <motion.section
      {...gateMotion(24)}
      data-testid="gate-scribblex"
      className="sx-dots text-sx-ink relative overflow-hidden px-6 sm:px-10 lg:px-14 py-14 lg:py-20 flex flex-col justify-center"
    >
      <div className="relative z-10 w-full max-w-md mx-auto lg:mx-0 lg:mr-auto lg:ml-14">
        <Scribble />

        <h1 className="font-shell text-[13vw] sm:text-[64px] lg:text-[72px] leading-[0.92] font-extrabold tracking-[-0.03em] mt-7">
          {GAMES.scribblex.name}
        </h1>
        <p className="font-shell text-lg font-medium text-sx-on-surface-variant mt-3 max-w-xs">
          {GAMES.scribblex.tagline}
        </p>

        <form onSubmit={submit} className="mt-9">
          <label
            htmlFor="sx-code"
            className="font-shell text-sm font-bold text-sx-on-surface-variant block mb-2"
          >
            Room code
          </label>
          <input
            id="sx-code"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={ROOM_CODE_LENGTH + 1}
            value={code}
            onChange={(e) => {
              setError("");
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
            }}
            placeholder="ABC-234"
            data-testid="scribblex-code-input"
            aria-describedby={error ? "sx-code-error" : undefined}
            className="w-full h-16 rounded-2xl bg-white border-[2.5px] border-sx-ink text-sx-ink font-shell font-extrabold text-3xl text-center tracking-[0.2em] indent-[0.2em] placeholder:text-sx-ink/20 focus:outline-none focus:shadow-[0_4px_0_#FF7A59]"
          />
          {error && (
            <p
              id="sx-code-error"
              data-testid="scribblex-code-error"
              className="font-shell text-sm font-bold text-sx-primary mt-2"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            data-testid="scribblex-join-btn"
            className="press mt-4 w-full h-14 rounded-full bg-sx-coral text-sx-ink border-[2.5px] border-sx-ink font-shell font-extrabold text-lg shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-ink"
          >
            Join room
          </button>
        </form>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => toProfile("quick")}
            data-testid="scribblex-quick-btn"
            className="h-12 rounded-full border-2 border-sx-ink text-sx-ink font-shell font-bold bg-sx-butter hover:bg-sx-secondary-fixed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-coral transition-colors"
          >
            Quick play
          </button>
          <button
            onClick={() => toProfile("create")}
            data-testid="scribblex-create-btn"
            className="h-12 rounded-full border-2 border-sx-ink/35 text-sx-ink font-shell font-bold hover:bg-sx-ink hover:text-sx-cream focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-coral transition-colors"
          >
            Make a room
          </button>
        </div>

        <button
          onClick={() => navigate(routes.scribblex.browse)}
          data-testid="scribblex-browse-btn"
          className="mt-4 w-full h-12 rounded-full border-2 border-sx-ink/35 text-sx-ink font-shell font-bold hover:bg-sx-ink hover:text-sx-cream focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-coral transition-colors"
        >
          Browse live rooms
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
