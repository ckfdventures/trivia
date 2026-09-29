/**
 * Game sounds, synthesised rather than loaded.
 *
 * A handful of short tones need no audio files, nothing to host or license, and no request
 * that might not have arrived by the time a turn starts. They are also trivially tunable.
 *
 * Off until the player turns them on (PRD §13.10): browsers block audio before a gesture
 * anyway, and a game that makes noise the moment it loads is a game people mute.
 */

export type SoundName =
  | "correct"       // you got it
  | "someoneGot"    // somebody else got it
  | "turnStart"
  | "tick"          // the last few seconds
  | "timeUp"
  | "matchEnd";

const STORAGE_KEY = "sx_sound_on";

export function isSoundOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode; the preference just won't be remembered */
  }
}

/** One note. */
interface Note {
  /** Hz. */
  freq: number;
  /** Seconds from the start of the sound. */
  at: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

/**
 * Each sound as a short sequence. Kept deliberately brief — these fire during play, and
 * anything with a tail steps on the next thing that happens.
 */
const SOUNDS: Record<SoundName, Note[]> = {
  // Rising major triad: unmistakably "you did the thing".
  correct: [
    { freq: 523.25, at: 0, duration: 0.09 },
    { freq: 659.25, at: 0.08, duration: 0.09 },
    { freq: 783.99, at: 0.16, duration: 0.16 },
  ],
  // Someone else scoring is information, not celebration, so it stays quiet and flat.
  someoneGot: [{ freq: 587.33, at: 0, duration: 0.09, gain: 0.35 }],
  turnStart: [
    { freq: 440, at: 0, duration: 0.07 },
    { freq: 660, at: 0.06, duration: 0.11 },
  ],
  // A dry click, not a tone: it repeats once a second and must not become a melody.
  tick: [{ freq: 1100, at: 0, duration: 0.028, type: "square", gain: 0.18 }],
  timeUp: [
    { freq: 392, at: 0, duration: 0.11 },
    { freq: 294, at: 0.1, duration: 0.2 },
  ],
  matchEnd: [
    { freq: 523.25, at: 0, duration: 0.1 },
    { freq: 659.25, at: 0.09, duration: 0.1 },
    { freq: 783.99, at: 0.18, duration: 0.1 },
    { freq: 1046.5, at: 0.27, duration: 0.28 },
  ],
};

const MASTER_GAIN = 0.16;

let context: AudioContext | null = null;

/** The audio context, created on first use — which is always inside a gesture. */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    // Browsers suspend the context when a tab is backgrounded.
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

/**
 * Play a sound, if the player has asked for sound at all.
 *
 * Never throws and never blocks: a game that breaks because audio is unavailable is worse
 * than a silent one.
 */
export function playSound(name: SoundName): void {
  if (!isSoundOn()) return;
  const ctx = audio();
  if (!ctx) return;

  try {
    const start = ctx.currentTime;
    for (const note of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type ?? "sine";
      osc.frequency.value = note.freq;

      const level = MASTER_GAIN * (note.gain ?? 1);
      const from = start + note.at;
      const to = from + note.duration;
      // A short ramp either side: a square-edged gain change is an audible click.
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(level, from + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, to);

      osc.connect(gain).connect(ctx.destination);
      osc.start(from);
      osc.stop(to + 0.02);
    }
  } catch {
    /* audio is a nicety; never let it interrupt a turn */
  }
}

/** Called when the player turns sound on, so the first real sound is not the one that unlocks it. */
export function primeSound(): void {
  const ctx = audio();
  if (ctx?.state === "suspended") void ctx.resume();
}
