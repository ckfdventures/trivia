import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { joinRoom, getRoom } from "../lib/api";
import { AnswerShape } from "../components/AnswerShape";

export default function PlayerJoin() {
  const { pin: urlPin } = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState(urlPin || "");
  const [nickname, setNickname] = useState("");
  const [step, setStep] = useState(urlPin ? "nickname" : "pin");
  const [pinError, setPinError] = useState("");
  const [nickError, setNickError] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocker, setBlocker] = useState(null); // "room_full" | "already_started" | "not_found"

  useEffect(() => {
    // If we arrived with a PIN, pre-validate room existence & status
    const validate = async () => {
      if (!urlPin) return;
      try {
        const room = await getRoom(urlPin);
        if (room.status !== "lobby") {
          setBlocker("already_started");
          return;
        }
        if (room.players.length >= room.max_players) {
          setBlocker("room_full");
        }
      } catch (e) {
        if (e?.response?.status === 404) setBlocker("not_found");
      }
    };
    validate();
  }, [urlPin]);

  const submitPin = (e) => {
    e.preventDefault();
    const clean = pin.replace(/\D/g, "");
    if (clean.length !== 6) {
      setPinError("Enter the 6-digit Game PIN");
      return;
    }
    setPin(clean);
    setStep("nickname");
    navigate(`/play/${clean}`, { replace: true });
  };

  const submitNickname = async (e) => {
    e.preventDefault();
    setNickError("");
    const trimmed = nickname.trim();
    if (!trimmed) {
      setNickError("Please pick a nickname");
      return;
    }
    if (trimmed.length > 20) {
      setNickError("20 characters max");
      return;
    }
    setBusy(true);
    try {
      const result = await joinRoom(pin, trimmed);
      const playerSession = {
        pin: result.pin,
        player_id: result.player_id,
        session_token: result.session_token,
        nickname: result.nickname,
      };
      localStorage.setItem(`ts_player_${pin}`, JSON.stringify(playerSession));
      navigate(`/play/${pin}/lobby`);
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || "Something went wrong";
      if (status === 404) setBlocker("not_found");
      else if (detail === "Room Full") setBlocker("room_full");
      else if (detail === "Game Already Started") setBlocker("already_started");
      else setNickError(detail);
    } finally {
      setBusy(false);
    }
  };

  if (blocker) return <BlockerScreen kind={blocker} pin={pin} />;

  return (
    <div className="min-h-screen bg-stage relative overflow-hidden">
      <div className="grain absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-16 -left-8 h-32 w-32 rounded-full bg-orange-300/20 blur-2xl animate-floaty" />
        <div className="absolute bottom-16 -right-8 h-40 w-40 rounded-3xl bg-purple-400/25 blur-2xl animate-floaty [animation-delay:2s]" />
      </div>

      <div className="relative z-10">
        <header className="max-w-lg mx-auto px-6 py-6 flex items-center justify-between">
          <Logo inverse />
          <button
            onClick={() => navigate("/")}
            data-testid="player-back-btn"
            className="rounded-full bg-white/10 hover:bg-white/20 text-white font-bold px-4 h-10 inline-flex items-center gap-2 border border-white/20"
          >
            <ArrowLeft size={16} weight="bold" /> Home
          </button>
        </header>

        <main className="max-w-lg mx-auto px-6 pt-6 pb-24">
          {step === "pin" && (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={submitPin}
              className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-[2rem] p-8"
            >
              <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
                Step 1 of 2
              </div>
              <h1 className="font-display text-white text-5xl font-black mt-3 leading-none">
                Enter Game PIN
              </h1>
              <p className="text-purple-200 font-semibold mt-3">
                Ask your host for the 6-digit code.
              </p>

              <input
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPinError("");
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                }}
                placeholder="123456"
                data-testid="player-pin-input"
                className="mt-8 w-full h-20 rounded-2xl bg-white text-indigo-950 font-display font-black text-4xl text-center tracking-[0.4em] focus:ring-4 focus:ring-orange-300 focus:outline-none placeholder:text-indigo-200"
              />
              {pinError && (
                <div className="mt-3 text-orange-200 font-bold text-sm" data-testid="player-pin-error">
                  {pinError}
                </div>
              )}

              <button
                type="submit"
                data-testid="player-pin-submit"
                className="btn-arcade mt-6 w-full h-16 rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-xl inline-flex items-center justify-center gap-3"
              >
                Next <ArrowRight size={22} weight="bold" />
              </button>
            </motion.form>
          )}

          {step === "nickname" && (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={submitNickname}
              className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-[2rem] p-8"
            >
              <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
                Step 2 of 2 · PIN {pin}
              </div>
              <h1 className="font-display text-white text-5xl font-black mt-3 leading-none">
                Choose a<br />nickname
              </h1>
              <p className="text-purple-200 font-semibold mt-3">
                Keep it friendly. Others will see this on the leaderboard.
              </p>

              <input
                autoFocus
                maxLength={20}
                value={nickname}
                onChange={(e) => {
                  setNickError("");
                  setNickname(e.target.value);
                }}
                placeholder="Your name"
                data-testid="player-nickname-input"
                className="mt-8 w-full h-20 rounded-2xl bg-white text-indigo-950 font-display font-black text-3xl text-center focus:ring-4 focus:ring-orange-300 focus:outline-none placeholder:text-indigo-200/60"
              />
              {nickError && (
                <div className="mt-3 text-orange-200 font-bold text-sm" data-testid="player-nickname-error">
                  {nickError}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                data-testid="player-join-submit"
                className="btn-arcade mt-6 w-full h-16 rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-xl inline-flex items-center justify-center gap-3 disabled:opacity-70"
              >
                {busy ? "Joining…" : "Enter room"} <ArrowRight size={22} weight="bold" />
              </button>

              <button
                type="button"
                onClick={() => setStep("pin")}
                className="mt-4 w-full text-purple-200/80 hover:text-white text-sm font-bold"
                data-testid="player-change-pin"
              >
                ← Use a different PIN
              </button>

              <div className="mt-10 flex items-center justify-center gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-10 w-10 rounded-xl grid place-items-center ${["bg-red-500", "bg-blue-500", "bg-yellow-500", "bg-green-500"][i]}`}
                  >
                    <AnswerShape index={i} size={18} />
                  </div>
                ))}
              </div>
            </motion.form>
          )}
        </main>
      </div>
    </div>
  );
}

function BlockerScreen({ kind, pin }) {
  const navigate = useNavigate();
  const map = {
    room_full: {
      title: "Room Full",
      body: "This game already has the max 50 players. Try again once someone leaves.",
      testid: "blocker-room-full",
    },
    already_started: {
      title: "Game Already Started",
      body: "You can't join once the game has begun. Ask your host to open a new room.",
      testid: "blocker-already-started",
    },
    not_found: {
      title: "Room Not Found",
      body: "Double-check the PIN with your host. Codes are 6 digits.",
      testid: "blocker-not-found",
    },
  }[kind] || { title: "Something went wrong", body: "Try again in a moment." };

  return (
    <div className="min-h-screen bg-stage relative overflow-hidden">
      <div className="grain absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-10 -left-10 h-40 w-40 rounded-full bg-red-500/25 blur-2xl animate-floaty" />
        <div className="absolute bottom-10 -right-8 h-52 w-52 rounded-3xl bg-orange-300/20 blur-2xl animate-floaty [animation-delay:2s]" />
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-6 py-10">
        <Logo inverse />
        <div
          data-testid={map.testid}
          className="mt-16 bg-white/10 backdrop-blur-xl border border-white/15 rounded-[2rem] p-8 text-center"
        >
          <div className="text-orange-300 font-black uppercase tracking-widest text-xs">
            Uh oh
          </div>
          <h1 className="font-display text-white text-5xl sm:text-6xl font-black mt-3 leading-none">
            {map.title}
          </h1>
          <p className="text-purple-200 font-semibold mt-6 text-lg">
            {map.body}
          </p>
          <button
            onClick={() => navigate("/")}
            data-testid="blocker-home-btn"
            className="btn-arcade mt-10 w-full h-16 rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-xl"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
