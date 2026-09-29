import { randomInt } from "node:crypto";

/**
 * Names for public rooms.
 *
 * Chosen from a fixed list rather than typed by a player: a room name is shown to strangers
 * browsing for a game, and a free-text field there is an invitation to misuse it. PRD §9.
 */

export interface RoomIdentity {
  name: string;
  emoji: string;
}

const NAMES = [
  "Doodle Lounge",
  "Sketch Club",
  "The Scribble Pit",
  "Pencil Chaos",
  "Marker Mayhem",
  "Crayon Corner",
  "Line Art Only",
  "Stick Figure Society",
  "Wobbly Circles",
  "Draw Something Awful",
  "Vibe Check",
  "Late Night Doodles",
  "Chaotic Neutral",
  "Art Class Dropouts",
  "Guess Faster",
  "Shapes and Vibes",
  "Squiggle Squad",
  "Canvas Crew",
  "Rough Sketch",
  "Perfectly Fine Art",
  "No Talent Required",
  "Quick Draw",
  "Doodle Jam",
  "Scribble Season",
] as const;

const EMOJI = ["🎨", "✏️", "🖍️", "🖌️", "🎪", "🪄", "🌀", "⚡", "🔥", "🌈", "🎭", "🧩"] as const;

/** A name and emoji for a new room. Not unique — two rooms may share a name, and that is fine. */
export function randomRoomIdentity(): RoomIdentity {
  return {
    name: NAMES[randomInt(NAMES.length)]!,
    emoji: EMOJI[randomInt(EMOJI.length)]!,
  };
}
