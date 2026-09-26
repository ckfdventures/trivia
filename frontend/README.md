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

`NEXT_PUBLIC_BACKEND_URL` is inlined at build time, so set it before `npm run build`. The API's
`CORS_ORIGINS` must include this app's origin.

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
