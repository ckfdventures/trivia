"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { GAMES } from "../../lib/brand";
import { ScribbleNav } from "../../components/scribblex/ScribbleNav";
import { routes } from "../../lib/routes";

/**
 * ScribbleX's front door while the game itself is being built.
 *
 * This is the first screen rendered in the game's own skin (Warm Doodle Pop): Plus Jakarta
 * Sans and Quicksand, cream paper, coral, and the sticker elevation that carries through the
 * rest of the game. The platform shell's typeface stops at the gate.
 */
export default function ScribbleXIntro() {
  return (
    <div className="min-h-screen sx-dots pb-28">
      <header className="mx-auto w-full max-w-3xl px-sx-md pt-sx-md">
        <Link
          href={routes.home}
          data-testid="sx-back-home"
          className="press inline-flex items-center gap-2 h-11 rounded-full bg-white border-[2.5px] border-sx-ink px-sx-md font-sx-display text-sx-label-lg shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-coral"
        >
          <ArrowLeft size={16} weight="bold" />
          Back
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-sx-md pb-sx-xl pt-sx-lg">
        <span className="sx-tilt-a inline-block rounded-full bg-sx-butter border-[1.5px] border-sx-ink px-sx-sm py-1 font-sx-display text-sx-label-md">
          In development
        </span>

        <h1 className="font-sx-display text-sx-hero-m sm:text-sx-hero text-sx-ink mt-sx-md">
          {GAMES.scribblex.name}
        </h1>
        <p className="font-sx-body text-sx-body-lg text-sx-on-surface-variant mt-sx-sm max-w-[52ch]">
          {GAMES.scribblex.tagline} Guess fastest and you score most — and whoever drew scores
          for every player who got it.
        </p>

        <div className="mt-sx-lg grid gap-sx-sm sm:grid-cols-3">
          {[
            {
              title: "Pick a word",
              body: "The drawer chooses from three, then has the turn timer to get it across.",
              bg: "bg-sx-primary-fixed",
            },
            {
              title: "Draw it",
              body: "Brush, marker, eraser and fill on a shared canvas everyone watches live.",
              bg: "bg-sx-tertiary-fixed",
            },
            {
              title: "Guess it",
              body: "Type into chat. Close spellings still count when Gentle Spelling is on.",
              bg: "bg-sx-secondary-fixed",
            },
          ].map((step) => (
            <div
              key={step.title}
              className={`${step.bg} rounded-sx-md border-[2px] border-sx-ink p-sx-md shadow-sticker`}
            >
              <h2 className="font-sx-display text-sx-headline-sm text-sx-ink">{step.title}</h2>
              <p className="font-sx-body text-sx-body-sm text-sx-on-surface-variant mt-1.5">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <p className="font-sx-body text-sx-body-md text-sx-on-surface-variant mt-sx-lg">
          Rooms, drawing and scoring are being built now. Trivia is ready to play in the
          meantime.
        </p>
        <Link
          href={routes.trivia.home}
          data-testid="sx-play-trivia"
          className="press mt-sx-md inline-flex items-center h-14 rounded-full bg-sx-coral text-sx-ink border-[2.5px] border-sx-ink px-sx-lg font-sx-display text-sx-label-lg shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sx-ink"
        >
          Play Trivia
        </Link>
      </main>
          <ScribbleNav />
    </div>
  );
}
