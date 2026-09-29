"use client";

import { findAvatar, findHat } from "../../lib/scribblex/profile";

/**
 * A player's avatar.
 *
 * Placeholder art: a tinted disc with an emoji, which PRD §6.2 allows until illustrated
 * avatars exist. The hat rides as a small badge on the corner so equipping one is visible at
 * roster size, not just on the big preview.
 */
export function AvatarDisc({
  avatarId,
  hatId = null,
  size = 48,
  className,
}: {
  avatarId: string;
  hatId?: string | null;
  size?: number;
  className?: string;
}) {
  const avatar = findAvatar(avatarId);
  const hat = findHat(hatId);

  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      <div
        className="grid h-full w-full place-items-center rounded-full border-2 border-sx-ink"
        style={{ backgroundColor: avatar.tint, fontSize: size * 0.5 }}
        role="img"
        aria-label={avatar.name}
      >
        <span aria-hidden="true">{avatar.emoji}</span>
      </div>
      {hat && (
        <span
          aria-hidden="true"
          title={hat.name}
          className="absolute -right-1 -top-1 grid place-items-center rounded-full border-[1.5px] border-sx-ink bg-white"
          style={{ width: size * 0.42, height: size * 0.42, fontSize: size * 0.22 }}
        >
          {hat.emoji}
        </span>
      )}
    </div>
  );
}
