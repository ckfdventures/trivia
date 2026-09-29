"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown, CaretRight, Check, Plus, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { ConfirmModal } from "../../components/ConfirmModal";
import { errorMessage } from "../../lib/api";
import { deckAdminApi, type DeckDetail, type WordUploadPreview } from "../../lib/scribblex/adminApi";
import type { DeckSummary } from "../../lib/scribblex/types";

/**
 * Word decks for ScribbleX.
 *
 * These are the same decks players pick in a lobby — edits here change what the next match
 * draws from, with no deploy. Styled to match the rest of the admin panel rather than the
 * game's own skin: this is platform chrome, not part of ScribbleX.
 */
export default function WordDecks() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🎨");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeckDetail | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeckSummary | null>(null);

  const refresh = useCallback(async () => {
    setDecks(await deckAdminApi.list());
  }, []);

  useEffect(() => {
    deckAdminApi
      .list()
      .then(setDecks)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const toggle = (deck: DeckSummary) => {
    if (expanded === deck.id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(deck.id);
    setDetail(null);
    deckAdminApi
      .get(deck.id)
      .then(setDetail)
      .catch((e) => setError(errorMessage(e)));
  };

  const reloadDetail = async (id: string) => {
    setDetail(await deckAdminApi.get(id));
    await refresh();
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      await deckAdminApi.create({ name: newName, emoji: newEmoji });
      setNewName("");
      setNewEmoji("🎨");
    });
  };

  return (
    <div>
      <div className="text-xs uppercase tracking-widest font-black text-indigo-500">Admin</div>
      <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">Word decks</h1>
      <p className="text-indigo-950/60 font-semibold mt-2 max-w-2xl">
        Players choose from these decks when they set up a ScribbleX room. Changes take effect on
        the next match — no deploy needed.
      </p>

      {error && (
        <div
          data-testid="decks-error"
          className="mt-6 rounded-2xl bg-red-50 border border-red-200 text-red-800 font-semibold px-4 py-3"
        >
          {error}
        </div>
      )}

      {/* New deck */}
      <form onSubmit={onCreate} className="mt-8 flex flex-wrap gap-3 items-center">
        <input
          value={newEmoji}
          onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))}
          aria-label="Deck emoji"
          data-testid="deck-emoji-input"
          className="w-16 h-12 rounded-2xl border-2 border-indigo-200 text-center text-xl bg-white focus:outline-none focus:ring-4 focus:ring-orange-200"
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New deck name"
          aria-label="New deck name"
          data-testid="deck-name-input"
          className="flex-1 min-w-[12rem] h-12 rounded-2xl border-2 border-indigo-200 px-4 font-semibold bg-white focus:outline-none focus:ring-4 focus:ring-orange-200"
        />
        <button
          type="submit"
          data-testid="deck-create-btn"
          className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 text-indigo-950 font-black px-5 h-12 inline-flex items-center gap-2"
        >
          <Plus size={18} weight="bold" /> Add deck
        </button>
      </form>

      {/* Decks */}
      {loading ? (
        <p className="mt-8 font-semibold text-indigo-950/60">Loading decks…</p>
      ) : decks.length === 0 ? (
        <p className="mt-8 font-semibold text-indigo-950/60" data-testid="decks-empty">
          No decks yet. Add one above, then upload a word list into it.
        </p>
      ) : (
        <div className="mt-8 space-y-3">
          {decks.map((deck) => (
            <div
              key={deck.id}
              data-testid={`deck-${deck.id}`}
              className="rounded-2xl bg-white border border-indigo-100 card-lift overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => toggle(deck)}
                  aria-expanded={expanded === deck.id}
                  data-testid={`deck-toggle-${deck.id}`}
                  className="flex flex-1 items-center gap-3 text-left min-w-0"
                >
                  {expanded === deck.id ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
                  <span className="text-2xl" aria-hidden="true">
                    {deck.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display font-black text-lg text-indigo-950 truncate">
                      {deck.name}
                    </span>
                    <span className="block text-sm font-semibold text-indigo-950/50 truncate">
                      {deck.blurb || "No description"} · {deck.word_count} words
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => setPendingDelete(deck)}
                  aria-label={`Delete ${deck.name}`}
                  data-testid={`deck-delete-${deck.id}`}
                  className="shrink-0 rounded-full h-10 w-10 grid place-items-center border border-indigo-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>

              {expanded === deck.id && (
                <DeckEditor
                  deckId={deck.id}
                  detail={detail}
                  onChanged={() => reloadDetail(deck.id)}
                  onError={setError}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : ""}
        body={
          pendingDelete
            ? `This removes the deck and its ${pendingDelete.word_count} words. Rooms already using it fall back to their other decks.`
            : ""
        }
        confirmLabel="Delete deck"
        testId="deck-delete-confirm"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const id = pendingDelete?.id;
          setPendingDelete(null);
          if (id) run(() => deckAdminApi.remove(id));
        }}
      />
    </div>
  );
}

/** The expanded half of a deck row: upload a list, or pick words off one by one. */
function DeckEditor({
  deckId,
  detail,
  onChanged,
  onError,
}: {
  deckId: string;
  detail: DeckDetail | null;
  onChanged(): Promise<void>;
  onError(message: string): void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<WordUploadPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    guard(async () => setPreview(await deckAdminApi.previewUpload(file)));
  };

  const importPreviewed = () =>
    guard(async () => {
      if (!preview?.valid_words.length) return;
      await deckAdminApi.addWords(deckId, preview.valid_words);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
    });

  const addTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const words = typed.split(/[\n,]/).map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) return;
    guard(async () => {
      await deckAdminApi.addWords(deckId, words);
      setTyped("");
      await onChanged();
    });
  };

  return (
    <div className="border-t border-indigo-100 bg-[#FBFAFF] p-4 space-y-5">
      {/* Upload */}
      <div>
        <h3 className="font-display font-black text-indigo-950">Upload a word list</h3>
        <p className="text-sm font-semibold text-indigo-950/50 mt-0.5">
          A .txt with one word per line, a .csv with a <code>word</code> column, or a .json array.
          Nothing is saved until you import.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.json"
          onChange={onFile}
          disabled={busy}
          data-testid={`deck-upload-${deckId}`}
          className="mt-3 block w-full text-sm font-semibold file:mr-3 file:rounded-full file:border-0 file:bg-indigo-950 file:px-4 file:py-2 file:font-black file:text-white hover:file:bg-indigo-900"
        />

        {preview && (
          <div className="mt-3 rounded-2xl border border-indigo-200 bg-white p-4" data-testid="deck-preview">
            <p className="font-semibold text-indigo-950">
              {preview.valid_count} usable, {preview.error_count} skipped, of {preview.total_rows}.
            </p>
            {preview.valid_count > 0 && (
              <p className="mt-2 text-sm text-indigo-950/60 font-semibold break-words">
                {preview.valid_words.slice(0, 20).join(", ")}
                {preview.valid_words.length > 20 && ` … and ${preview.valid_words.length - 20} more`}
              </p>
            )}
            {preview.errors.length > 0 && (
              <ul className="mt-2 text-sm text-red-700 font-semibold space-y-0.5 max-h-32 overflow-y-auto">
                {preview.errors.slice(0, 10).map((err) => (
                  <li key={err}>{err}</li>
                ))}
                {preview.errors.length > 10 && <li>… and {preview.errors.length - 10} more</li>}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={importPreviewed}
                disabled={busy || preview.valid_count === 0}
                data-testid="deck-import-btn"
                className="btn-arcade rounded-full bg-orange-300 hover:bg-orange-400 disabled:opacity-50 text-indigo-950 font-black px-4 h-10 inline-flex items-center gap-2"
              >
                <UploadSimple size={16} weight="bold" /> Import {preview.valid_count}
              </button>
              <button
                onClick={() => {
                  setPreview(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-full border border-indigo-200 px-4 h-10 font-bold hover:bg-indigo-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Type a few */}
      <form onSubmit={addTyped}>
        <h3 className="font-display font-black text-indigo-950">Or add a few by hand</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="penguin, otter, sloth"
            aria-label="Words to add"
            data-testid={`deck-typed-${deckId}`}
            className="flex-1 min-w-[12rem] h-11 rounded-2xl border-2 border-indigo-200 px-4 font-semibold bg-white focus:outline-none focus:ring-4 focus:ring-orange-200"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-indigo-950 hover:bg-indigo-900 disabled:opacity-50 text-white font-black px-4 h-11 inline-flex items-center gap-2"
          >
            <Check size={16} weight="bold" /> Add
          </button>
        </div>
      </form>

      {/* Existing words */}
      <div>
        <h3 className="font-display font-black text-indigo-950">
          Words {detail ? `(${detail.words.length})` : ""}
        </h3>
        {!detail ? (
          <p className="text-sm font-semibold text-indigo-950/50 mt-1">Loading…</p>
        ) : detail.words.length === 0 ? (
          <p className="text-sm font-semibold text-indigo-950/50 mt-1">
            Empty. A deck needs words before a match can use it.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
            {detail.words.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1 rounded-full bg-white border border-indigo-200 pl-3 pr-1 py-1 text-sm font-semibold"
              >
                {word}
                <button
                  onClick={() => guard(async () => {
                    await deckAdminApi.removeWord(deckId, word);
                    await onChanged();
                  })}
                  aria-label={`Remove ${word}`}
                  className="rounded-full h-5 w-5 grid place-items-center hover:bg-red-100 hover:text-red-700"
                >
                  <X size={11} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
