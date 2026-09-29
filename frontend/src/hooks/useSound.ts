"use client";

import { useCallback, useState } from "react";
import { isSoundOn, primeSound, setSoundOn } from "../lib/scribblex/sound";

/**
 * The player's sound preference.
 *
 * Read once at mount rather than in an effect: the screens that use this are client-only, so
 * `localStorage` is available on the first render.
 */
export function useSound(): { on: boolean; toggle(): void } {
  const [on, setOn] = useState(() => isSoundOn());

  const toggle = useCallback(() => {
    setOn((wasOn) => {
      const next = !wasOn;
      setSoundOn(next);
      // Unlock the audio context inside this gesture, so the first real sound is not the one
      // waiting on the browser's autoplay rules.
      if (next) primeSound();
      return next;
    });
  }, []);

  return { on, toggle };
}
