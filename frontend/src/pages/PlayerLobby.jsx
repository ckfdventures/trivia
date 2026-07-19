import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { WifiHigh, WifiSlash, Confetti } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { useRoomSocket } from "../hooks/useRoomSocket";

export default function PlayerLobby() {
  const { pin } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem(`ts_player_${pin}`);
    if (!raw) {
      navigate(`/play/${pin}`);
      return;
    }
    setSession(JSON.parse(raw));
  }, [pin, navigate]);

  const { connected, state } = useRoomSocket({
    pin,
    role: "player",
    token: session?.session_token,
    enabled: !!session,
  });

  useEffect(() => {
    if (state?.status && state.status !== "lobby") {
      navigate(`/play/${pin}/game`);
    }
  }, [state?.status, navigate, pin]);

  const players = state?.players || [];

  return (
    <div className="min-h-screen bg-stage relative overflow-hidden">
      <div className="grain absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-16 -left-8 h-40 w-40 rounded-full bg-orange-300/25 blur-2xl animate-floaty" />
        <div className="absolute bottom-16 -right-8 h-56 w-56 rounded-[3rem] bg-purple-500/25 blur-2xl animate-floaty [animation-delay:2s]" />
      </div>

      <div className="relative z-10">
        <header className="max-w-lg mx-auto px-6 py-6 flex items-center justify-between">
          <Logo inverse />
          <div
            className={
              "rounded-full px-3 h-9 inline-flex items-center gap-2 text-xs font-black " +
              (connected ? "bg-green-500/20 text-green-200" : "bg-red-500/20 text-red-200")
            }
            data-testid="player-conn-status"
          >
            {connected ? <WifiHigh size={16} weight="bold" /> : <WifiSlash size={16} weight="bold" />}
            {connected ? "LIVE" : "RECONNECTING…"}
          </div>
        </header>

        <main className="max-w-lg mx-auto px-6 pt-8 pb-24 text-center">
          <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
            You're in! PIN {pin}
          </div>

          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            className="mt-10 mx-auto h-40 w-40 rounded-full bg-orange-300 grid place-items-center animate-breathe shadow-[0_20px_60px_rgba(251,191,119,0.4)]"
          >
            <Confetti size={72} weight="fill" className="text-indigo-950" />
          </motion.div>

          <h1
            className="font-display text-white text-5xl sm:text-6xl font-black mt-10 leading-none"
            data-testid="player-nickname-header"
          >
            {session?.nickname || "Ready"}
          </h1>
          <p className="text-purple-200 font-bold mt-5 text-lg">
            Sit tight — waiting for your host to start the game.
          </p>

          <div className="mt-10 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/15 p-6">
            <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
              Players in the room
            </div>
            <div
              className="font-display text-white text-5xl font-black mt-2"
              data-testid="player-lobby-count"
            >
              {players.length}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {players.slice(0, 12).map((p) => (
                <span
                  key={p.id}
                  className={
                    "rounded-full px-3 py-1.5 text-sm font-bold border " +
                    (p.nickname === session?.nickname
                      ? "bg-orange-300 text-indigo-950 border-orange-300"
                      : "bg-white/10 text-white border-white/20")
                  }
                >
                  {p.nickname}
                </span>
              ))}
              {players.length > 12 && (
                <span className="rounded-full px-3 py-1.5 text-sm font-bold bg-white/10 text-white/80 border border-white/20">
                  +{players.length - 12} more
                </span>
              )}
            </div>
          </div>

          {state?.status === "in_progress" && (
            <div
              className="mt-10 rounded-3xl bg-orange-300 text-indigo-950 p-5 font-black text-lg"
              data-testid="player-game-started-banner"
            >
              Game started! Live gameplay ships in Sprint 2.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
