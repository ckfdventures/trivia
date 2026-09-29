# TriviaStream web app

Next.js (App Router) + TypeScript + Tailwind CSS. Talks to the API in [`../backend`](../backend) over
REST and Socket.IO.

## Getting started

```bash
cp .env.example .env.local   # point NEXT_PUBLIC_BACKEND_URL at the API
npm install
npm run dev                  # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) — needs the API running on :8001 |

`NEXT_PUBLIC_BACKEND_URL` is inlined at build time, so set it before `npm run build`. The API's
`CORS_ORIGINS` must include this app's origin. Entries there may contain `*` as a wildcard
(`https://app-*.vercel.app`), which is how preview deployments — each on its own hostname — are
allowed without listing them one by one.

## Browser tests

```bash
npx playwright install chromium   # once
npm run e2e
```

They drive a real browser against a running stack, so the API must be up on `:8001` with its
database behind it; the web app is started by the test run if it is not already. Set
`E2E_ADMIN_PASSWORD` (and `E2E_ADMIN_EMAIL` if it is not the local default) to include the test
that edits a word deck through the admin API and checks it reaches a lobby; without it that one
test skips. Two browser
contexts play against each other, and the canvas is checked by drawing on it and reading the
pixels back — the only way to catch a stroke that renders as disconnected dots, which is
exactly how that bug reached a player.

## Structure

```
src/
  app/          routes (thin server components that set the page title and render a screen)
  screens/      page UIs — client components (players, hosts, admin)
  components/   shared UI (logo, answer shapes, modals, admin layout)
  hooks/        useRoomSocket (Socket.IO room state), useServerCountdown (server-synced timer)
  lib/          API client, auth context, API types, navigation helpers
```

| Route | Screen |
| --- | --- |
| `/` | Landing (join with a PIN; admin login link in the footer) |
| `/host/create` → `/host/lobby/[pin]` → `/host/game/[pin]` | Pick a theme or Mix + question count, lobby with invite link, live game |
| `/play`, `/play/[pin]` → `/play/[pin]/lobby` → `/play/[pin]/game` | Join by PIN/invite link, wait, play |
| `/admin/login`, `/admin/themes`, `/admin/upload` | Owner sign-in, theme management, question-bank upload |

Game sessions (host token, player session token) are kept in `localStorage` per PIN, so a refresh
or brief disconnect rejoins the same game.

## Design and mobile

The visual language lives in `src/app/globals.css` (stage gradient, grain, arcade buttons, fonts:
Outfit for display, Nunito for body) and Tailwind utility classes. Layouts are mobile-first: player
screens are built for phones, host and admin screens adapt below the `sm`/`md` breakpoints, and the
answer grid switches to a single row on short (landscape) screens.
