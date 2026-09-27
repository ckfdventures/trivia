"use client";

import React, { useEffect, useState } from "react";
import { readStored, useNavigate, usePin } from "../lib/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Trophy, WifiHigh, WifiSlash, Fire, Crown } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { AnswerOption } from "../components/AnswerOption";
import { ReconnectingOverlay } from "../components/ReconnectingOverlay";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useServerCountdown } from "../hooks/useServerCountdown";
import { becomeHost, submitAnswer } from "../lib/game";
import { useVoice } from "../hooks/useVoice";
import { VoiceControls, VoicePrompt, VoiceRoster } from "../components/Voice";
import { errorMessage } from "../lib/api";
import type { LeaderboardEntry, PlayerResult, PlayerSession, RoomState } from "../lib/types";

export default function PlayerGame() {
  const pin = usePin();
  const navigate = useNavigate();
  const [session, setSession] = useState<PlayerSession | null>(null);
  // Answer choice and submit error are tagged with the question they belong to, so they reset per question.
  const [selectedForQid, setSelectedForQid] = useState<{ qid: string; index: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErrForQid, setSubmitErrForQid] = useState<{ qid: string; message: string } | null>(null);
  const [promotedNotice, setPromotedNotice] = useState(false);

  useEffect(() => {
    const stored = readStored<PlayerSession>(`ts_player_${pin}`);
    if (!stored) {
      navigate(`/play/${pin}`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setSession(stored);
  }, [pin, navigate]);

  const { connected, state, lastEvent } = useRoomSocket({
    pin,
    role: "player",
    token: session?.session_token,
    enabled: !!session,
  });

  useEffect(() => {
    if (state?.status === "lobby") navigate(`/play/${pin}/lobby`);
  }, [state?.status, pin, navigate]);

  // Host promotion: server pushes 'promoted_to_host' targeted to this player
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "promoted_to_host") {
      // The new host keeps playing from the host screen.
      becomeHost(pin, lastEvent.data as { host_token: string; host_id: string }, session, state?.quiz_title || "");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a socket event
      setPromotedNotice(true);
      setTimeout(() => navigate(`/host/game/${pin}`), 1400);
    }
  }, [lastEvent, pin, navigate, session, state?.quiz_title]);

  const { voice, snapshot: voiceSnapshot } = useVoice(pin, session);

  const q = state?.question;
  const rev = state?.review;
  const timeLimit = q?.time_limit || 20;
  const { remainingSec } = useServerCountdown({
    deadlineTs: q?.deadline_ts,
    serverNow: q?.server_now,
    timeLimitSeconds: timeLimit,
    active: state?.status === "question_active",
  });

  const mySelection = q && selectedForQid && selectedForQid.qid === q.id ? selectedForQid.index : null;
  const submitErr = q && submitErrForQid?.qid === q.id ? submitErrForQid.message : "";
  const myResult = (rev && session && rev.player_results?.[session.player_id]) || null;
  const myBoard = (session && state?.leaderboard?.find((r) => r.player_id === session.player_id)) || null;

  const submit = async (idx: number) => {
    if (!session || !q || submitting || mySelection !== null) return;
    setSubmitErrForQid(null);
    setSubmitting(true);
    setSelectedForQid({ qid: q.id, index: idx });
    try {
      await submitAnswer(pin, session.player_id, session.session_token, q.id, idx);
    } catch (e) {
      setSubmitErrForQid({ qid: q.id, message: errorMessage(e) });
      setSelectedForQid(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stage relative overflow-hidden">
      <div className="grain absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-16 -left-8 h-40 w-40 rounded-full bg-orange-300/20 blur-2xl animate-floaty" />
        <div className="absolute bottom-8 -right-8 h-56 w-56 rounded-[3rem] bg-purple-500/20 blur-2xl animate-floaty [animation-delay:2s]" />
      </div>

      <ReconnectingOverlay show={!!session && !connected && !promotedNotice} />

      <div className="relative z-10">
        <header className="max-w-lg mx-auto px-5 py-5 [@media(max-height:500px)]:py-2 flex items-center justify-between">
          <Logo inverse />
          <div className="flex items-center gap-2">
            <VoiceControls pin={pin} voice={voice} snapshot={voiceSnapshot} />
            <div
              className={
                "rounded-full px-3 h-9 inline-flex items-center gap-2 text-xs font-black " +
                (connected ? "bg-green-500/20 text-green-200" : "bg-red-500/20 text-red-200")
              }
              data-testid="player-conn-status"
            >
              {connected ? <WifiHigh size={16} weight="bold" /> : <WifiSlash size={16} weight="bold" />}
              {connected ? "LIVE" : "OFFLINE"}
            </div>
          </div>
        </header>

        <VoicePrompt pin={pin} voice={voice} snapshot={voiceSnapshot} />
        <VoiceRoster
          snapshot={voiceSnapshot}
          selfId={session?.player_id}
          players={state?.players ?? []}
          className="max-w-lg mx-auto px-5 mb-2 [@media(max-height:500px)]:hidden"
        />

        <main className="max-w-lg mx-auto px-5 pb-24">
          {/* Player identity strip (hidden mid-question on short landscape screens to keep every answer on screen) */}
          <div
            className={
              "flex items-center justify-between rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2 mt-2" +
              (state?.status === "question_active" ? " [@media(max-height:500px)]:hidden" : "")
            }
          >
            <div className="text-white font-black text-sm truncate">
              {session?.nickname}
            </div>
            <div
              className="text-orange-300 font-display font-black text-lg"
              data-testid="player-score"
            >
              {myBoard?.points ?? 0} pts
            </div>
          </div>

          {/* Question active */}
          {state?.status === "question_active" && q && (
            <div className="mt-6 [@media(max-height:500px)]:mt-2">
              <div className="text-center [@media(max-height:500px)]:flex [@media(max-height:500px)]:items-center [@media(max-height:500px)]:justify-between">
                <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
                  Question {q.index + 1} of {state.question_count}
                </div>
                <div
                  className="font-display text-white font-black text-5xl sm:text-6xl mt-1 sm:mt-2 [@media(max-height:500px)]:text-3xl [@media(max-height:500px)]:mt-0"
                  data-testid="player-timer"
                >
                  {remainingSec}
                </div>
              </div>

              <div className="mt-4 sm:mt-5 bg-white rounded-3xl p-5 card-lift [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:py-3">
                <h1
                  className="font-display text-indigo-950 text-xl sm:text-2xl font-black leading-tight [@media(max-height:500px)]:text-lg"
                  data-testid="player-question-text"
                >
                  {q.text}
                </h1>
              </div>

              {/* Short screens (phones in landscape): two columns, so every answer is reachable without scrolling. */}
              <div className="mt-4 grid grid-cols-1 gap-3 [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:grid-cols-2">
                {q.options.map((opt, i) => (
                  <AnswerOption
                    key={i}
                    index={i}
                    text={opt}
                    size="md"
                    onSelect={() => submit(i)}
                    disabled={submitting || mySelection !== null}
                    selection={mySelection === null ? "none" : mySelection === i ? "selected" : "dimmed"}
                    testId={`player-answer-${i}`}
                  />
                ))}
              </div>

              {mySelection !== null && (
                <div className="mt-5 text-center" data-testid="player-locked-in">
                  <div className="font-display text-white text-2xl font-black">Locked in!</div>
                  <div className="text-purple-200 font-bold mt-1">Waiting for other players…</div>
                </div>
              )}
              {submitErr && (
                <div
                  className="mt-4 text-center text-orange-200 font-bold text-sm"
                  data-testid="player-answer-error"
                >
                  {submitErr}
                </div>
              )}
            </div>
          )}

          {/* Review / Feedback */}
          {state?.status === "question_review" && rev && (
            <div className="mt-6">
              <FeedbackCard myResult={myResult} myBoard={myBoard} correctAnswer={rev.options[rev.correct_index] ?? ""} />
              <div className="mt-6">
                <MiniLeaderboard state={state} playerId={session?.player_id} />
              </div>
            </div>
          )}

          {state?.status === "game_over" && (
            <GameOverPlayer state={state} playerId={session?.player_id} pin={pin} />
          )}
        </main>
      </div>

      {promotedNotice && (
        <div
          className="fixed inset-0 z-50 bg-indigo-950/80 backdrop-blur-md flex items-center justify-center p-6"
          data-testid="promoted-modal"
        >
          <div className="max-w-sm w-full bg-white rounded-3xl p-8 text-center card-lift">
            <div className="mx-auto h-16 w-16 rounded-full bg-orange-100 grid place-items-center">
              <Crown size={28} weight="fill" className="text-orange-500" />
            </div>
            <h3 className="font-display font-black text-2xl text-indigo-950 mt-5">
              You&apos;re the host now!
            </h3>
            <p className="text-indigo-950/70 font-semibold text-sm mt-2">
              The previous host went offline. Taking you to the host controls…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface FeedbackCardProps {
  myResult: PlayerResult | null;
  myBoard: LeaderboardEntry | null;
  correctAnswer: string;
}

function FeedbackCard({ myResult, myBoard, correctAnswer }: FeedbackCardProps) {
  if (!myResult) {
    return (
      <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-8 text-center" data-testid="player-feedback-noanswer">
        <div className="font-display text-white font-black text-4xl">
          Time&apos;s up
        </div>
        <p className="text-purple-200 font-semibold mt-2">You didn&apos;t answer this one.</p>
        <p className="text-white font-bold mt-3" data-testid="player-correct-answer">
          Answer: {correctAnswer}
        </p>
      </div>
    );
  }
  const correct = myResult.correct;
  return (
    <div
      className={
        "rounded-3xl p-8 text-center " +
        (correct ? "bg-green-500 text-white" : "bg-red-500 text-white")
      }
      data-testid={correct ? "player-feedback-correct" : "player-feedback-incorrect"}
    >
      <motion.div
        initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 250, damping: 15 }}
        className="mx-auto h-20 w-20 rounded-full bg-white/25 grid place-items-center"
      >
        {correct ? <Check size={44} weight="bold" /> : <X size={44} weight="bold" />}
      </motion.div>
      <div className="font-display font-black text-4xl mt-4">
        {correct ? "Correct!" : "Incorrect"}
      </div>
      <div className="mt-2 font-bold opacity-90">
        {correct ? `+${myResult.points_earned} points` : "0 points"}
      </div>
      {!correct && (
        <div className="mt-2 font-bold" data-testid="player-correct-answer">
          Answer: {correctAnswer}
        </div>
      )}
      {myBoard && (
        <div className="mt-4 inline-flex items-center gap-3 rounded-full bg-white/15 px-4 py-2">
          <Trophy size={16} weight="fill" /> Rank #{myBoard.rank} · {myBoard.points} pts
          {myBoard.streak >= 2 && (
            <span className="inline-flex items-center gap-1 text-yellow-200">
              <Fire size={14} weight="fill" /> {myBoard.streak}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MiniLeaderboard({ state, playerId }: { state: RoomState | null; playerId: string | undefined }) {
  const board = (state?.leaderboard || []).slice(0, 5);
  return (
    <div className="rounded-3xl bg-white/10 backdrop-blur-xl border border-white/15 p-5" data-testid="player-mini-leaderboard">
      <div className="flex items-center gap-2 text-orange-300 uppercase tracking-widest text-xs font-black">
        <Trophy size={14} weight="fill" /> Top 5
      </div>
      <ul className="mt-3 space-y-2">
        <AnimatePresence>
          {board.map((row) => (
            <motion.li
              key={row.player_id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={
                "rounded-2xl px-3 py-2 flex items-center gap-3 " +
                (row.player_id === playerId ? "bg-orange-300 text-indigo-950" : "bg-white/10 text-white")
              }
            >
              <div className="font-display font-black text-lg w-6 text-center">{row.rank}</div>
              <div className="flex-1 font-bold truncate flex items-center gap-2">
                {row.nickname}
                {row.tie && (
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-black uppercase " + (row.player_id === playerId ? "bg-indigo-950 text-orange-300" : "bg-white/20 text-white")}>
                    Tie
                  </span>
                )}
              </div>
              <div className="font-display font-black">{row.points}</div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {board.length === 0 && <div className="text-white/50 text-sm mt-2">Waiting…</div>}
    </div>
  );
}

function GameOverPlayer({ state, playerId, pin }: { state: RoomState; playerId: string | undefined; pin: string }) {
  const navigate = useNavigate();
  const board = state.leaderboard || [];
  const me = board.find((r) => r.player_id === playerId);
  return (
    <div className="mt-8" data-testid="player-game-over">
      <div className="text-center">
        <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
          Final results
        </div>
        <h1 className="font-display text-white text-5xl font-black mt-3 leading-none">
          Game Over
        </h1>
      </div>
      {me && (
        <div className="mt-8 rounded-3xl bg-orange-300 text-indigo-950 p-6 text-center">
          <div className="text-xs font-black uppercase tracking-widest">Your finish</div>
          <div className="font-display font-black text-6xl mt-2">#{me.rank}</div>
          <div className="mt-1 font-bold">{me.points} pts</div>
        </div>
      )}
      <div className="mt-8">
        <MiniLeaderboard state={state} playerId={playerId} />
      </div>
      <button
        onClick={() => {
          localStorage.removeItem(`ts_player_${pin}`);
          navigate("/");
        }}
        className="btn-arcade mt-8 w-full h-14 rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-lg"
        data-testid="player-home-btn"
      >
        Back to home
      </button>
    </div>
  );
}
