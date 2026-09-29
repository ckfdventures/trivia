import { describe, expect, it } from "vitest";
import {
  AVATARS,
  HATS,
  XP_PER_CORRECT_GUESS,
  XP_PER_LEVEL,
  XP_PER_MATCH,
  findAvatar,
  findHat,
  isUnlocked,
  levelFor,
  levelProgress,
  randomName,
  randomProfile,
} from "./profile";

/** Guest progression, which lives entirely in the browser (PRD §13.7). */

describe("levels", () => {
  it("starts everyone at level 1", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelProgress(0)).toBe(0);
  });

  it("advances a level per XP_PER_LEVEL", () => {
    expect(levelFor(XP_PER_LEVEL - 1)).toBe(1);
    expect(levelFor(XP_PER_LEVEL)).toBe(2);
    expect(levelFor(XP_PER_LEVEL * 4)).toBe(5);
  });

  it("reports progress through the current level", () => {
    expect(levelProgress(XP_PER_LEVEL / 2)).toBeCloseTo(0.5);
    // Crossing a level resets the bar rather than leaving it full.
    expect(levelProgress(XP_PER_LEVEL)).toBe(0);
  });

  it("awards enough that the locked avatar is actually reachable", () => {
    const owl = AVATARS.find((a) => a.unlockLevel)!;
    const xpNeeded = (owl.unlockLevel! - 1) * XP_PER_LEVEL;

    // A player who only ever finishes matches still gets there; this is the check that the
    // locked avatar is a goal rather than decoration.
    expect(XP_PER_MATCH).toBeGreaterThan(0);
    expect(Math.ceil(xpNeeded / XP_PER_MATCH)).toBeLessThan(100);
    expect(XP_PER_CORRECT_GUESS).toBeGreaterThan(0);
  });
});

describe("unlocks", () => {
  it("keeps the locked avatar locked until its level", () => {
    const owl = AVATARS.find((a) => a.unlockLevel)!;
    const justBelow = (owl.unlockLevel! - 1) * XP_PER_LEVEL - 1;

    expect(isUnlocked(owl, justBelow)).toBe(false);
    expect(isUnlocked(owl, justBelow + 1)).toBe(true);
  });

  it("leaves every other avatar available from the start", () => {
    for (const avatar of AVATARS.filter((a) => !a.unlockLevel)) {
      expect(isUnlocked(avatar, 0)).toBe(true);
    }
  });
});

describe("lookups", () => {
  it("falls back to the first avatar rather than rendering nothing", () => {
    expect(findAvatar("does-not-exist")).toBe(AVATARS[0]);
    expect(findAvatar(AVATARS[2]!.id).id).toBe(AVATARS[2]!.id);
  });

  it("treats no hat and an unknown hat the same", () => {
    expect(findHat(null)).toBeNull();
    expect(findHat("does-not-exist")).toBeNull();
    expect(findHat(HATS[0]!.id)?.id).toBe(HATS[0]!.id);
  });
});

describe("random profiles", () => {
  it("never offers a locked avatar to a new player", () => {
    for (let i = 0; i < 60; i++) {
      const profile = randomProfile(0);
      expect(isUnlocked(findAvatar(profile.avatar_id), 0)).toBe(true);
    }
  });

  it("produces a name that fits the field", () => {
    for (let i = 0; i < 40; i++) {
      const name = randomName();
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(16);
    }
  });
});
