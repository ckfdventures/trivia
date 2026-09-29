"use client";

import React, { useEffect, useRef } from "react";
import { PencilSimple, Trophy } from "@phosphor-icons/react";
import { AvatarDisc } from "./AvatarDisc";
import { Button, Card, Chip } from "./ui";
import type { ChatMessage, RoomPlayer, Standing, TurnEnd } from "../../lib/scribblex/types";

/** The pieces of the drawing arena. */

// ── Word tiles ───────────────────────────────────────────────────────────────

/**
 * The word, one tile per character.
 *
 * The drawer is given the whole thing; everyone else sees blanks that fill in as hints land.
 * Word breaks render as a gap rather than a tile, so a two-word answer reads as two words.
 */
export function WordTiles({ mask, word }: { mask: (string | null)[]; word: string | null }) {
  const chars = word ? [...word] : mask;
  if (chars.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" data-testid="sx-word-tiles">
      <span className="sr-only">
        {word ? `The word is ${word}` : `${mask.filter((c) => c !== " ").length} letters`}
      </span>
      {chars.map((ch, i) => {
        if (ch === " ") return <span key={i} className="w-3" aria-hidden="true" />;
        const revealed = ch !== null;
        return (
          <span
            key={i}
            aria-hidden="true"
            className={`grid h-11 w-9 place-items-center rounded-sx border-2 border-sx-ink font-sx-display text-sx-headline-sm uppercase
              ${revealed ? "bg-white text-sx-primary" : "bg-sx-secondary-fixed text-sx-ink/30"}`}
          >
            {revealed ? ch : "_"}
          </span>
        );
      })}
    </div>
  );
}

// ── Scoreboard strip ─────────────────────────────────────────────────────────

export function ScoreStrip({
  players,
  meId,
  drawerId,
}: {
  players: RoomPlayer[];
  meId: string | undefined;
  drawerId: string | null;
}) {
  const ordered = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" data-testid="sx-scores">
      {ordered.map((p) => {
        const solved = p.guessed_this_turn;
        return (
          <div
            key={p.id}
            data-testid={`sx-score-${p.id}`}
            className={`flex shrink-0 items-center gap-2 rounded-full border-2 border-sx-ink px-2.5 py-1.5
              ${solved ? "bg-sx-tertiary-fixed" : p.id === meId ? "bg-sx-secondary-fixed" : "bg-white"}
              ${p.connected ? "" : "opacity-55"}`}
          >
            <AvatarDisc avatarId={p.avatar_id} hatId={p.hat_id} size={26} />
            <span className="font-sx-display text-sx-label-md text-sx-ink whitespace-nowrap">
              {p.name}
              {p.id === meId && <span className="text-sx-on-surface-variant"> (you)</span>}
            </span>
            {p.id === drawerId && <PencilSimple size={13} weight="bold" aria-label="Drawing" />}
            {solved && <span className="font-sx-display text-sx-label-sm text-sx-tertiary">got it</span>}
            <span className="font-sx-display text-sx-label-md text-sx-ink">{p.score}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export function ChatFeed({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Follow new messages, unless the reader has scrolled up to catch up on something.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if (atBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div
      ref={boxRef}
      role="log"
      aria-live="polite"
      aria-label="Guesses and chat"
      data-testid="sx-chat"
      className="h-48 overflow-y-auto rounded-sx-md border-2 border-sx-ink bg-white p-sx-sm space-y-1.5"
    >
      {messages.length === 0 && (
        <p className="font-sx-body text-sx-body-sm text-sx-on-surface-variant">
          Guesses show up here.
        </p>
      )}
      {messages.map((m, i) => (
        <ChatLine key={i} message={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function ChatLine({ message }: { message: ChatMessage }) {
  if (message.kind === "correct") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-full bg-sx-tertiary-fixed border-[1.5px] border-sx-ink px-sx-sm py-1.5">
        <span className="font-sx-display text-sx-label-md text-sx-ink truncate">{message.text}</span>
        {message.points !== undefined && (
          <span className="shrink-0 rounded-full bg-white border-[1.5px] border-sx-ink px-2 font-sx-display text-sx-label-sm">
            +{message.points}
          </span>
        )}
      </div>
    );
  }
  if (message.kind === "close" || message.kind === "system") {
    return (
      <div className="rounded-full bg-sx-secondary-fixed border-[1.5px] border-sx-ink px-sx-sm py-1.5">
        <span className="font-sx-display text-sx-label-md text-sx-ink">{message.text}</span>
      </div>
    );
  }
  return (
    <p className="font-sx-body text-sx-body-sm text-sx-ink">
      {message.from && <span className="font-sx-display text-sx-primary">{message.from.name}: </span>}
      {message.text}
    </p>
  );
}

// ── Overlays ─────────────────────────────────────────────────────────────────

function Scrim({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      className="fixed inset-0 z-50 grid place-items-center p-sx-md"
      style={{ background: "rgba(43, 38, 45, 0.35)" }}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

/** The drawer's three options. Nobody else is ever rendered this. */
export function WordPick({
  words,
  secondsLeft,
  onPick,
}: {
  words: string[];
  secondsLeft: number;
  onPick(index: number): void;
}) {
  return (
    <Scrim testId="sx-word-pick">
      <Card className="text-center">
        <p className="font-sx-display text-sx-label-md text-sx-on-surface-variant">
          Your turn to draw — {secondsLeft}s
        </p>
        <h2 className="font-sx-display text-sx-headline-md text-sx-ink mt-1">Pick a word</h2>
        <div className="mt-sx-md space-y-2">
          {words.map((word, i) => (
            <Button
              key={word}
              variant={i === 0 ? "primary" : "secondary"}
              onClick={() => onPick(i)}
              data-testid={`sx-word-choice-${i}`}
              className="w-full"
            >
              {word}
            </Button>
          ))}
        </div>
        <p className="font-sx-body text-sx-body-sm text-sx-on-surface-variant mt-sx-sm">
          Run out of time and the first one is picked for you.
        </p>
      </Card>
    </Scrim>
  );
}

/** Shown between turns: the answer, and what it was worth. */
export function TurnReveal({ turn, players }: { turn: TurnEnd; players: RoomPlayer[] }) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "Someone";
  return (
    <Scrim testId="sx-turn-reveal">
      <Card className="text-center">
        <p className="font-sx-display text-sx-label-md text-sx-on-surface-variant">The word was</p>
        <h2 className="font-sx-display text-sx-hero-m text-sx-primary mt-1 break-words">{turn.word}</h2>
        <div className="mt-sx-md space-y-1.5">
          {turn.deltas.length === 0 && (
            <p className="font-sx-body text-sx-body-md text-sx-on-surface-variant">Nobody got that one.</p>
          )}
          {turn.deltas.map((d) => (
            <div
              key={`${d.player_id}-${d.as_drawer ? "d" : "g"}`}
              className="flex items-center justify-between rounded-full bg-sx-surface-container px-sx-sm py-1.5"
            >
              <span className="font-sx-display text-sx-label-md text-sx-ink">
                {nameOf(d.player_id)}
                {d.as_drawer && <span className="text-sx-on-surface-variant"> · for drawing</span>}
              </span>
              <span className="font-sx-display text-sx-label-md text-sx-tertiary">+{d.points}</span>
            </div>
          ))}
        </div>
      </Card>
    </Scrim>
  );
}

/** The podium at the end of a match. */
export function Results({
  standings,
  isHost,
  onPlayAgain,
  onLeave,
}: {
  standings: Standing[];
  isHost: boolean;
  onPlayAgain(): void;
  onLeave(): void;
}) {
  const podium = standings.slice(0, 3);
  const rest = standings.slice(3);

  return (
    <Scrim testId="sx-results">
      <Card className="text-center max-h-[85vh] overflow-y-auto">
        <Chip tone="butter" className="sx-tilt-a">
          <Trophy size={13} weight="fill" /> Final scores
        </Chip>

        <div className="mt-sx-md space-y-2">
          {podium.map((s) => (
            <div
              key={s.player_id}
              data-testid={`sx-podium-${s.rank}`}
              className={`flex items-center gap-sx-sm rounded-sx-md border-2 border-sx-ink p-sx-sm
                ${s.rank === 1 ? "bg-sx-secondary-fixed shadow-sticker" : s.rank === 2 ? "bg-sx-surface-container" : "bg-white"}`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-sx-ink bg-white font-sx-display text-sx-label-lg">
                {s.rank}
              </span>
              <AvatarDisc avatarId={s.avatar_id} hatId={s.hat_id} size={40} />
              <span className="min-w-0 flex-1 text-left font-sx-display text-sx-headline-sm text-sx-ink truncate">
                {s.name}
                {s.tied && <span className="font-sx-body text-sx-body-sm text-sx-on-surface-variant"> · tied</span>}
              </span>
              <span className="font-sx-display text-sx-headline-sm text-sx-primary">{s.score}</span>
            </div>
          ))}
        </div>

        {rest.length > 0 && (
          <div className="mt-sx-sm space-y-1">
            {rest.map((s) => (
              <div key={s.player_id} className="flex items-center gap-sx-sm px-sx-sm py-1">
                <span className="w-6 font-sx-display text-sx-label-md text-sx-on-surface-variant">{s.rank}</span>
                <span className="min-w-0 flex-1 text-left font-sx-body text-sx-body-md truncate">{s.name}</span>
                <span className="font-sx-display text-sx-label-md">{s.score}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-sx-lg flex flex-col gap-2">
          {isHost ? (
            <Button onClick={onPlayAgain} data-testid="sx-play-again" className="w-full">
              Back to the lobby
            </Button>
          ) : (
            <p className="font-sx-body text-sx-body-sm text-sx-on-surface-variant">
              Waiting for the host to set up the next one.
            </p>
          )}
          <Button variant="ghost" onClick={onLeave} data-testid="sx-leave-results" className="w-full">
            Leave
          </Button>
        </div>
      </Card>
    </Scrim>
  );
}
