import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const { login, formatApiError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email || !password) {
      setErr("Enter your email and password");
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
      navigate("/dashboard/games");
    } catch (e) {
      setErr(formatApiError(e?.response?.data?.detail) || "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-stage relative overflow-hidden">
      <div className="grain absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 -left-10 h-56 w-56 rounded-full bg-orange-300/15 blur-3xl animate-floaty" />
        <div className="absolute bottom-10 right-10 h-64 w-64 rounded-[3rem] bg-purple-500/15 blur-3xl animate-floaty [animation-delay:2s]" />
      </div>
      <div className="relative z-10">
        <header className="max-w-lg mx-auto px-6 py-6 flex items-center justify-between">
          <Logo inverse />
          <Link to="/" className="rounded-full bg-white/10 hover:bg-white/20 text-white font-bold px-4 h-10 inline-flex items-center gap-2 border border-white/20">
            <ArrowLeft size={16} weight="bold" /> Home
          </Link>
        </header>
        <main className="max-w-lg mx-auto px-6 pt-8 pb-24">
          <form
            onSubmit={submit}
            className="bg-white rounded-[2rem] p-8 card-lift"
            data-testid="login-form"
          >
            <div className="text-orange-500 font-black uppercase tracking-widest text-xs">
              Host sign in
            </div>
            <h1 className="font-display text-indigo-950 text-4xl font-black mt-2 leading-none">
              Welcome back
            </h1>
            <p className="text-indigo-950/60 font-semibold mt-3">
              Sign in to your dashboard to manage quizzes and view session reports.
            </p>

            <label className="block mt-8">
              <span className="text-xs font-black uppercase tracking-widest text-indigo-500">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email"
                autoComplete="email"
                className="mt-2 w-full rounded-2xl border-2 border-indigo-100 bg-white text-indigo-950 text-lg font-bold px-4 h-14 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
                placeholder="you@example.com"
              />
            </label>
            <label className="block mt-5">
              <span className="text-xs font-black uppercase tracking-widest text-indigo-500">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-2xl border-2 border-indigo-100 bg-white text-indigo-950 text-lg font-bold px-4 h-14 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200"
                placeholder="••••••••"
              />
            </label>

            {err && (
              <div className="mt-5 text-red-600 font-bold text-sm" data-testid="login-error">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit"
              className="btn-arcade mt-8 w-full h-14 rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black text-lg inline-flex items-center justify-center gap-3 disabled:opacity-70"
            >
              {busy ? "Signing in…" : "Sign in"} <ArrowRight size={18} weight="bold" />
            </button>

            <div className="mt-6 text-center text-indigo-950/70 font-semibold text-sm">
              New to TriviaStream?{" "}
              <Link to="/register" data-testid="login-register-link" className="text-orange-600 font-black hover:underline">
                Create an account
              </Link>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
