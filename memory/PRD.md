# TriviaStream — PRD

## Original Problem Statement
Real-time, PIN-based multiplayer trivia platform. Hosts create quizzes and run live games; players join via a 6-digit PIN + nickname to compete on a live leaderboard.

## User Personas
- **Host** — teachers/trainers/streamers, desktop-first, creates quizzes and runs live sessions.
- **Player** — participants, mobile-first, joins with a PIN + nickname.
- **Admin/Power Host** (Sprint 3) — question bank management, analytics.

## Tech Stack
- Frontend: React 19 + Tailwind + shadcn/ui + framer-motion + @phosphor-icons/react + @fontsource/outfit + @fontsource/nunito
- Backend: FastAPI + native WebSockets, MongoDB (motor)
- Real-time state: in-memory Python dicts on FastAPI
- Auth: none in Sprint 1; JWT email/password planned for Sprint 3

## Core Requirements (static)
- Anonymous host session, quiz creation, room creation with 6-digit PIN
- Player join by PIN + nickname (case-insensitive uniqueness)
- Real-time host lobby (WebSocket presence)
- Error states: Room Full, Game Already Started, Duplicate Nickname, Room Not Found
- Room capacity 50, default question time 20s, TTL cleanup ~3h

## Sprint 1 — Implemented (2026-02)
### Backend (`/app/backend/server.py`)
- `POST /api/quizzes` — create a quiz (title + 1..N questions, each with 4 options, correct_index, time_limit)
- `GET /api/quizzes/{quiz_id}`
- `POST /api/rooms` — create room from quiz → returns 6-digit PIN, host_token, host_id
- `GET /api/rooms/{pin}` — public room state
- `POST /api/rooms/{pin}/join` — join with nickname (validates duplicate, room full, game started)
- `POST /api/rooms/{pin}/start?host_token=...` — host starts the game
- `WS /api/ws/rooms/{pin}?role=host|player&token=...` — real-time room state + `game_started` events
- In-memory `rooms` dict; background TTL cleanup every 10 min

### Frontend
- `/` Landing — hero + PIN entry card
- `/host/create` Quiz Builder — title, question list (left rail), editor (right), 4 colored/shaped options, mark correct, time limit
- `/host/lobby/:pin` Host Lobby — giant PIN display, copy PIN, live players grid (framer-motion pop-in), Start Game
- `/play/:pin` Player Join — 2-step (PIN then nickname), inline errors, blocker screens for Room Full / Game Already Started / Not Found
- `/play/:pin/lobby` Player Lobby — mobile-first, breathing halo, live player list, connection status

### Design
- Deep purple stage (radial gradients + grain) for game surfaces
- Outfit (display) + Nunito (body); no Inter/Roboto
- Colorblind-safe answer shapes (triangle/diamond/circle/square) via inline SVG
- Peach arcade buttons with 3D shadow, glass cards on stage, floating shapes

## What's Been Implemented (dated)
- 2026-02: Sprint 1 complete — backend endpoints, WS layer, all frontend screens + error blockers, TTL cleanup.

## Prioritized Backlog

### P0 (next up — Sprint 2)
- Server-authoritative question timer
- Live question host & player views (colored answer tiles)
- Atomic answer submission
- Scoring engine (basePoints * (1 - timeTaken/timeLimit) + streak bonus)
- Time's Up / Reveal + per-option distribution
- Real-time leaderboard (Top 5, TIE badges)
- Host live controls (Next, Skip, Show Leaderboard, End Game Early + modal)
- Player disconnect handling (retain score, resume on reconnect)
- Host disconnect → auto-promote next player

### P1 (Sprint 3)
- Host email/password JWT auth + dashboard sidebar (My Games, Reports, Discover, Marketplace, Settings)
- Question bank upload (CSV/JSON drag-drop) + row-level validation
- Nickname & question text profanity filter (local wordlist)
- Final results/podium screen, Session Summary Analytics, Download Report
- Per-question difficulty analytics endpoint
- Accessibility pass (keyboard nav; colorblind shapes already done)
- Configurable data retention policy

### P2
- Marketplace/Discover pages (Sprint 3 confirms placeholder)
- Multi-host / co-host
- Custom media in questions (image per option)

## Next Tasks
1. Build Sprint 2 real-time gameplay (timer, answers, scoring, leaderboard, reveal)
2. Then Sprint 3 (host auth, question bank upload, moderation, podium/analytics)
