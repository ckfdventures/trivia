import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  SkipForward,
  Stop,
  Trophy,
  ArrowRight,
  WifiHigh,
  WifiSlash,
  Check,
  X,
} from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { AnswerShape, ANSWER_META } from "../components/AnswerShape";
import { ReconnectingOverlay } from "../components/ReconnectingOverlay";
import { ConfirmModal } from "../components/ConfirmModal";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useServerCountdown } from "../hooks/useServerCountdown";
import { hostNext, hostSkip, hostEnd } from "../lib/game";

export default function HostGame() {
  const { pin } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [endOpen, setEndOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(`ts_host_${pin}`);
    if (!raw) {
      navigate("/host/create");
      return;
    }
    setSession(JSON.parse(raw));
  }, [pin, navigate]);

  const { connected, state } = useRoomSocket({
    pin,
    role: "host",
    token: session?.host_token,
    enabled: !!session,
  });

  useEffect(() => {
    if (state?.status === "lobby") {
      navigate(`/host/lobby/${pin}`);
    }
  }, [state?.status, navigate, pin]);

  // Reset leaderboard toggle on new question
  useEffect(() => {
    if (state?.status === "question_active") setShowLeaderboard(false);
  }, [state?.status, state?.current_index]);

  const runHost = async (fn) => {
    if (!session) return;
    setBusy(true);
    try {
      await fn(pin, session.host_token);
    } catch (e) {
      // no-op
    } finally {
      setBusy(false);
    }
  };

  const onNext = () => runHost(hostNext);
  const onSkip = () => runHost(hostSkip);
  const onEnd = async () => {
    setEndOpen(false);
    await runHost(hostEnd);
  };

  const q = state?.question;
  const rev = state?.review;
  const timeLimit = q?.time_limit || rev?.time_limit || 20;
  const { remainingSec, remainingPct } = useServerCountdown({
    deadlineTs: q?.deadline_ts,
    serverNow: q?.server_now,
    timeLimitSeconds: timeLimit,
    active: state?.status === "question_active",
  });

  const totalQ = state?.question_count || 0;
  const currentIdx = state?.current_index ?? -1;
  const questionNum = Math.max(1, currentIdx + 1);

  return (
    <div className="min-h-screen bg-stage relative overflow-hidden">
      <div className="grain absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 -left-10 h-64 w-64 rounded-full bg-orange-300/10 blur-3xl animate-floaty" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-[4rem] bg-purple-500/15 blur-3xl animate-floaty [animation-delay:2s]" />
      </div>

      <ReconnectingOverlay show={session && !connected} />

      <div className="relative z-10">
        <header className="max-w-7xl mx-auto px-6 md:px-10 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo inverse />
            <div className="hidden sm:block text-white/60 font-bold text-sm">
              PIN <span className="text-white font-black tracking-widest">{pin}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={
                "rounded-full px-3 h-9 inline-flex items-center gap-2 text-xs font-black " +
                (connected ? "bg-green-500/20 text-green-200" : "bg-red-500/20 text-red-200")
              }
              data-testid="host-conn-status"
            >
              {connected ? <WifiHigh size={16} weight="bold" /> : <WifiSlash size={16} weight="bold" />}
              {connected ? "LIVE" : "OFFLINE"}
            </div>
            <button
              onClick={() => setEndOpen(true)}
              data-testid="host-end-btn"
              className="rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-200 font-bold px-4 h-10 inline-flex items-center gap-2 border border-red-400/30"
            >
              <Stop size={16} weight="fill" /> End
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 md:px-10 pb-24">
          {/* Question header */}
          {(state?.status === "question_active" || state?.status === "question_review") && (
            <div className="flex items-center justify-between text-white/80 mt-6">
              <div className="text-sm font-black uppercase tracking-widest text-orange-300">
                Question {questionNum} <span className="text-white/40">of {totalQ}</span>
              </div>
              {state?.status === "question_active" && (
                <div className="font-display text-white font-black text-3xl sm:text-4xl" data-testid="host-timer">
                  {remainingSec}s
                </div>
              )}
              {state?.status === "question_active" && (
                <div className="text-sm font-bold" data-testid="host-answers-received">
                  <span className="font-black text-white text-lg">
                    {q?.answers_received ?? 0}
                  </span>
                  <span className="text-white/50"> / {q?.total_players ?? 0} answered</span>
                </div>
              )}
            </div>
          )}

          {/* Question card */}
          {state?.status === "question_active" && q && (
            <div className="mt-6">
              <div className="bg-white rounded-3xl p-8 sm:p-10 card-lift">
                <h1 className="font-display text-indigo-950 text-3xl sm:text-5xl font-black leading-tight" data-testid="host-question-text">
                  {q.text}
                </h1>
              </div>

              {/* Timer bar */}
              <div className="mt-4 h-3 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full bg-orange-300"
                  animate={{ width: `${Math.round(remainingPct * 100)}%` }}
                  transition={{ duration: 0.1, ease: "linear" }}
                />
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {q.options.map((opt, i) => {
                  const meta = ANSWER_META[i];
                  return (
                    <div
                      key={i}
                      className={`rounded-3xl px-6 py-6 ${meta.bg} text-white flex items-center gap-4 card-lift`}
                      data-testid={`host-option-${i}`}
                    >
                      <div className="h-14 w-14 rounded-2xl bg-white/25 grid place-items-center shrink-0">
                        <AnswerShape index={i} size={30} />
                      </div>
                      <div className="font-display font-black text-2xl sm:text-3xl leading-tight break-words">
                        {opt}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex flex-wrap gap-3 justify-center">
                <button
                  onClick={onSkip}
                  disabled={busy}
                  data-testid="host-skip-btn"
                  className="rounded-full bg-white/10 hover:bg-white/20 text-white font-bold px-6 h-12 inline-flex items-center gap-2 border border-white/20"
                >
                  <SkipForward size={18} weight="fill" /> Skip
                </button>
              </div>
            </div>
          )}

          {/* Review */}
          {state?.status === "question_review" && rev && (
            <div className="mt-6">
              {!showLeaderboard ? (
                <>
                  <div className="bg-white rounded-3xl p-8 card-lift">
                    <div className="text-xs uppercase tracking-widest font-black text-orange-500">
                      Time's up · answers
                    </div>
                    <h1
                      className="font-display text-indigo-950 text-3xl sm:text-4xl font-black mt-2"
                      data-testid="host-question-text"
                    >
                      {rev.text}
                    </h1>
                  </div>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {rev.options.map((opt, i) => {
                      const meta = ANSWER_META[i];
                      const isCorrect = i === rev.correct_index;
                      const count = rev.distribution[i] || 0;
                      const total = rev.answers_received || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div
                          key={i}
                          className={
                            "relative rounded-3xl p-5 " +
                            (isCorrect ? meta.bg + " text-white" : "bg-white/10 text-white/80")
                          }
                          data-testid={`host-review-option-${i}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-12 w-12 rounded-xl grid place-items-center ${isCorrect ? "bg-white/25" : "bg-white/10"}`}>
                              <AnswerShape index={i} size={24} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-display font-black text-xl truncate">{opt}</div>
                              <div className="text-xs font-bold opacity-80">
                                {count} vote{count === 1 ? "" : "s"} · {pct}%
                              </div>
                            </div>
                            {isCorrect && (
                              <div className="h-10 w-10 rounded-full bg-white grid place-items-center text-green-600">
                                <Check size={20} weight="bold" />
                              </div>
                            )}
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-black/20 overflow-hidden">
                            <div
                              className={"h-full " + (isCorrect ? "bg-white" : "bg-white/40")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-8 flex flex-wrap gap-3 justify-center">
                    <button
                      onClick={() => setShowLeaderboard(true)}
                      data-testid="host-show-leaderboard-btn"
                      className="rounded-full bg-white/10 hover:bg-white/20 text-white font-bold px-6 h-12 inline-flex items-center gap-2 border border-white/20"
                    >
                      <Trophy size={18} weight="fill" /> Show leaderboard
                    </button>
                    <button
                      onClick={onNext}
                      disabled={busy}
                      data-testid="host-next-btn"
                      className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-8 h-14 inline-flex items-center gap-2 text-lg"
                    >
                      {rev.is_last ? "Finish game" : "Next question"} <ArrowRight size={20} weight="bold" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Leaderboard state={state} />
                  <div className="mt-8 flex flex-wrap gap-3 justify-center">
                    <button
                      onClick={() => setShowLeaderboard(false)}
                      className="rounded-full bg-white/10 hover:bg-white/20 text-white font-bold px-6 h-12"
                    >
                      Back to reveal
                    </button>
                    <button
                      onClick={onNext}
                      disabled={busy}
                      data-testid="host-next-btn"
                      className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-8 h-14 inline-flex items-center gap-2 text-lg"
                    >
                      {rev.is_last ? "Finish game" : "Next question"} <ArrowRight size={20} weight="bold" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {state?.status === "game_over" && (
            <GameOverHost state={state} pin={pin} />
          )}
        </main>
      </div>

      <ConfirmModal
        open={endOpen}
        title="End game early?"
        body="Players will be shown the final leaderboard. This can't be undone."
        confirmLabel="End game"
        cancelLabel="Keep playing"
        onConfirm={onEnd}
        onCancel={() => setEndOpen(false)}
        testId="host-end-modal"
      />
    </div>
  );
}

function Leaderboard({ state }) {
  const board = (state?.leaderboard || []).slice(0, 5);
  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 card-lift" data-testid="host-leaderboard">
      <div className="flex items-center gap-2 text-orange-500 uppercase tracking-widest text-xs font-black">
        <Trophy size={16} weight="fill" /> Live leaderboard · Top 5
      </div>
      <ul className="mt-4 space-y-2">
        <AnimatePresence>
          {board.map((row, i) => (
            <motion.li
              key={row.player_id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={
                "rounded-2xl px-4 py-3 flex items-center gap-4 " +
                (i === 0 ? "bg-orange-100" : "bg-indigo-50")
              }
              data-testid={`leaderboard-row-${i}`}
            >
              <div
                className={
                  "h-10 w-10 rounded-xl grid place-items-center font-display font-black " +
                  (i === 0
                    ? "bg-orange-300 text-indigo-950"
                    : i === 1
                    ? "bg-indigo-200 text-indigo-950"
                    : i === 2
                    ? "bg-amber-200 text-amber-900"
                    : "bg-indigo-100 text-indigo-950")
                }
              >
                {row.rank}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="font-display font-black text-indigo-950 text-xl truncate">
                  {row.nickname}
                </div>
                {row.tie && (
                  <span className="rounded-full bg-purple-200 text-purple-900 text-[10px] font-black px-2 py-0.5 uppercase">
                    Tie
                  </span>
                )}
                {row.streak >= 2 && (
                  <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 uppercase">
                    🔥 {row.streak}
                  </span>
                )}
              </div>
              <div className="font-display font-black text-indigo-950 text-xl">
                {row.points}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {board.length === 0 && (
        <div className="mt-4 text-indigo-950/60 font-semibold text-sm">
          No answers yet.
        </div>
      )}
    </div>
  );
}

function GameOverHost({ state, pin }) {
  const navigate = useNavigate();
  const board = state.leaderboard || [];
  const top3 = board.slice(0, 3);
  return (
    <div className="mt-8" data-testid="host-game-over">
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest font-black text-orange-300">
          Final results
        </div>
        <h1 className="font-display text-white text-5xl sm:text-6xl font-black mt-3 leading-none">
          Game Over 🏆
        </h1>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-4 max-w-2xl mx-auto items-end">
        {[1, 0, 2].map((idx) => {
          const row = top3[idx];
          if (!row) return <div key={idx} />;
          const heights = { 0: "h-40", 1: "h-28", 2: "h-24" };
          const colors = {
            0: "bg-orange-300 text-indigo-950",
            1: "bg-white text-indigo-950",
            2: "bg-amber-200 text-amber-900",
          };
          return (
            <div key={idx} className="flex flex-col items-center gap-2">
              <div className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 px-3 py-2 text-center">
                <div className="text-white font-black text-lg truncate max-w-[8rem]">{row.nickname}</div>
                <div className="text-orange-300 font-black text-2xl">{row.points}</div>
              </div>
              <div className={`w-full rounded-t-2xl ${heights[idx]} ${colors[idx]} grid place-items-center font-display font-black text-4xl`}>
                {idx + 1}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 max-w-2xl mx-auto">
        <Leaderboard state={state} />
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <button
          onClick={() => {
            localStorage.removeItem(`ts_host_${pin}`);
            navigate("/host/create");
          }}
          data-testid="host-new-game-btn"
          className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-8 h-14"
        >
          New game
        </button>
        <button
          onClick={() => navigate("/")}
          className="rounded-full border-2 border-white/30 text-white font-bold px-6 h-14"
        >
          Home
        </button>
      </div>
    </div>
  );
}
