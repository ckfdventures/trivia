"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowsClockwise, Check, Lock } from "@phosphor-icons/react";
import { AvatarDisc } from "../../components/scribblex/AvatarDisc";
import { Button, Card, Chip, TextField, Toast } from "../../components/scribblex/ui";
import { errorMessage } from "../../lib/api";
import { routes } from "../../lib/routes";
import { createRoom, joinRoom, quickPlay } from "../../lib/scribblex/api";
import {
  AVATARS,
  HATS,
  isUnlocked,
  levelFor,
  levelProgress,
  XP_PER_LEVEL,
  loadPreset,
  loadProfile,
  loadXp,
  randomProfile,
  saveProfile,
  saveSeat,
} from "../../lib/scribblex/profile";
import type { Profile as ProfileT, Seat } from "../../lib/scribblex/types";
import { MAX_NAME_LENGTH } from "../../lib/scribblex/constants";

/**
 * "Pick Your Sketcher" — the one step between landing and playing.
 *
 * The screen doubles as the gate in front of every entry path, so it carries the intent it was
 * opened with (`create`, `join`, `quick`) and performs it on save rather than bouncing the
 * player back to the home page to press the same button twice.
 */

type Intent = "create" | "join" | "quick";
type Tab = "avatars" | "hats" | "expressions" | "themes";

const TABS: { id: Tab; label: string; ready: boolean }[] = [
  { id: "avatars", label: "Avatars", ready: true },
  { id: "hats", label: "Hats & Gear", ready: true },
  { id: "expressions", label: "Expressions", ready: false },
  { id: "themes", label: "Themes", ready: false },
];

export default function Profile() {
  const router = useRouter();
  const params = useSearchParams();
  const intent = (params.get("intent") as Intent | null) ?? "quick";
  const code = params.get("code") ?? "";

  // This screen never server-renders (see avatar/ProfileClient.tsx), so localStorage is
  // available on the first render and needs no effect to hydrate from.
  const [xp] = useState(() => loadXp());
  const [profile, setProfile] = useState<ProfileT>(() => loadProfile() ?? randomProfile(loadXp()));
  const [tab, setTab] = useState<Tab>("avatars");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = useMemo(() => levelFor(xp), [xp]);
  const progress = useMemo(() => levelProgress(xp), [xp]);
  const unlockedCount = useMemo(() => AVATARS.filter((a) => isUnlocked(a, xp)).length, [xp]);

  const patch = (next: Partial<ProfileT>) => setProfile((p) => ({ ...p, ...next }));

  const save = async () => {
    const name = profile.name.trim();
    if (!name) {
      setError("Pick a name first.");
      return;
    }
    setBusy(true);
    setError(null);
    const clean: ProfileT = { ...profile, name };
    saveProfile(clean);

    try {
      let seat: Seat;
      if (intent === "join") seat = await joinRoom(code, clean);
      // A host's saved settings, so they do not rebuild the same room every time.
      else if (intent === "create") seat = await createRoom(clean, loadPreset() ?? undefined);
      else seat = await quickPlay(clean);

      saveSeat({ code: seat.code, player_id: seat.player_id, session_token: seat.session_token });
      router.replace(routes.scribblex.room(seat.code));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen sx-dots pb-32">
      <header className="mx-auto w-full max-w-2xl px-sx-md pt-sx-md flex items-center justify-between gap-sx-sm">
        <button
          onClick={() => router.push(routes.home)}
          data-testid="sx-profile-back"
          aria-label="Back"
          className="press grid h-11 w-11 place-items-center rounded-full bg-white border-[2.5px] border-sx-ink shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <div className="flex items-center gap-sx-sm">
          <Chip tone="butter" data-testid="sx-level">
            Level {level}
          </Chip>
          {/* Shows the level is something being earned, not a badge that never moves. */}
          <div
            className="h-2.5 w-24 overflow-hidden rounded-full border-2 border-sx-ink bg-white"
            role="progressbar"
            aria-valuenow={xp % XP_PER_LEVEL}
            aria-valuemin={0}
            aria-valuemax={XP_PER_LEVEL}
            aria-label={`Progress to level ${level + 1}`}
          >
            <div className="h-full bg-sx-coral" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-sx-md pt-sx-lg">
        <h1 className="font-sx-display text-sx-hero-m sm:text-sx-headline-lg text-sx-ink">
          Pick your sketcher
        </h1>
        <p className="font-sx-body text-sx-body-md text-sx-on-surface-variant mt-1.5">
          This is how everyone sees you on the leaderboard.
        </p>

        {/* Preview */}
        <Card tinted className="mt-sx-md flex items-center gap-sx-md">
          <AvatarDisc avatarId={profile.avatar_id} hatId={profile.hat_id} size={88} />
          <div className="min-w-0 flex-1">
            <label htmlFor="sx-name" className="font-sx-display text-sx-label-md text-sx-on-surface-variant block mb-1.5">
              Display name
            </label>
            <TextField
              id="sx-name"
              value={profile.name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="DoodleFox"
              data-testid="sx-name-input"
            />
            <button
              onClick={() => setProfile(randomProfile(xp))}
              data-testid="sx-shuffle"
              className="mt-sx-sm inline-flex items-center gap-1.5 font-sx-display text-sx-label-md text-sx-primary hover:underline"
            >
              <ArrowsClockwise size={14} weight="bold" /> Shuffle everything
            </button>
          </div>
        </Card>

        {/* Tabs */}
        <div role="tablist" aria-label="Customise" className="mt-sx-lg flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              data-testid={`sx-tab-${t.id}`}
              className={`shrink-0 rounded-full border-2 border-sx-ink px-sx-md h-10 font-sx-display text-sx-label-md transition-colors ${
                tab === t.id ? "bg-sx-primary text-white" : "bg-white text-sx-ink hover:bg-sx-surface-container"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "avatars" && (
          <section className="mt-sx-md" aria-label="Sketcher gallery">
            <div className="flex items-center justify-between mb-sx-sm">
              <h2 className="font-sx-display text-sx-headline-sm text-sx-ink">Sketchers</h2>
              <Chip tone="mint">{unlockedCount} unlocked</Chip>
            </div>
            <div className="grid grid-cols-2 gap-sx-sm">
              {AVATARS.map((avatar) => {
                const unlocked = isUnlocked(avatar, xp);
                const selected = avatar.id === profile.avatar_id;
                return (
                  <button
                    key={avatar.id}
                    disabled={!unlocked}
                    onClick={() => patch({ avatar_id: avatar.id })}
                    data-testid={`sx-avatar-${avatar.id}`}
                    aria-pressed={selected}
                    className={`press relative flex flex-col items-center gap-2 rounded-sx-md border-2 p-sx-md bg-white
                      ${selected ? "border-sx-coral shadow-sticker" : "border-sx-ink shadow-[0_4px_0_rgba(43,38,45,0.12)]"}
                      disabled:cursor-not-allowed disabled:opacity-55 disabled:translate-y-0`}
                  >
                    {selected && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-sx-coral border-[1.5px] border-sx-ink">
                        <Check size={12} weight="bold" />
                      </span>
                    )}
                    {!unlocked && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-sx-secondary-fixed border-[1.5px] border-sx-ink">
                        <Lock size={11} weight="bold" />
                      </span>
                    )}
                    <AvatarDisc avatarId={avatar.id} size={64} />
                    <span className="font-sx-display text-sx-label-lg text-sx-ink text-center">{avatar.name}</span>
                    <span className="font-sx-body text-sx-body-sm text-sx-on-surface-variant text-center">
                      {avatar.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {tab === "hats" && (
          <section className="mt-sx-md" aria-label="Headgear">
            <h2 className="font-sx-display text-sx-headline-sm text-sx-ink mb-sx-sm">Headgear</h2>
            <div className="flex flex-wrap gap-sx-sm">
              <button
                onClick={() => patch({ hat_id: null })}
                aria-pressed={profile.hat_id === null}
                data-testid="sx-hat-none"
                className={`rounded-full border-2 px-sx-md h-11 font-sx-display text-sx-label-md bg-white
                  ${profile.hat_id === null ? "border-sx-coral" : "border-sx-ink"}`}
              >
                None
              </button>
              {HATS.map((hat) => (
                <button
                  key={hat.id}
                  onClick={() => patch({ hat_id: hat.id })}
                  aria-pressed={profile.hat_id === hat.id}
                  data-testid={`sx-hat-${hat.id}`}
                  className={`inline-flex items-center gap-2 rounded-full border-2 px-sx-md h-11 font-sx-display text-sx-label-md bg-white
                    ${profile.hat_id === hat.id ? "border-sx-coral" : "border-sx-ink"}`}
                >
                  <span aria-hidden="true">{hat.emoji}</span>
                  {hat.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {(tab === "expressions" || tab === "themes") && (
          <Card className="mt-sx-md text-center">
            <p className="font-sx-body text-sx-body-md text-sx-on-surface-variant">
              Not built yet — avatars and headgear are what you can change for now.
            </p>
          </Card>
        )}
      </main>

      {/* Sticky commit bar */}
      <div className="fixed inset-x-0 bottom-0 border-t-2 border-sx-ink bg-sx-cream/95 backdrop-blur px-sx-md py-sx-sm">
        <div className="mx-auto w-full max-w-2xl">
          <Button onClick={save} disabled={busy} data-testid="sx-save-profile" className="w-full">
            {busy ? "Getting you in…" : intent === "join" ? "Join the room" : "Save and play"}
          </Button>
        </div>
      </div>

      {error && <Toast message={error} onDismiss={() => setError(null)} />}
    </div>
  );
}
