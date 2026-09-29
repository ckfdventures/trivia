"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, PaperPlaneRight, SpeakerSimpleHigh, SpeakerSimpleSlash } from "@phosphor-icons/react";
import { Canvas, type CanvasTool } from "../../components/scribblex/Canvas";
import { Toolbar } from "../../components/scribblex/Toolbar";
import { Chip, Toast } from "../../components/scribblex/ui";
import {
  ChatFeed,
  Results,
  ScoreStrip,
  TurnReveal,
  WordPick,
  WordTiles,
} from "../../components/scribblex/arena";
import { useServerCountdown } from "../../hooks/useServerCountdown";
import { useSound } from "../../hooks/useSound";
import type { ScribbleRoom } from "../../hooks/useScribbleRoom";
import { BRUSH_SIZES, PALETTE } from "../../lib/scribblex/drawing";
import { MAX_CHAT_LENGTH } from "../../lib/scribblex/constants";
import { playSound } from "../../lib/scribblex/sound";

interface Props {
  room: ScribbleRoom;
  meId: string | undefined;
  onLeave(): void;
}

/**
 * The drawing arena — everything that happens once a match is under way.
 *
 * The drawer and the guessers see the same screen with two differences: the drawer gets the
 * word and the tools, the guessers get the guess box. Nothing here decides who is right; the
 * server judges every guess and this only renders what it sends back.
 */
export default function Arena({ room, meId, onLeave }: Props) {
  const { state, turn, chat, actions, canvas, error, dismissError } = room;

  const [tool, setTool] = useState<CanvasTool>("pencil");
  const [color, setColor] = useState<string>(PALETTE[6]);
  const [brush, setBrush] = useState<number>(BRUSH_SIZES[1]);
  const [draft, setDraft] = useState("");
  const sound = useSound();

  const isDrawer = state?.drawer_id === meId && meId !== undefined;
  const me = useMemo(() => state?.players.find((p) => p.id === meId), [state, meId]);
  const drawer = useMemo(
    () => state?.players.find((p) => p.id === state?.drawer_id),
    [state],
  );

  const phaseSeconds =
    state?.phase === "DRAWING" ? state.settings.turn_seconds : state?.phase === "WORD_PICK" ? 10 : 0;
  const { remainingSec, remainingPct } = useServerCountdown({
    deadlineTs: state?.ends_at ?? undefined,
    serverNow: state?.server_now,
    timeLimitSeconds: phaseSeconds || 1,
    active: state?.phase === "DRAWING" || state?.phase === "WORD_PICK",
  });

  // A dry tick through the closing seconds. Keyed on the whole second so it fires once each.
  const ticking = state?.phase === "DRAWING" && remainingSec > 0 && remainingSec <= 10;
  useEffect(() => {
    if (ticking) playSound("tick");
  }, [ticking, remainingSec]);

  if (!state) return null;

  const solved = Boolean(me?.guessed_this_turn);
  const canGuess = state.phase === "DRAWING" && !isDrawer;

  const submitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    actions.guess(text);
    setDraft("");
  };

  return (
    <div className="min-h-screen sx-dots pb-sx-lg">
      <header className="mx-auto w-full max-w-3xl px-sx-md pt-sx-md flex items-center gap-sx-sm">
        <button
          onClick={onLeave}
          data-testid="sx-arena-leave"
          aria-label="Leave the match"
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white border-[2.5px] border-sx-ink shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <h1 className="min-w-0 flex-1 font-sx-display text-sx-headline-sm text-sx-ink truncate">
          Round {state.round} of {state.total_rounds}
        </h1>
        <button
          onClick={sound.toggle}
          data-testid="sx-sound-toggle"
          aria-pressed={sound.on}
          aria-label={sound.on ? "Turn sound off" : "Turn sound on"}
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white border-[2.5px] border-sx-ink shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
        >
          {sound.on ? <SpeakerSimpleHigh size={16} weight="bold" /> : <SpeakerSimpleSlash size={16} weight="bold" />}
        </button>
        <Chip tone={remainingSec <= 10 && remainingSec > 0 ? "bubblegum" : "butter"} data-testid="sx-timer">
          {remainingSec}s
        </Chip>
      </header>

      <main className="mx-auto w-full max-w-3xl px-sx-md pt-sx-md space-y-sx-md">
        {/* Timer bar — the countdown as a shape, not only a number. */}
        <div className="h-2 w-full overflow-hidden rounded-full border-2 border-sx-ink bg-white">
          <div
            className="h-full bg-sx-coral transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.round(remainingPct * 100)}%` }}
            role="progressbar"
            aria-valuenow={remainingSec}
            aria-valuemin={0}
            aria-valuemax={phaseSeconds}
            aria-label="Time left this turn"
          />
        </div>

        <div className="flex items-center justify-center gap-sx-sm">
          <Chip tone="lilac">
            {isDrawer ? "You're drawing" : drawer ? `${drawer.name} is drawing` : "Waiting"}
          </Chip>
          {solved && <Chip tone="mint">You got it</Chip>}
        </div>

        <WordTiles mask={turn.mask.length > 0 ? turn.mask : state.word_mask ?? []} word={turn.word} />

        <ScoreStrip players={state.players} meId={meId} drawerId={state.drawer_id} />

        <Canvas
          channel={canvas}
          enabled={isDrawer && state.phase === "DRAWING"}
          tool={tool}
          color={color}
          size={brush}
        />

        {isDrawer ? (
          <Toolbar
            tool={tool}
            color={color}
            size={brush}
            onTool={setTool}
            onColor={setColor}
            onSize={setBrush}
            onUndo={canvas.undo}
            onRedo={canvas.redo}
            onClear={canvas.clear}
            disabled={state.phase !== "DRAWING"}
          />
        ) : null}

        <section>
          <h2 className="font-sx-display text-sx-headline-sm text-sx-ink mb-sx-sm">Guesses</h2>
          <ChatFeed messages={chat} />

          <form onSubmit={submitGuess} className="mt-sx-sm flex gap-2">
            <label htmlFor="sx-guess" className="sr-only">
              {isDrawer ? "Message" : "Your guess"}
            </label>
            <input
              id="sx-guess"
              value={draft}
              maxLength={MAX_CHAT_LENGTH}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              data-testid="sx-guess-input"
              placeholder={
                isDrawer
                  ? "Chat — careful not to say it"
                  : solved
                    ? "You got it — chat away"
                    : canGuess
                      ? "Type your guess"
                      : "Waiting for the next turn"
              }
              className="min-h-[52px] flex-1 rounded-full bg-white border-2 border-sx-ink px-sx-md font-sx-body text-sx-body-md text-sx-ink placeholder:text-sx-ink/45 focus:outline-none focus:shadow-[0_3px_0_#FF7A59]"
            />
            <button
              type="submit"
              aria-label="Send"
              data-testid="sx-guess-send"
              className="press grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-sx-coral border-[2.5px] border-sx-ink shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
            >
              <PaperPlaneRight size={18} weight="bold" />
            </button>
          </form>
        </section>
      </main>

      {/* Overlays, most urgent first. */}
      {turn.standings && (
        <Results
          standings={turn.standings.standings}
          isHost={state.host_id === meId}
          onPlayAgain={actions.playAgain}
          onLeave={onLeave}
        />
      )}
      {!turn.standings && turn.ended && state.phase === "REVEAL" && (
        <TurnReveal turn={turn.ended} players={state.players} />
      )}
      {!turn.standings && state.phase === "WORD_PICK" && turn.choices.length > 0 && (
        <WordPick words={turn.choices} secondsLeft={remainingSec} onPick={actions.pickWord} />
      )}

      {error && <Toast message={error} onDismiss={dismissError} />}
    </div>
  );
}
