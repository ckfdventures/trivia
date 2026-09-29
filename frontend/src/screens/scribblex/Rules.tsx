"use client";

import Link from "next/link";
import { Card, Chip } from "../../components/scribblex/ui";
import { ScribbleNav } from "../../components/scribblex/ScribbleNav";
import { routes } from "../../lib/routes";

/**
 * How to play.
 *
 * Written for someone who has just been sent a room link and has thirty seconds before the
 * first turn starts — so it leads with what they do, not with how scoring works.
 */

const STEPS = [
  {
    title: "Everyone takes a turn drawing",
    body: "When it's yours, you pick a word from three and draw it. No letters, no numbers — that's the whole challenge.",
  },
  {
    title: "Everyone else guesses",
    body: "Type into the chat. Wrong guesses are just chat; the right one scores and tells the room you got it, without showing what you typed.",
  },
  {
    title: "Faster is worth more",
    body: "A correct guess is worth between 50 and 300, depending on how much time was left. The drawer earns 50 for every player who gets it.",
  },
  {
    title: "The blanks fill in",
    body: "If letter hints are on, a letter is revealed halfway through the turn and again near the end.",
  },
];

const RULES = [
  ["Gentle spelling", "A near miss counts, for three quarters of the points. Off, and it only tells you that you were close."],
  ["Letter hints", "Reveals a letter as the clock runs down."],
  ["Three word choice", "The drawer picks from three words instead of being handed one."],
  ["Private party", "The room stays off the public list. People can still join with the code."],
];

export default function Rules() {
  return (
    <div className="min-h-screen sx-dots pb-28">
      <main className="mx-auto w-full max-w-2xl px-sx-md pt-sx-lg">
        <Chip tone="lilac" className="sx-tilt-a">
          How to play
        </Chip>
        <h1 className="font-sx-display text-sx-hero-m text-sx-ink mt-sx-md">
          One of you draws. Everyone else guesses.
        </h1>

        <ol className="mt-sx-lg space-y-sx-sm">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Card className="flex gap-sx-sm">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-sx-ink bg-sx-secondary-fixed font-sx-display text-sx-label-lg"
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block font-sx-display text-sx-headline-sm text-sx-ink">{step.title}</span>
                  <span className="block font-sx-body text-sx-body-md text-sx-on-surface-variant mt-1">
                    {step.body}
                  </span>
                </span>
              </Card>
            </li>
          ))}
        </ol>

        <h2 className="font-sx-display text-sx-headline-md text-sx-ink mt-sx-xl">Things the host can change</h2>
        <Card tinted className="mt-sx-sm divide-y-2 divide-sx-surface-container">
          {RULES.map(([name, blurb], i) => (
            <div key={name} className={i === 0 ? "pb-sx-sm" : "py-sx-sm"}>
              <p className="font-sx-display text-sx-label-lg text-sx-ink">{name}</p>
              <p className="font-sx-body text-sx-body-sm text-sx-on-surface-variant">{blurb}</p>
            </div>
          ))}
        </Card>

        <h2 className="font-sx-display text-sx-headline-md text-sx-ink mt-sx-xl">Keeping it friendly</h2>
        <p className="font-sx-body text-sx-body-md text-sx-on-surface-variant mt-sx-sm">
          Names and chat run through a language filter, and the host can remove anyone from their
          room. Public rooms are named from a fixed list, so nobody names one themselves.
        </p>

        <div className="mt-sx-lg flex flex-wrap gap-sx-sm">
          <Link
            href={routes.scribblex.browse}
            data-testid="sx-rules-browse"
            className="press inline-flex h-14 items-center rounded-full bg-sx-coral text-sx-ink border-[2.5px] border-sx-ink px-sx-lg font-sx-display text-sx-label-lg shadow-sticker hover:shadow-sticker-hover active:shadow-sticker-press"
          >
            Find a room
          </Link>
          <Link
            href={routes.home}
            className="inline-flex h-14 items-center rounded-full border-2 border-sx-ink/35 px-sx-lg font-sx-display text-sx-label-lg text-sx-ink hover:bg-sx-ink hover:text-sx-cream transition-colors"
          >
            All games
          </Link>
        </div>
      </main>

      <ScribbleNav />
    </div>
  );
}
