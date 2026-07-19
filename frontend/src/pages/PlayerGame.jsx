import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Trophy, WifiHigh, WifiSlash, Fire, Crown } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { AnswerShape, ANSWER_META } from "../components/AnswerShape";
import { ReconnectingOverlay } from "../components/ReconnectingOverlay";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useServerCountdown } from "../hooks/useServerCountdown";
import { submitAnswer } from "../lib/game";

export default function PlayerGame() {
  const { pin } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [selectedForQid, setSelectedForQid] = useState(null); // {qid, index}
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [promotedNotice, setPromotedNotice] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(`ts_player_${pin}`);
    if (!raw) {
      navigate(`/play/${pin}`);
      return;
    }
    setSession(JSON.parse(raw));
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
      const d = lastEvent.data || {};
      const hostSession = {
        pin: d.pin,
        host_token: d.host_token,
        host_id: d.host_id,
        quiz_title: state?.quiz_title || "",
      };
      localStorage.setItem(`ts_host_${pin}`, JSON.stringify(hostSession));
      localStorage.removeItem(`ts_player_${pin}`);
      setPromotedNotice(true);
      setTimeout(() => navigate(`/host/game/${pin}`), 1400);
    }
  }, [lastEvent, pin, navigate, state?.quiz_title]);

  const q = state?.question;
  const rev = state?.review;
  const timeLimit = q?.time_limit || 20;
  const { remainingSec } = useServerCountdown({
    deadlineTs: q?.deadline_ts,
    serverNow: q?.server_now,
    timeLimitSeconds: timeLimit,
    active: state?.status === "question_active",
  });

  // Reset selection whenever a new question begins
  useEffect(() => {
    if (state?.status === "question_active" && q?.id && selectedForQid?.qid !== q.id) {
      setSelectedForQid(null);
      setSubmitErr("");
    }
  }, [state?.status, q?.id, selectedForQid?.qid]);

  const mySelection = q && selectedForQid && selectedForQid.qid === q.id ? selectedForQid.index : null;
  const myResult = useMemo(() => {
    if (!rev || !session) return null;
    const pr = rev.player_results?.[session.player_id];
    return pr || null;
  }, [rev, session]);

  const myBoard = useMemo(() => {
    if (!session || !state?.leaderboard) return null;
    return state.leaderboard.find((r) => r.player_id === session.player_id) || null;
  }, [session, state?.leaderboard]);

  const submit = async (idx) => {
    if (!session || !q || submitting || mySelection !== null) return;
    setSubmitErr("");
    setSubmitting(true);
    setSelectedForQid({ qid: q.id, index: idx });
    try {
      await submitAnswer(pin, session.player_id, session.session_token, q.id, idx);
    } catch (e) {
      setSubmitErr(e?.response?.data?.detail || "Could not submit answer");
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

      <ReconnectingOverlay show={session && !connected && !promotedNotice} />

      <div className="relative z-10">
        <header className="max-w-lg mx-auto px-5 py-5 flex items-center justify-between">
          <Logo inverse />
          <div className="flex items-center gap-2">
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

        <main className="max-w-lg mx-auto px-5 pb-24">
          {/* Player identity strip */}
          <div className="flex items-center justify-between rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2 mt-2">
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
            <div className="mt-6">
              <div className="text-center">
                <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
                  Question {q.index + 1} of {state.question_count}
                </div>
                <div
                  className="font-display text-white font-black text-6xl mt-2"
                  data-testid="player-timer"
                >
                  {remainingSec}
                </div>
              </div>

              {mySelection === null ? (
                <>
                  <div className="mt-8 grid grid-cols-2 gap-3">
                    {q.options.map((_, i) => {
                      const meta = ANSWER_META[i];
                      return (
                        <button
                          key={i}
                          onClick={() => submit(i)}
                          disabled={submitting || mySelection !== null}
                          data-testid={`player-answer-${i}`}
                          className={`aspect-square rounded-3xl ${meta.bg} text-white grid place-items-center card-lift active:translate-y-1 transition-transform`}
                        >
                          <AnswerShape index={i} size={72} />
                        </button>
                      );
                    })}
                  </div>
                  {submitErr && (
                    <div
                      className="mt-4 text-center text-orange-200 font-bold text-sm"
                      data-testid="player-answer-error"
                    >
                      {submitErr}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-16 text-center" data-testid="player-locked-in">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className={`mx-auto h-28 w-28 rounded-3xl grid place-items-center ${ANSWER_META[mySelection].bg}`}
                  >
                    <AnswerShape index={mySelection} size={60} />
                  </motion.div>
                  <div className="font-display text-white text-4xl font-black mt-6">
                    Locked in!
                  </div>
                  <div className="text-purple-200 font-bold mt-2">
                    Waiting for other players…
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Review / Feedback */}
          {state?.status === "question_review" && rev && (
            <div className="mt-6">
              <FeedbackCard rev={rev} myResult={myResult} myBoard={myBoard} />
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
              You're the host now!
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

function FeedbackCard({ rev, myResult, myBoard }) {
  if (!myResult) {
    return (
      <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-8 text-center" data-testid="player-feedback-noanswer">
        <div className="font-display text-white font-black text-4xl">
          Time's up
        </div>
        <p className="text-purple-200 font-semibold mt-2">You didn't answer this one.</p>
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

function MiniLeaderboard({ state, playerId }) {
  const board = (state?.leaderboard || []).slice(0, 5);
  return (
    <div className="rounded-3xl bg-white/10 backdrop-blur-xl border border-white/15 p-5" data-testid="player-mini-leaderboard">
      <div className="flex items-center gap-2 text-orange-300 uppercase tracking-widest text-xs font-black">
        <Trophy size={14} weight="fill" /> Top 5
      </div>
      <ul className="mt-3 space-y-2">
        <AnimatePresence>
          {board.map((row, i) => (
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

function GameOverPlayer({ state, playerId, pin }) {
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
