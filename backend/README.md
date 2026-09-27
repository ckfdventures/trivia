# TriviaStream API

Express 5 + Socket.IO + MongoDB, written in TypeScript.

## Getting started

```bash
cp .env.example .env   # then edit values
npm install
npm run dev            # watch mode on :8001
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run from source with reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm test` | Unit + integration tests (needs MongoDB at `MONGO_URL`, default `mongodb://localhost:27017`) |
| `npm run typecheck` / `npm run lint` | Static checks |

Environment variables are documented in [`.env.example`](.env.example). `MONGO_URL`, `DB_NAME`, `JWT_SECRET`,
`ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ characters) are required; the server refuses to start without them.

## Architecture

```
src/
  server.ts            bootstrap: config, Mongo, HTTP + Socket.IO, jobs, graceful shutdown
  app.ts               Express app: middleware + routers under /api
  container.ts         composition root — the only place concrete classes are wired together
  config/              env parsing/validation
  domain/              pure game model: room state, scoring, leaderboard, public room view
  repositories/        persistence interfaces + MongoDB implementations
  services/            business logic (auth, themes, question import, game lifecycle, presence, …)
  http/                routers, request schemas (zod), auth + error middleware
  realtime/            Socket.IO gateway (adapts sockets to the RoomConnection interface)
  jobs/                interval jobs: stale-room cleanup
  scripts/             one-off maintenance scripts (legacy data migration)
  shared/              small cross-cutting helpers (errors, time, ids, logger)
```

Dependencies point inward: routes and the socket gateway call services; services depend on repository
and collaborator *interfaces* (`ThemeRepository`, `QuestionSource`, `TokenService`, `RoomConnection`, …);
only `container.ts` knows the MongoDB/bcrypt/JWT/Socket.IO implementations.

Live game state (rooms, players, answers, timers) is held in memory by `RoomStore`, so the API must run
as a **single instance**.

## How it works

- The **owner** (users with `role: "admin"`, seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD`) signs in and
  manages **themes** and their **question pools**, uploading CSV/JSON question banks into a theme.
- **Hosts** need no account: they pick a theme (or `theme_id: null` for a mix of all themes) and a
  number of questions; the room gets that many questions drawn at random. Players join with the
  6-digit PIN or the invite link `/play/<pin>`.
- Live game state is in memory only; nothing about finished games is stored.

## HTTP API

All routes are under `/api`. Errors are `{ "detail": string }`; request validation errors are `422`
with `{ "detail": [{ type, loc, msg }] }`.

| Method & path | Auth | |
| --- | --- | --- |
| `POST /auth/login` | – | admins only; returns `{ token, user }` |
| `GET /auth/me`, `POST /auth/logout` | bearer | |
| `GET /themes` | – | `[{ id, name, question_count }]` |
| `POST /rooms` `{ theme_id \| null, question_count }` | – | returns `{ pin, host_token, host_id, room }` |
| `GET /rooms/:pin` · `POST /rooms/:pin/join` `{ nickname }` | – | |
| `POST /rooms/:pin/{start,next,skip,end}?host_token=` | host token | |
| `POST /rooms/:pin/answer` | player session | |
| `POST /rooms/:pin/voice/mute-all?host_token=` | host token | turns off every voice member's mic except the playing host's |
| `GET/POST /admin/themes` · `PATCH/DELETE /admin/themes/:id` | admin | deleting a theme deletes its questions |
| `GET /admin/themes/:id/questions` · `DELETE /admin/questions/:id` | admin | |
| `POST /admin/question-bank/upload` (multipart `file`, ≤ 2 MB) | admin | validates and previews rows; saves nothing |
| `POST /admin/question-bank/import` `{ theme_id \| theme_name, questions }` | admin | `theme_name` creates the theme if needed |

Question-bank files need `text`, `option1`–`option4` and `correct_option` (1–4, or the option's
text); `time_limit` (5–120s, default 20) is optional. A `correct_index` column is read as 0–3.

### Migrating data from the old backend

Quizzes created with the previous (FastAPI) version can be copied into an "Uncategorized" theme:

```bash
npm run migrate:quizzes   # idempotent; leaves the old collections untouched
```

## Realtime (Socket.IO)

```js
import { io } from "socket.io-client";
const socket = io(BACKEND_URL, {
  path: "/api/socket.io",
  auth: { pin, role: "host" | "player", token }, // host_token, or the player's secret session_token
});
```

Server → client events:

| Event | Payload |
| --- | --- |
| `room_state` | full public room snapshot (sent on connect and on every change) |
| `game_started` | `{ pin }` |
| `answer_received` | `{ answers_received, total_players }` |
| `promoted_to_host` | `{ pin, host_token, host_id }` — only to the promoted player |
| `host_changed` | `{ nickname }` |
| `error` | `{ message }` — invalid handshake; the server then disconnects |

If the host is disconnected for 20s, the first connected player is promoted to host. They keep playing: their
player entry follows the new host connection, as for a host who plays along.

### Voice chat

Players (including a host who plays along) can talk in a voice channel of up to 8. Audio goes directly between
browsers over WebRTC (a full mesh); the server only assigns slots, relays connection-setup messages and hands out
ICE servers (Cloudflare TURN when `CLOUDFLARE_TURN_KEY_ID`/`CLOUDFLARE_TURN_API_TOKEN` are set, else public STUN).
Voice uses its own socket, so it survives page changes and never affects game presence:

```js
io(BACKEND_URL, { path: "/api/socket.io", auth: { pin, role: "voice", token: playerSessionToken } });
```

| Direction | Event | Payload |
| --- | --- | --- |
| → server | `voice:join` | `{ session_id, mic_on, speaker_on }` — take a slot; `session_id` is new per join |
| → server | `voice:leave` | — |
| → server | `voice:state` | `{ mic_on, speaker_on }` |
| → server | `voice:signal` | `{ to, to_session, data }` — relayed only to a member of the same room |
| ← client | `voice:roster` | `{ capacity, members: [{ player_id, session_id, mic_on, speaker_on, connected }] }` |
| ← client | `voice:joined` | `{ session_id, ice_servers }` |
| ← client | `voice:full` | `{ capacity }` |
| ← client | `voice:signal` | `{ from, from_session, to_session, data }` — `from` is set by the server, never the sender |
| ← client | `voice:muted_by_host` | `{}` |

A disconnected member keeps their slot for 30s so a brief drop or a page reload doesn't lose it.
