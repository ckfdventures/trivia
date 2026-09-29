"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Crown, ShareNetwork, UserMinus } from "@phosphor-icons/react";
import { AvatarDisc } from "../../components/scribblex/AvatarDisc";
import { Canvas, type CanvasTool } from "../../components/scribblex/Canvas";
import { Toolbar } from "../../components/scribblex/Toolbar";
import {
  Button,
  Card,
  Chip,
  SectionHeading,
  SegmentedControl,
  Stepper,
  Toast,
  Toggle,
} from "../../components/scribblex/ui";
import { useScribbleRoom } from "../../hooks/useScribbleRoom";
import { routes } from "../../lib/routes";
import {
  DECKS,
  MAX_MAX_PLAYERS,
  MIN_CUSTOM_WORDS,
  MIN_MAX_PLAYERS,
  ROUND_OPTIONS,
  TURN_SECONDS_OPTIONS,
} from "../../lib/scribblex/constants";
import { BRUSH_SIZES, PALETTE } from "../../lib/scribblex/drawing";
import { clearSeat, loadSeat } from "../../lib/scribblex/profile";
import type { RoomPlayer, StoredSeat } from "../../lib/scribblex/types";

/**
 * The room lobby: share the code, agree the rules, wait for everyone.
 *
 * Only the host can change settings; everyone else sees the same controls disabled, so the
 * rules are always legible rather than hidden behind a permission. Every change round-trips
 * through the server and comes back as a fresh snapshot — nothing is applied optimistically.
 */
export default function Lobby() {
  const router = useRouter();
  const params = useParams<{ code?: string }>();
  const code = (params.code ?? "").toUpperCase();

  // Client-only screen (see room/[code]/LobbyClient.tsx), so the seat resolves synchronously.
  const [seat] = useState<StoredSeat | null>(() => (code ? loadSeat(code) : null));
  const [copied, setCopied] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  // Drawing settings are local to this player — the server only sees the marks they make.
  const [tool, setTool] = useState<CanvasTool>("pencil");
  const [color, setColor] = useState<string>(PALETTE[6]);
  const [brush, setBrush] = useState<number>(BRUSH_SIZES[1]);

  // No seat in this browser: send them through the profile step to get one.
  useEffect(() => {
    if (seat === null && code) {
      router.replace(`${routes.scribblex.profile}?intent=join&code=${encodeURIComponent(code)}`);
    }
  }, [seat, code, router]);

  const { connected, state, error, removed, actions, canvas, dismissError } = useScribbleRoom({
    code,
    playerId: seat?.player_id,
    token: seat?.session_token,
  });

  useEffect(() => {
    if (!removed) return;
    clearSeat(code);
    router.replace(routes.scribblex.home);
  }, [removed, code, router]);

  const me = useMemo(
    () => state?.players.find((p) => p.id === seat?.player_id) ?? null,
    [state, seat],
  );
  const isHost = Boolean(me?.is_host);
  const settings = state?.settings;

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !state) return "";
    return `${window.location.origin}${routes.scribblex.room(state.code)}`;
  }, [state]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state?.display_code ?? code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the code is on screen to read anyway */
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "ScribbleX", text: "Draw and guess with me", url: inviteUrl });
        return;
      } catch {
        /* the player dismissed the sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* nothing more to try */
    }
  };

  const leave = () => {
    actions.leave();
    clearSeat(code);
    router.push(routes.scribblex.home);
  };

  const toggleDeck = (deckId: string) => {
    if (!settings) return;
    const next = settings.decks.includes(deckId)
      ? settings.decks.filter((d) => d !== deckId)
      : [...settings.decks, deckId];
    actions.updateSettings({ decks: next });
  };

  const saveCustomWords = () => {
    const words = customDraft
      .split(/[\n,]/)
      .map((w) => w.trim())
      .filter(Boolean);
    actions.updateSettings({ custom_words: words });
    setShowCustom(false);
  };

  if (seat === null || (!state && !removed)) {
    return (
      <div className="min-h-screen sx-dots grid place-items-center px-sx-md">
        <p className="font-sx-body text-sx-body-lg text-sx-on-surface-variant">
          {connected ? "Loading the room…" : "Connecting…"}
        </p>
      </div>
    );
  }
  if (!state) return null;

  return (
    <div className="min-h-screen sx-dots pb-40">
      <header className="mx-auto w-full max-w-2xl px-sx-md pt-sx-md flex items-center justify-between gap-sx-sm">
        <button
          onClick={leave}
          data-testid="sx-lobby-leave"
          aria-label="Leave room"
          className="press grid h-11 w-11 place-items-center rounded-full bg-white border-[2.5px] border-sx-ink shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <Chip tone={connected ? "mint" : "butter"} data-testid="sx-connection">
          <span aria-hidden="true">{connected ? "●" : "○"}</span>
          {connected ? "Live" : "Reconnecting"}
        </Chip>
      </header>

      <main className="mx-auto w-full max-w-2xl px-sx-md pt-sx-md space-y-sx-lg">
        {/* Room code */}
        <Card tinted>
          <p className="font-sx-display text-sx-label-md text-sx-on-surface-variant">Room code</p>
          <div className="flex flex-wrap items-center gap-sx-sm mt-1">
            <span
              data-testid="sx-room-code"
              className="font-sx-display text-sx-hero-m text-sx-ink tracking-tight"
            >
              {state.display_code}
            </span>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={copyCode} data-testid="sx-copy-code" className="h-11 px-sx-md">
                {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button onClick={share} data-testid="sx-share" className="h-11 px-sx-md">
                <ShareNetwork size={16} weight="bold" />
                Share
              </Button>
            </div>
          </div>
        </Card>

        {/* Shared doodle pad. While the room is a lobby anyone can draw on it; once a turn
            starts the same canvas belongs to the drawer alone. */}
        <section>
          <SectionHeading action={<Chip tone="bubblegum">Everyone can draw</Chip>}>
            Doodle while you wait
          </SectionHeading>
          <Canvas channel={canvas} enabled={state.phase === "LOBBY"} tool={tool} color={color} size={brush} />
          <div className="mt-sx-sm">
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
              disabled={state.phase !== "LOBBY"}
            />
          </div>
        </section>

        {/* Word decks */}
        <section>
          <SectionHeading action={<Chip tone="cyan">{settings!.decks.length} selected</Chip>}>
            Word decks
          </SectionHeading>
          <div className="space-y-2">
            {DECKS.map((deck) => {
              const on = settings!.decks.includes(deck.id);
              return (
                <button
                  key={deck.id}
                  onClick={() => toggleDeck(deck.id)}
                  disabled={!isHost}
                  aria-pressed={on}
                  data-testid={`sx-deck-${deck.id}`}
                  className={`w-full flex items-center gap-sx-sm rounded-sx-md border-2 bg-white p-sx-sm text-left
                    ${on ? "border-sx-coral" : "border-sx-ink"}
                    disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sx border-2 border-sx-ink bg-sx-secondary-fixed text-xl">
                    {deck.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sx-display text-sx-label-lg text-sx-ink">{deck.name}</span>
                    <span className="block font-sx-body text-sx-body-sm text-sx-on-surface-variant truncate">
                      {deck.blurb}
                    </span>
                  </span>
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-sx-ink ${
                      on ? "bg-sx-tertiary text-white" : "bg-white"
                    }`}
                  >
                    {on && <Check size={13} weight="bold" />}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowCustom((v) => !v)}
            disabled={!isHost}
            data-testid="sx-custom-toggle"
            className="mt-sx-sm w-full rounded-sx-md border-2 border-dashed border-sx-outline bg-white/60 p-sx-sm font-sx-display text-sx-label-lg text-sx-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            Custom word list
            {settings!.custom_word_count > 0 ? ` (${settings!.custom_word_count})` : ""}
          </button>

          {showCustom && isHost && (
            <Card className="mt-sx-sm">
              <label htmlFor="sx-custom-words" className="font-sx-display text-sx-label-md text-sx-on-surface-variant">
                One word per line, or separated by commas
              </label>
              <textarea
                id="sx-custom-words"
                rows={5}
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                data-testid="sx-custom-words"
                className="mt-1.5 w-full rounded-sx border-2 border-sx-ink bg-white p-sx-sm font-sx-body text-sx-body-md focus:outline-none focus:shadow-[0_3px_0_#FF7A59]"
              />
              <div className="mt-sx-sm flex items-center gap-sx-sm">
                <Button onClick={saveCustomWords} className="h-11 px-sx-md" data-testid="sx-custom-save">
                  Save words
                </Button>
                <Toggle
                  checked={settings!.custom_only}
                  onChange={(v) => actions.updateSettings({ custom_only: v })}
                  label="Use only custom words"
                  testId="sx-custom-only"
                />
                <span className="font-sx-body text-sx-body-sm text-sx-on-surface-variant">
                  Only custom words
                </span>
              </div>
              <p className="mt-2 font-sx-body text-sx-body-sm text-sx-on-surface-variant">
                Custom-only games need at least {MIN_CUSTOM_WORDS} words.
              </p>
            </Card>
          )}
        </section>

        {/* Match dynamics */}
        <section>
          <SectionHeading>Match dynamics</SectionHeading>
          <Card className="space-y-sx-md">
            <div>
              <p className="font-sx-display text-sx-label-md text-sx-on-surface-variant mb-1.5">Rounds</p>
              <SegmentedControl
                label="Rounds per game"
                testId="sx-rounds"
                disabled={!isHost}
                value={settings!.rounds}
                onChange={(v) => actions.updateSettings({ rounds: v })}
                options={ROUND_OPTIONS.map((n) => ({ value: n, label: `${n}` }))}
              />
            </div>
            <div>
              <p className="font-sx-display text-sx-label-md text-sx-on-surface-variant mb-1.5">Turn timer</p>
              <SegmentedControl
                label="Seconds per turn"
                testId="sx-turn-seconds"
                disabled={!isHost}
                value={settings!.turn_seconds}
                onChange={(v) => actions.updateSettings({ turn_seconds: v })}
                options={TURN_SECONDS_OPTIONS.map((n) => ({ value: n, label: `${n}s` }))}
              />
            </div>
            <div>
              <p className="font-sx-display text-sx-label-md text-sx-on-surface-variant mb-1.5">Max players</p>
              <Stepper
                label="players"
                testId="sx-max-players"
                disabled={!isHost}
                value={settings!.max_players}
                min={Math.max(MIN_MAX_PLAYERS, state.players.length)}
                max={MAX_MAX_PLAYERS}
                onChange={(v) => actions.updateSettings({ max_players: v })}
              />
            </div>
          </Card>
        </section>

        {/* Modifiers */}
        <section>
          <SectionHeading>Rules</SectionHeading>
          <Card className="divide-y-2 divide-sx-surface-container">
            {([
              ["letter_hints", "Letter hints", "Blanks fill in as time runs down"],
              ["three_word_choice", "Three word choice", "The drawer picks from three"],
              ["gentle_spelling", "Gentle spelling", "Near-misses still count"],
              ["is_private", "Private room", "Only people with the code can join"],
            ] as const).map(([key, title, blurb], i) => (
              <div key={key} className={`flex items-center gap-sx-sm ${i === 0 ? "pb-sx-sm" : "py-sx-sm"}`}>
                <span className="min-w-0 flex-1">
                  <span className="block font-sx-display text-sx-label-lg text-sx-ink">{title}</span>
                  <span className="block font-sx-body text-sx-body-sm text-sx-on-surface-variant">{blurb}</span>
                </span>
                <Toggle
                  label={title}
                  testId={`sx-toggle-${key}`}
                  disabled={!isHost}
                  checked={settings![key]}
                  onChange={(v) => actions.updateSettings({ [key]: v })}
                />
              </div>
            ))}
          </Card>
        </section>

        {/* Roster */}
        <section>
          <SectionHeading
            action={
              <Chip tone="lilac">
                {state.players.length}/{settings!.max_players}
              </Chip>
            }
          >
            Who&apos;s here
          </SectionHeading>
          <div className="grid gap-sx-sm sm:grid-cols-2">
            {state.players.map((player) => (
              <RosterCard
                key={player.id}
                player={player}
                isMe={player.id === seat?.player_id}
                canKick={isHost && player.id !== seat?.player_id}
                onKick={() => actions.kick(player.id)}
              />
            ))}
          </div>
        </section>
      </main>

      {/* Commit bar */}
      <div className="fixed inset-x-0 bottom-0 border-t-2 border-sx-ink bg-sx-cream/95 backdrop-blur px-sx-md py-sx-sm">
        <div className="mx-auto w-full max-w-2xl">
          {isHost ? (
            <>
              <Button
                disabled={!state.can_start}
                data-testid="sx-start-match"
                className="w-full"
                onClick={() => {
                  /* The game loop lands in the next change; the button is live but inert. */
                }}
              >
                Start the match
              </Button>
              {!state.can_start && state.start_blocked_reason && (
                <p
                  data-testid="sx-start-blocked"
                  className="mt-1.5 text-center font-sx-body text-sx-body-sm text-sx-on-surface-variant"
                >
                  {state.start_blocked_reason}
                </p>
              )}
            </>
          ) : (
            <Button
              variant={me?.ready ? "secondary" : "primary"}
              data-testid="sx-ready"
              className="w-full"
              onClick={() => actions.setReady(!me?.ready)}
            >
              {me?.ready ? "Ready — tap to undo" : "I'm ready"}
            </Button>
          )}
        </div>
      </div>

      {error && <Toast message={error} onDismiss={dismissError} />}
    </div>
  );
}

function RosterCard({
  player,
  isMe,
  canKick,
  onKick,
}: {
  player: RoomPlayer;
  isMe: boolean;
  canKick: boolean;
  onKick(): void;
}) {
  return (
    <div
      data-testid={`sx-player-${player.id}`}
      className={`flex items-center gap-sx-sm rounded-sx-md border-2 border-sx-ink bg-white p-sx-sm ${
        player.connected ? "" : "opacity-60"
      }`}
    >
      <AvatarDisc avatarId={player.avatar_id} hatId={player.hat_id} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-sx-display text-sx-label-lg text-sx-ink truncate">
          {player.name}
          {isMe && <span className="text-sx-on-surface-variant">(you)</span>}
          {player.is_host && <Crown size={14} weight="fill" className="text-sx-secondary" aria-label="Host" />}
        </p>
        <p className="font-sx-body text-sx-body-sm text-sx-on-surface-variant">
          {!player.connected ? "Away" : player.is_host ? "Host" : player.ready ? "Ready" : "Getting ready"}
        </p>
      </div>
      {canKick && (
        <button
          onClick={onKick}
          aria-label={`Remove ${player.name}`}
          data-testid={`sx-kick-${player.id}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-sx-ink bg-white hover:bg-sx-error-container"
        >
          <UserMinus size={14} weight="bold" />
        </button>
      )}
    </div>
  );
}
