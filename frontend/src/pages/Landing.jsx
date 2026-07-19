import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Confetti, GameController, Users, Trophy } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { AnswerShape } from "../components/AnswerShape";

export default function Landing() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    const clean = pin.replace(/\D/g, "");
    if (clean.length !== 6) {
      setPinErr("Enter the 6-digit Game PIN");
      return;
    }
    navigate(`/play/${clean}`);
  };

  return (
    <div className="min-h-screen bg-[#FAF7FF]">
      {/* Nav */}
      <header className="max-w-7xl mx-auto px-6 md:px-10 py-6 flex items-center justify-between">
        <Logo />
        <div className="hidden sm:flex items-center gap-6 text-sm font-semibold text-indigo-950/80">
          <span>How it works</span>
          <span>Templates</span>
          <button
            data-testid="nav-host-btn"
            onClick={() => navigate("/host/create")}
            className="rounded-full bg-indigo-950 text-white px-5 py-2 hover:bg-indigo-900"
          >
            Host a game
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 pt-8 md:pt-16 pb-24 grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 text-indigo-900 px-4 py-1.5 text-xs font-bold tracking-wider uppercase">
            <Confetti size={16} weight="fill" /> Live multiplayer trivia
          </div>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter mt-6 text-indigo-950 leading-[0.95] uppercase">
            Turn any room <br />
            into a game show.
          </h1>
          <p className="mt-6 text-lg text-indigo-950/70 max-w-xl leading-relaxed font-semibold">
            Build a quiz in minutes. Share a 6-digit PIN. Watch the leaderboard
            explode as players buzz in on their phones — no downloads, no signups.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              data-testid="hero-host-btn"
              onClick={() => navigate("/host/create")}
              className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-lg px-8 h-14 inline-flex items-center gap-3"
            >
              <GameController size={22} weight="fill" /> Create a game
              <ArrowRight size={20} weight="bold" />
            </button>
            <a
              href="#join"
              className="rounded-full border-2 border-indigo-950 text-indigo-950 font-bold px-6 h-14 inline-flex items-center hover:bg-indigo-950 hover:text-white transition-colors"
              data-testid="hero-join-anchor"
            >
              Join with a PIN
            </a>
          </div>

          {/* Stat row */}
          <div className="mt-14 grid grid-cols-3 gap-6 max-w-lg">
            {[
              { icon: <Users size={22} weight="fill" />, label: "Up to 50 players/room" },
              { icon: <Trophy size={22} weight="fill" />, label: "Live leaderboard" },
              { icon: <Confetti size={22} weight="fill" />, label: "PIN-based join" },
            ].map((s) => (
              <div key={s.label} className="flex items-start gap-3">
                <div className="rounded-xl h-10 w-10 grid place-items-center bg-indigo-950 text-orange-300 shrink-0">
                  {s.icon}
                </div>
                <div className="text-xs font-bold text-indigo-950/80 leading-snug">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right side: Join card */}
        <div id="join" className="lg:col-span-5">
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            onSubmit={onSubmit}
            className="relative bg-indigo-950 rounded-[2rem] p-8 sm:p-10 card-lift overflow-hidden grain"
          >
            {/* Floating shapes decor */}
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-orange-300/25 animate-floaty" />
            <div className="absolute bottom-6 -left-6 h-16 w-16 rounded-2xl bg-purple-500/40 animate-floaty [animation-delay:1.5s]" />

            <div className="flex items-center gap-2 text-orange-300 uppercase tracking-widest text-xs font-black">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              Player entry
            </div>
            <h2 className="font-display text-white text-4xl sm:text-5xl font-black mt-4">
              Got a Game PIN?
            </h2>
            <p className="text-purple-200 mt-3 font-semibold">
              Enter your host's 6-digit code to join the room.
            </p>

            <input
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPinErr("");
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              placeholder="123456"
              data-testid="landing-pin-input"
              className="mt-8 w-full h-20 rounded-2xl bg-white text-indigo-950 font-display font-black text-4xl text-center tracking-[0.4em] focus:ring-4 focus:ring-orange-300 focus:outline-none placeholder:text-indigo-200"
            />
            {pinErr && (
              <div
                className="mt-3 text-orange-300 font-bold text-sm"
                data-testid="landing-pin-error"
              >
                {pinErr}
              </div>
            )}

            <button
              type="submit"
              data-testid="landing-join-btn"
              className="btn-arcade mt-6 w-full h-16 rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-xl inline-flex items-center justify-center gap-3"
            >
              Join Game <ArrowRight size={22} weight="bold" />
            </button>

            {/* Answer shape row */}
            <div className="mt-8 flex items-center justify-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-12 w-12 rounded-2xl grid place-items-center ${["bg-red-500", "bg-blue-500", "bg-yellow-500", "bg-green-500"][i]}`}
                >
                  <AnswerShape index={i} size={22} />
                </div>
              ))}
            </div>
          </motion.form>
        </div>
      </section>
    </div>
  );
}
