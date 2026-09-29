/**
 * Platform and game identity.
 *
 * The platform name is deliberately a single constant: it currently doubles as the name of the
 * trivia game that predates the platform, so renaming it later should be a one-line change.
 */

export const PLATFORM_NAME = "TriviaStream";

export type GameId = "trivia" | "scribblex";

export interface GameBrand {
  id: GameId;
  /** Name shown to players inside the platform shell. */
  name: string;
  /** One line describing what a player actually does. */
  tagline: string;
  /** Whether the game is playable, or only announced on the home page. */
  status: "live" | "soon";
}

export const GAMES: Record<GameId, GameBrand> = {
  trivia: {
    id: "trivia",
    name: "Trivia",
    tagline: "Buzz in before anyone else does.",
    status: "live",
  },
  scribblex: {
    id: "scribblex",
    name: "ScribbleX",
    tagline: "One of you draws. Everyone else guesses.",
    status: "soon",
  },
};
