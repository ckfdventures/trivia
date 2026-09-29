"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ListMagnifyingGlass, Question } from "@phosphor-icons/react";
import { routes } from "../../lib/routes";

/**
 * Navigation across ScribbleX's standalone screens.
 *
 * Deliberately not shown in a lobby or a match: those are immersive, they have their own way
 * out, and a tab bar under a canvas is a tab bar you press by accident while drawing.
 *
 * The PRD's fourth tab, Badges, is left out rather than shipped as a link to "coming soon" —
 * a tab that goes nowhere is worse than one fewer tab.
 */
const TABS = [
  { href: routes.scribblex.home, label: "Play", Icon: House },
  { href: routes.scribblex.browse, label: "Rooms", Icon: ListMagnifyingGlass },
  { href: routes.scribblex.rules, label: "Rules", Icon: Question },
];

export function ScribbleNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ScribbleX"
      data-testid="sx-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-sx-ink bg-sx-cream/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-2xl items-stretch justify-around px-sx-sm py-2">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              data-testid={`sx-nav-${label.toLowerCase()}`}
              className={`flex min-w-[72px] flex-col items-center gap-0.5 rounded-sx px-sx-sm py-1.5 font-sx-display text-sx-label-md transition-colors ${
                active ? "bg-sx-primary text-white" : "text-sx-on-surface-variant hover:bg-sx-surface-container"
              }`}
            >
              <Icon size={20} weight={active ? "fill" : "bold"} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
