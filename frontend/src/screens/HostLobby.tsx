"use client";

import React, { useEffect, useState } from "react";
import { readStored, useNavigate, usePin } from "../lib/navigation";
import { routes } from "../lib/routes";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, LinkSimple, Users, Play, ArrowLeft, WifiHigh, WifiSlash } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { errorMessage, startRoom } from "../lib/api";
import type { HostSession } from "../lib/types";

export default function HostLobby() {
  const pin = usePin();
  const navigate = useNavigate();
  const [session, setSession] = useState<HostSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [copied, setCopied] = useState<"pin" | "link" | null>(null);
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    const stored = readStored<HostSession>(`ts_host_${pin}`);
    if (!stored) {
      navigate(routes.trivia.hostCreate);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only values are read after mount
    setSession(stored);
    setJoinUrl(`${window.location.origin}/play/${pin}`);
  }, [pin, navigate]);

  const { connected, state } = useRoomSocket({
    pin,
    role: "host",
    token: session?.host_token,
    enabled: !!session,
  });

  useEffect(() => {
    // Navigate to game view once host has started the round
    if (state?.status && state.status !== "lobby") {
      navigate(routes.trivia.hostGame(pin));
    }
  }, [state?.status, navigate, pin]);

  const players = state?.players || [];

  const copy = async (what: "pin" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? joinUrl : pin);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  };

  const start = async () => {
    setStartError("");
    if (!session) return;
    if (players.length === 0) {
      setStartError("Wait for at least 1 player to join before starting");
      return;
    }
    setStarting(true);
    try {
      await startRoom(pin, session.host_token);
    } catch (e) {
      setStartError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stage relative overflow-hidden">
      <div className="grain absolute inset-0" />

      {/* Floating shapes */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-20 -left-10 h-40 w-40 rounded-full bg-orange-300/20 blur-xl animate-floaty" />
        <div className="absolute top-1/2 right-10 h-56 w-56 rounded-[3rem] bg-purple-500/20 blur-2xl animate-floaty [animation-delay:2s]" />
        <div className="absolute bottom-10 left-1/3 h-32 w-32 rounded-2xl bg-white/10 blur-xl animate-floaty [animation-delay:3.5s]" />
      </div>

      <div className="relative z-10">
        <header className="max-w-7xl mx-auto px-6 md:px-10 py-6 flex items-center justify-between">
          <Logo inverse />
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              aria-label={connected ? "Live" : "Reconnecting"}
              className={
                "rounded-full px-3 h-9 inline-flex items-center gap-2 text-xs font-black " +
                (connected ? "bg-green-500/20 text-green-200" : "bg-red-500/20 text-red-200")
              }
              data-testid="host-conn-status"
            >
              {connected ? <WifiHigh size={16} weight="bold" /> : <WifiSlash size={16} weight="bold" />}
              <span className="hidden min-[380px]:inline">{connected ? "LIVE" : "RECONNECTING…"}</span>
            </div>
            <button
              onClick={() => navigate("/")}
              aria-label="Exit"
              className="rounded-full border-2 border-white/20 text-white/90 hover:bg-white/10 font-bold px-3 sm:px-5 h-11 inline-flex items-center gap-2"
              data-testid="host-back-btn"
            >
              <ArrowLeft size={18} weight="bold" /> <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 md:px-10 pb-20">
          {/* PIN row */}
          <div className="mt-6 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7">
              <div className="text-orange-300 font-black uppercase tracking-widest text-sm">
                Invite link
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-white/80 text-xl sm:text-2xl font-bold break-all" data-testid="host-invite-link">
                  {joinUrl.replace(/^https?:\/\//, "")}
                </div>
                <button
                  onClick={() => copy("link")}
                  data-testid="host-copy-link-btn"
                  className="rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-5 h-11 inline-flex items-center gap-2"
                >
                  <LinkSimple size={18} weight="bold" /> {copied === "link" ? "Link copied!" : "Copy invite link"}
                </button>
              </div>

              <div className="mt-6 text-orange-300 font-black uppercase tracking-widest text-sm">
                Game PIN
              </div>
              <div className="flex items-end gap-6 flex-wrap">
                <div
                  data-testid="host-pin-display"
                  className="font-display text-white font-black leading-none tracking-[0.15em] text-[18vw] sm:text-[14vw] md:text-[10vw] drop-shadow-[0_10px_10px_rgba(0,0,0,0.4)]"
                >
                  {pin}
                </div>
                <button
                  onClick={() => copy("pin")}
                  data-testid="host-copy-pin-btn"
                  className="mb-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-bold px-5 h-12 inline-flex items-center gap-2 border border-white/20"
                >
                  <Copy size={18} weight="bold" /> {copied === "pin" ? "Copied!" : "Copy PIN"}
                </button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 card-lift">
                <div className="flex items-center gap-2 text-orange-300 font-black uppercase tracking-widest text-xs">
                  <Users size={16} weight="fill" /> Players in lobby
                </div>
                <div
                  className="mt-2 font-display text-white text-6xl font-black"
                  data-testid="host-player-count"
                >
                  {players.length}
                  <span className="text-white/50 text-3xl">/{state?.max_players || 50}</span>
                </div>
                <div className="text-white/70 font-semibold text-sm mt-1">
                  {state?.quiz_title ? `Theme: ${state.quiz_title} · ${state.question_count} questions` : ""}
                </div>

                <button
                  onClick={start}
                  disabled={starting || players.length === 0}
                  data-testid="host-start-btn"
                  className={
                    "btn-arcade mt-6 w-full h-16 rounded-full font-black text-xl inline-flex items-center justify-center gap-3 " +
                    (players.length === 0
                      ? "bg-white/20 text-white/50 cursor-not-allowed"
                      : "bg-orange-300 hover:bg-orange-400 text-indigo-950")
                  }
                >
                  <Play size={22} weight="fill" />
                  {starting ? "Starting…" : "Start Game"}
                </button>
                {startError && (
                  <div className="mt-3 text-orange-200 font-bold text-sm" data-testid="host-start-error">
                    {startError}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Players grid */}
          <div className="mt-14">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-white text-3xl sm:text-4xl font-black">
                Players joining live…
              </h2>
              <div className="text-white/60 font-bold text-sm">
                {players.length === 0 ? "Waiting for players" : "Real-time updates"}
              </div>
            </div>

            {players.length === 0 ? (
              <div className="mt-6 rounded-3xl border-2 border-dashed border-white/20 p-12 text-center text-white/70 font-bold">
                Share the invite link or PIN above. Players will pop in here as they join. 🎯
              </div>
            ) : (
              <ul
                className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                data-testid="host-player-grid"
              >
                <AnimatePresence>
                  {players.map((p) => (
                    <motion.li
                      key={p.id}
                      layout
                      initial={{ opacity: 0, scale: 0.6, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 px-4 py-3 flex items-center gap-3"
                      data-testid={`player-badge-${p.nickname}`}
                    >
                      <div className="h-9 w-9 rounded-xl bg-orange-300 text-indigo-950 font-black grid place-items-center">
                        {p.nickname.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-bold truncate">{p.nickname}</div>
                        <div className="text-white/60 text-xs font-semibold">
                          {p.is_host ? "you · host" : p.connected ? "connected" : "joined"}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
