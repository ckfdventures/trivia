"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/navigation";
import { ArrowLeft, ArrowRight, Minus, Plus, Shuffle, Tag } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { createRoom, errorMessage, getThemes } from "../lib/api";
import type { HostSession, ThemeSummary } from "../lib/types";

const MIX = "mix";
const DEFAULT_COUNT = 10;

export default function HostSetup() {
  const navigate = useNavigate();
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null); // theme id or MIX
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [playing, setPlaying] = useState(true);
  const [nickname, setNickname] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getThemes()
      .then((list) => setThemes(list.filter((t) => t.question_count > 0)))
      .catch(() => setLoadErr("Could not load themes. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  const totalQuestions = useMemo(() => themes.reduce((n, t) => n + t.question_count, 0), [themes]);
  const available = selected === MIX ? totalQuestions : themes.find((t) => t.id === selected)?.question_count || 0;

  const choose = (id: string) => {
    setSelected(id);
    setError("");
    const max = id === MIX ? totalQuestions : themes.find((t) => t.id === id)?.question_count || 0;
    setCount((c) => Math.min(Math.max(c, 1), max));
  };

  const setClampedCount = (n: number) => setCount(Math.min(Math.max(1, n || 1), available || 1));

  const onCreate = async () => {
    if (!selected) {
      setError("Pick a theme first");
      return;
    }
    if (playing && !nickname.trim()) {
      setError("Enter your nickname, or untick “I'm playing too”");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const room = await createRoom(selected === MIX ? null : selected, count, playing ? nickname.trim() : null);
      const hostSession: HostSession = {
        pin: room.pin,
        host_token: room.host_token,
        host_id: room.host_id,
        quiz_title: room.room.quiz_title,
        ...(room.host_player && {
          player: {
            pin: room.pin,
            player_id: room.host_player.player_id,
            session_token: room.host_player.session_token,
            nickname: room.host_player.nickname,
          },
        }),
      };
      localStorage.setItem(`ts_host_${room.pin}`, JSON.stringify(hostSession));
      navigate(`/host/lobby/${room.pin}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7FF]">
      <header className="max-w-5xl mx-auto px-6 md:px-10 py-6 flex items-center justify-between">
        <Logo />
        <Link
          href="/"
          className="rounded-full border-2 border-indigo-100 text-indigo-950 font-bold px-4 h-10 inline-flex items-center gap-2 hover:bg-indigo-50"
        >
          <ArrowLeft size={16} weight="bold" /> Home
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 md:px-10 pb-24">
        <div className="text-xs uppercase tracking-widest font-black text-orange-500">Host a game</div>
        <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">Pick a theme</h1>
        <p className="text-indigo-950/60 font-semibold mt-2">
          Questions are drawn at random, so every game is different.
        </p>

        {loading && <div className="mt-10 text-indigo-950/60 font-bold">Loading themes…</div>}
        {loadErr && <div className="mt-10 text-red-600 font-bold">{loadErr}</div>}
        {!loading && !loadErr && themes.length === 0 && (
          <div className="mt-10 rounded-3xl border-2 border-dashed border-indigo-200 p-10 text-center text-indigo-950/70 font-bold">
            No themes are available yet. Check back soon!
          </div>
        )}

        {themes.length > 0 && (
          <>
            <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="theme-grid">
              <ThemeCard
                active={selected === MIX}
                onClick={() => choose(MIX)}
                icon={<Shuffle size={22} weight="bold" />}
                name="Mix"
                detail={`Random from all themes · ${totalQuestions} questions`}
                testId="theme-card-mix"
              />
              {themes.map((t) => (
                <ThemeCard
                  key={t.id}
                  active={selected === t.id}
                  onClick={() => choose(t.id)}
                  icon={<Tag size={22} weight="bold" />}
                  name={t.name}
                  detail={`${t.question_count} question${t.question_count === 1 ? "" : "s"}`}
                  testId={`theme-card-${t.id}`}
                />
              ))}
            </div>

            <div className="mt-10 bg-white rounded-3xl p-6 sm:p-8 card-lift flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-indigo-500">Number of questions</div>
                <div className="mt-3 flex items-center gap-3">
                  <StepButton label="Fewer questions" disabled={!selected || count <= 1} onClick={() => setClampedCount(count - 1)}>
                    <Minus size={18} weight="bold" />
                  </StepButton>
                  <input
                    type="number"
                    min={1}
                    max={available || 1}
                    value={count}
                    disabled={!selected}
                    onChange={(e) => setClampedCount(parseInt(e.target.value, 10))}
                    data-testid="question-count-input"
                    aria-label="Number of questions"
                    className="w-24 h-14 rounded-2xl border-2 border-indigo-100 text-center font-display font-black text-3xl text-indigo-950 focus:outline-none focus:border-orange-300 disabled:opacity-50"
                  />
                  <StepButton label="More questions" disabled={!selected || count >= available} onClick={() => setClampedCount(count + 1)}>
                    <Plus size={18} weight="bold" />
                  </StepButton>
                </div>
                <div className="mt-2 text-sm font-semibold text-indigo-950/60">
                  {selected ? `Up to ${available} available` : "Pick a theme to choose how many"}
                </div>
              </div>

              <div className="w-full sm:w-auto sm:min-w-[16rem]">
                <label htmlFor="host-nickname" className="text-xs font-black uppercase tracking-widest text-indigo-500">
                  Your nickname
                </label>
                <input
                  id="host-nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={!playing}
                  maxLength={20}
                  placeholder={playing ? "e.g. Quizmaster" : "Just presenting"}
                  data-testid="host-nickname-input"
                  className="mt-3 w-full h-14 rounded-2xl border-2 border-indigo-100 px-4 text-lg font-bold text-indigo-950 placeholder:text-indigo-200 focus:outline-none focus:border-orange-300 disabled:opacity-50"
                />
                <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-indigo-950/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={playing}
                    onChange={(e) => setPlaying(e.target.checked)}
                    data-testid="host-playing-toggle"
                    className="h-4 w-4 accent-orange-400"
                  />
                  I&apos;m playing too
                </label>
              </div>

              <button
                onClick={onCreate}
                disabled={!selected || creating}
                data-testid="host-create-room-btn"
                className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-lg px-8 h-14 inline-flex items-center gap-3 disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create game"} <ArrowRight size={20} weight="bold" />
              </button>
            </div>
            {error && (
              <div className="mt-4 text-red-600 font-bold" data-testid="host-setup-error">
                {error}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

interface ThemeCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  detail: string;
  testId: string;
}

function ThemeCard({ active, onClick, icon, name, detail, testId }: ThemeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={
        "text-left rounded-3xl p-5 border-2 transition-colors flex items-start gap-4 " +
        (active ? "border-orange-400 bg-orange-50" : "border-indigo-100 bg-white hover:bg-indigo-50")
      }
    >
      <div className={"h-11 w-11 shrink-0 rounded-2xl grid place-items-center " + (active ? "bg-orange-300 text-indigo-950" : "bg-indigo-950 text-orange-300")}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-display font-black text-xl text-indigo-950 truncate">{name}</div>
        <div className="text-sm font-semibold text-indigo-950/60">{detail}</div>
      </div>
    </button>
  );
}

function StepButton({ children, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="h-12 w-12 rounded-full border-2 border-indigo-100 grid place-items-center text-indigo-950 hover:bg-indigo-50 disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}
