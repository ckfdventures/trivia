# Decisions

A running log of choices made while building out the multi-game platform, as required by
[`docs/PRD.md`](docs/PRD.md) §0.5. Newest section last. Each entry records what was decided,
why, and what it overrides.

## Context

The PRD was written as a greenfield spec. This repository already contains a working
Kahoot-style trivia game (TriviaStream: Express + Socket.IO + MongoDB backend, Next.js
frontend). Several PRD sections therefore describe a project that does not match the repo,
and the entries below record how each conflict was settled.

---

## D1 — Repo structure: adapt, don't restructure

**Decided:** ScribbleX is built inside the existing `backend/` + `frontend/` layout using npm.
Shared types and zod schemas live in a `shared/` module rather than a workspace package.

**Overrides:** PRD §7, which specifies a pnpm monorepo (`apps/web`, `apps/server`,
`packages/shared`).

**Why:** Adopting §7 literally would mean migrating a working trivia app, rewriting every
import path, and changing package managers before any game code is written. The architectural
intent of §7 — a shared contract between client and server, validated with zod — is preserved
without the migration risk.

---

## D2 — Two games, one shell, separate skins

**Decided:** A new, chromatically neutral platform shell owns the homepage and shared chrome.
Each game keeps its own visual identity behind its entry gate:

- **Trivia** keeps its existing deep-purple TV-game-show look (Outfit / Nunito, `bg-stage`).
- **ScribbleX** uses Warm Doodle Pop (Plus Jakarta Sans / Quicksand, cream paper, coral).

The shell borrows the *structural* language both systems share — thick ink borders, offset hard
"sticker" shadows, pill buttons, heavy display type — while staying neutral in colour. Ink
(`#2B262D`) carries the structure; each game's accent colour owns its own gate.

**Why:** Restyling trivia platform-wide would mean reworking every existing screen of a working
game. Keeping the two skins distinct also makes the entry gates self-explanatory: each gate
previews the world behind it.

**Note:** There is no Stitch design for the shell. It is designed fresh for this project.

---

## D3 — Audience: Gen Z primary, family-safe floor

**Decided:** Target Gen Z in tone, copy and visual polish, while keeping the PRD's safety
mechanics intact.

**Kept from PRD §9:** profanity filter on names and chat, host kick, fixed friendly public-room
names, no free-text profile fields beyond the display name, no DMs, no image uploads, rate
limits on every socket event.

**Overridden:** the "cozy storybook", "kid-friendly", "young readers", and "families across all
ages" framing in PRD §1, §3 and DESIGN.md. Word-deck content is re-cut to suit a Gen Z audience
while remaining trademark-free and safe.

**Why:** The PRD and the design system were written for a family/all-ages audience; the product
brief is Gen Z. The safety mechanics are worth keeping regardless of audience — they are cheap
and they keep the product broadly usable.

---

## D4 — Staged delivery

**Decided:** The work ships as a sequence of reviewable pull requests rather than one branch
carrying all of PRD M1–M5.

| PR | Scope |
| --- | --- |
| 1 | Platform shell, homepage with dual entry gates, design foundations, route restructure |
| 2 | ScribbleX rooms and lobby (M2), avatar/profile |
| 3 | Canvas and drawing sync (M3) |
| 4 | Game loop, scoring, reveal, results (M4) |
| 5 | Quick Play, public room browser, XP/levels, sounds, polish (M5) |

---

## D5 — Generalise the room layer later

**Decided:** ScribbleX gets its own room store and state machine rather than extending the
trivia `Room` type, which is quiz-shaped (`quiz`, `answers`, `currentIndex`, `questionTimer`).
Shared concerns — presence, host promotion, PIN/code generation — are accessed through narrow
interfaces rather than copy-pasted, so that merging both games onto a common room core later is
a refactor rather than a rewrite.

**Why:** Keeps a working trivia game entirely out of the blast radius while ScribbleX is built.
The duplication is deliberate and time-boxed; the points where it occurs are noted in code.

---

## D6 — Voice chat deferred

**Decided:** No voice chat in the ScribbleX PRs. The `voice-chat` branch stays unmerged.

**Why:** The backend already supports voice (8 WebRTC slots, mesh, server-side signalling relay)
and an unmerged frontend exists on `origin/voice-chat`. Building voice into ScribbleX before
that branch merges would duplicate it. PRD §6.6's ad-gated voice prompt is out of scope
entirely — PRD §13.4 already recommends shipping it mocked behind a flag, and the ad-gating of a
safety-sensitive feature is not being pursued.

---

## D7 — Routes are namespaced per game

**Decided:** Each game owns a path prefix. The platform home takes `/`.

| Path | Owner |
| --- | --- |
| `/` | Platform home — the two entry gates |
| `/trivia/*` | Trivia (`/trivia/play/[pin]`, `/trivia/host/…`) |
| `/scribblex/*` | ScribbleX |
| `/admin/*` | Platform-level admin, shared by both games |

Trivia predates the platform and owned the root paths, so `/play/*` and `/host/*` are kept as
**permanent (308) redirects** into `/trivia/*` — invite links already in circulation keep
working. The redirects live in `frontend/next.config.ts`.

Route strings are no longer written inline in screens; they come from
`frontend/src/lib/routes.ts` so the next game does not have to hunt them down.

---

## D8 — Platform name: TriviaStream

**Decided:** The platform is called **TriviaStream**. The trivia game is called **Trivia**
inside it; the drawing game is **ScribbleX**.

**Noted at the time:** naming a multi-game platform after one of its games means every future
game sits under a trivia-branded parent. The name is therefore defined once, as
`PLATFORM_NAME` in `frontend/src/lib/brand.ts`, so changing it later is a one-line edit rather
than a find-and-replace.

---

## D9 — Word decks are managed in the admin panel, not shipped as files

**Decided:** Word decks are stored in MongoDB and managed through the platform admin panel,
reusing the pattern the trivia question bank already uses (upload → validate → preview →
import).

**Overrides:** PRD §8, which ships decks as static JSON in `packages/shared/decks/*.json`.

**Why:** Decks become editable without a deploy, and the admin panel already has a working
file-upload/preview/import flow (`/api/admin/question-bank/*`) whose UI conventions and
validation the deck uploader can follow.

**Delivered:** `/admin/decks` in the admin panel, backed by `/api/admin/scribblex/decks`.
Create, rename, delete, upload a list (.txt/.csv/.json) with a preview before anything is
saved, or type a few words in. The lobby reads the same decks from the public catalogue, so an
edit shows up in the next room without a deploy.

---

## D10 — A player's public id is not their credential

**Decided:** Each ScribbleX player has two identifiers: a public `player_id` that appears in
room state, and a secret `session_token` issued by the server that never appears in any
broadcast. The socket handshake presents both.

**Overrides:** PRD §7, where the browser keeps one persistent `playerId` in `localStorage` and
authenticates with it.

**Why:** the PRD's `playerId` is also shown to every other player in the room snapshot. If it
were the credential, any player could take over another's seat — and their score — simply by
repeating an id they had already been sent. The trivia game already separates these two roles
(`player.id` vs `player.session_token`); ScribbleX follows it.

A test asserts that no session token appears in a serialised room snapshot.

---

## D11 — Rooms are created over REST, played over the socket

**Decided:** `POST /api/scribblex/rooms`, `/rooms/:code/join` and `/rooms/quick-play` are REST.
Everything live — settings changes, ready state, kicks, presence — travels over the socket.

**Overrides:** PRD §7, which lists `room:create` and `room:join` as socket events.

**Why:** joining can fail in ways the form has to explain — unknown code, room full, match
already started — and HTTP status codes carry that cleanly (404, 409) through the error
handling the app already has. Doing it over the socket would need a pre-authentication socket
state that exists only to be upgraded moments later. It also matches how trivia works.

---

## Pending

Open items that need a decision before the work they block can start.

| # | Question | Blocks |
| --- | --- | --- |
| P1 | Real avatar artwork. The Stitch export references Google-hosted generated images that are neither licensed nor durable; placeholders are used until then. | Avatar screen (PR2) |
| P2 | `design/home_scribblex_cartoon/screen.png` failed to export from Stitch (it contains the text `<FIFE Image failed to fetch>`). The screen's `code.html` is intact, so it is not blocking, but there is no reference render for that screen. | — |
