"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CaretDown, CaretRight, PencilSimple, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { adminApi, errorMessage } from "../../lib/api";
import type { Question, ThemeSummary } from "../../lib/types";
import { ConfirmModal } from "../../components/ConfirmModal";

const errorOf = errorMessage;

export default function Themes() {
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ThemeSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      setThemes(await adminApi.listThemes());
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    adminApi
      .listThemes()
      .then(setThemes)
      .catch((e) => setError(errorOf(e)))
      .finally(() => setLoading(false));
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorOf(e));
    }
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      await adminApi.createTheme(newName);
      setNewName("");
    });
  };

  return (
    <div>
      <div className="text-xs uppercase tracking-widest font-black text-indigo-500">Admin</div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">Themes</h1>
        <Link
          href="/admin/upload"
          className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-5 h-12 inline-flex items-center gap-2"
        >
          <UploadSimple size={18} weight="bold" /> Upload questions
        </Link>
      </div>
      <p className="text-indigo-950/60 font-semibold mt-2 max-w-2xl">
        Hosts pick one of these themes (or a mix of all of them) when they start a game.
      </p>

      <form onSubmit={onCreate} className="mt-8 flex flex-wrap gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New theme name, e.g. Harry Potter"
          maxLength={60}
          data-testid="theme-new-name"
          className="flex-1 min-w-[16rem] rounded-2xl border-2 border-indigo-100 bg-white text-indigo-950 text-lg font-bold px-4 h-14 focus:outline-none focus:border-orange-300"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          data-testid="theme-create-btn"
          className="rounded-full bg-indigo-950 text-white font-black px-6 h-14 inline-flex items-center gap-2 hover:bg-indigo-900 disabled:opacity-50"
        >
          <Plus size={18} weight="bold" /> Add theme
        </button>
      </form>

      {error && (
        <div className="mt-4 text-red-600 font-bold" data-testid="themes-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-indigo-950/60 font-bold">Loading…</div>
      ) : themes.length === 0 ? (
        <div className="mt-8 rounded-3xl border-2 border-dashed border-indigo-200 p-10 text-center text-indigo-950/70 font-bold">
          No themes yet. Add one above, or upload questions and name a theme.
        </div>
      ) : (
        <ul className="mt-8 space-y-3" data-testid="theme-list">
          {themes.map((t) => (
            <ThemeRow
              key={t.id}
              theme={t}
              expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onRename={(name: string) => run(() => adminApi.renameTheme(t.id, name))}
              onDelete={() => setPendingDelete(t)}
              onQuestionDeleted={refresh}
              onError={setError}
            />
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        title={`Delete "${pendingDelete?.name}"?`}
        body={`This permanently deletes the theme and its ${pendingDelete?.question_count ?? 0} questions.`}
        confirmLabel="Delete theme"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          const id = pendingDelete.id;
          setPendingDelete(null);
          if (expanded === id) setExpanded(null);
          run(() => adminApi.deleteTheme(id));
        }}
        testId="theme-delete-modal"
      />
    </div>
  );
}

interface ThemeRowProps {
  theme: ThemeSummary;
  expanded: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onQuestionDeleted: () => void;
  onError: (message: string) => void;
}

function ThemeRow({ theme, expanded, onToggle, onRename, onDelete, onQuestionDeleted, onError }: ThemeRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(theme.name);

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== theme.name) onRename(name);
    setEditing(false);
  };

  return (
    <li className="bg-white rounded-3xl card-lift" data-testid={`theme-row-${theme.id}`}>
      <div className="p-5 flex flex-wrap items-center gap-4">
        <button onClick={onToggle} aria-expanded={expanded} className="h-10 w-10 rounded-full grid place-items-center hover:bg-indigo-50 text-indigo-950">
          {expanded ? <CaretDown size={18} weight="bold" /> : <CaretRight size={18} weight="bold" />}
        </button>
        {editing ? (
          <form onSubmit={submitRename} className="flex-1 flex gap-2">
            <input
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              aria-label="Theme name (Enter to save, Esc to cancel)"
              className="flex-1 rounded-xl border-2 border-orange-300 px-3 h-11 font-bold text-indigo-950 focus:outline-none"
            />
          </form>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="font-display font-black text-2xl text-indigo-950 truncate">{theme.name}</div>
            <div className="text-sm font-semibold text-indigo-950/60">
              {theme.question_count} question{theme.question_count === 1 ? "" : "s"}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <IconButton label="Rename theme" onClick={() => { setName(theme.name); setEditing(true); }}>
            <PencilSimple size={18} weight="bold" />
          </IconButton>
          <IconButton label="Delete theme" onClick={onDelete} danger>
            <Trash size={18} weight="bold" />
          </IconButton>
        </div>
      </div>
      {expanded && <QuestionList themeId={theme.id} onDeleted={onQuestionDeleted} onError={onError} />}
    </li>
  );
}

function QuestionList({ themeId, onDeleted, onError }: { themeId: string; onDeleted: () => void; onError: (message: string) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);

  const load = useCallback(() => {
    adminApi.listQuestions(themeId).then(setQuestions).catch((e) => onError(errorOf(e)));
  }, [themeId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    try {
      await adminApi.deleteQuestion(id);
      load();
      onDeleted();
    } catch (e) {
      onError(errorOf(e));
    }
  };

  if (questions === null) return <div className="px-6 pb-5 text-indigo-950/60 font-bold">Loading questions…</div>;
  if (questions.length === 0) return <div className="px-6 pb-5 text-indigo-950/60 font-bold">No questions in this theme yet.</div>;

  return (
    <ol className="border-t border-indigo-50 px-6 py-4 space-y-3 max-h-96 overflow-y-auto">
      {questions.map((q, i) => (
        <li key={q.id} className="flex items-start gap-3">
          <span className="text-indigo-500 font-black w-8 shrink-0">Q{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-indigo-950">{q.text}</div>
            <div className="text-sm font-semibold text-indigo-950/60">
              {q.options.map((o, j) => (
                <span key={j} className={j === q.correct_index ? "text-green-700 font-black" : ""}>
                  {j > 0 && " · "}
                  {o}
                </span>
              ))}
              <span className="ml-2 text-indigo-950/40">({q.time_limit}s)</span>
            </div>
          </div>
          <IconButton label="Delete question" onClick={() => remove(q.id)} danger>
            <Trash size={16} weight="bold" />
          </IconButton>
        </li>
      ))}
    </ol>
  );
}

function IconButton({ children, label, danger = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={
        "h-10 w-10 rounded-full grid place-items-center border-2 " +
        (danger ? "border-red-100 text-red-600 hover:bg-red-50" : "border-indigo-100 text-indigo-950 hover:bg-indigo-50")
      }
      {...props}
    >
      {children}
    </button>
  );
}
