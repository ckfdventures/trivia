# PRD — ScribbleX (working title)

> A cozy, mobile-first, real-time multiplayer draw-and-guess party game.
> **Audience for this doc:** Claude Code (implementation agent) and the humans reviewing its work.
> **Design source:** Google Stitch export `stitch_neon_sketch_multiplayer_game/` — 5 screens + the "Warm Doodle Pop" design system. Copy the export into the repo at `/design` and treat each `code.html` as the visual source of truth for its screen.

---

## 0. Instructions for Claude Code

1. Read this whole PRD, then read `/design/warm_doodle_pop/DESIGN.md` and every `/design/*/code.html` before writing code.
2. Build in the milestone order in §11. Each milestone must end with the app running and its acceptance criteria (§12) passing.
3. The Stitch HTML is Tailwind-CDN prototype markup. **Port it** into real components; do not iframe or copy the CDN script. Move the Tailwind config (colors, fonts, radii, spacing) into `tailwind.config.ts`.
4. The **server is authoritative** for all game state (turns, timers, the secret word, scoring). Clients never receive the secret word unless they are the drawer or have guessed it.
5. Where this PRD is silent, choose the simplest option that matches the designs, and log the decision in `DECISIONS.md`.
6. Anything marked **[OPEN]** in §13 needs a human decision — implement the stated default and keep it easy to change.

---

## 1. Summary

ScribbleX is a browser-based party game in the vein of Pictionary/skribbl.io: each round, one player draws a secret word on a shared canvas while everyone else races to guess it in chat. Faster guesses score more. The product's differentiator is its **warm, tactile "sticker-book" aesthetic** and a **kid- and family-friendly tone** — friendly word decks, forgiving spelling, cute avatars — rather than the anonymous, edgy feel of existing clones.

No signup: players land, pick a name/avatar, and are drawing within seconds.

## 2. Goals & non-goals

### Goals (v1)
- A player can go from landing page to an active match in **< 10 seconds** (Quick Play) with no account.
- Friends can create a private room, share a code/link, tweak rules, and play together.
- Drawing feels **real-time** (strokes appear for guessers within ~150 ms on a normal connection).
- The UI matches the Stitch designs closely on mobile (360–430 px) and scales gracefully to desktop.
- Rooms of 2–8 players are stable through a full match, including reconnects.

### Non-goals (v1)
- User accounts, passwords, OAuth.
- Payments or real ad-network integration (the ad prompt is mocked — see §6.6).
- Native mobile apps (responsive web / PWA only).
- Moderation dashboard, reporting pipeline beyond a basic chat filter.
- The "Lightning" and "Tag-Draw" modes ship as **stretch** (M6), "Classic" first.

## 3. Target users

| Persona | Needs |
|---|---|
| **Party host** (teen/adult setting up a game for friends or family) | Fast room setup, sensible defaults, easy invite (code + share link), control over word decks and rules. |
| **Casual guest** (joins via link, often on phone) | Zero friction, clear "whose turn / what do I do", big tap targets. |
| **Quick-play drifter** | Instant match with strangers, short sessions. |

The design system explicitly targets "creators, learners, and families across all ages" — so content must stay family-safe by default (see §9).

## 4. Core game loop

```
LOBBY ──(host starts, ≥2 players)──▶ MATCH
MATCH = N rounds; each round = every player draws once (turn order = join order)
TURN:
  1. WORD_PICK   drawer sees 3 word cards (if "3-Word Choice" on) — 10s, auto-pick on timeout
                 else server assigns 1 word
  2. DRAWING     drawer draws; others guess in chat. Turn timer (45/60/80s)
                 "Letter Hints" on → reveal a random letter at 50% and 75% of time elapsed
                 Turn ends early when every guesser has guessed
  3. REVEAL      show word + points gained this turn — 4s
after last turn of last round ──▶ RESULTS (podium, 10s) ──▶ back to LOBBY (same room)
```

### Scoring
- **Guesser:** `points = round(50 + 250 * timeRemaining / turnDuration)` → range 50–300. (Design shows "+200 pts" for a correct guess — consistent with this curve.)
- **Drawer:** `+50` per correct guesser, capped at `+300` per turn.
- Ties on the final scoreboard share placement.

### Guess evaluation (server-side)
- Normalize: lowercase, trim, collapse whitespace, strip punctuation and diacritics.
- Exact match → correct. The guess text is **not** broadcast; instead a system message "🎉 *Name* guessed the secret word! +N pts".
- **Close guess** (Levenshtein distance 1 for words ≤ 5 letters, ≤ 2 for longer) → private hint to *that player only*: "💡 So close!" The design's public "Mia is super close! ('cat')" leaks the guess — v1 shows it **only to the guesser** [OPEN §13].
- **"Gentle Spelling" modifier on:** a close guess counts as correct (awarded 75% of normal points).
- Players who have guessed can still chat, but their messages go only to others who have guessed + the drawer (prevents leaks).
- The drawer cannot send messages that contain the word.

## 5. Information architecture

Mobile layout uses a bottom tab bar on Home: **Home · Rooms · Badges · Rules**. In-game screens use a top app bar (back button, screen title, timer pill, avatar).

| Route | Screen | Stitch folder |
|---|---|---|
| `/` | Home | `home_scribblex_cartoon` |
| `/avatar` (also as a step before joining) | Avatar selection ("Pick Your Sketcher!") | `avatar_selection_scribblex_cartoon` |
| `/room/:code` (state = lobby) | Room settings / lobby | `room_settings_scribblex_cartoon` |
| `/room/:code` (state = playing) | Game arena | `game_arena_scribblex_cartoon` |
| modal over arena | Voice-chat unlock prompt | `game_arena_voice_chat_ad_prompt` |
| `/rooms` | Public room browser (full list) | derive from Home's "Live Public Rooms" |
| `/rules` | How to play | not designed — simple content page in the design system |
| `/badges` | Badges | not designed — v1 placeholder "Coming soon" |

## 6. Screen requirements

### 6.1 Home (`/`)
- Header: ScribbleX logo, sound toggle (`volume_up`), settings (`settings`).
- Hero: "Ready to Doodle?" + "No signup needed — jump right in and sketch!"
- **Three entry cards:**
  - **Quick Play ⚡** — "Play Now 🚀" → matchmakes into a public lobby/room with space (prefer rooms in lobby state, then in-progress rooms, else create one). If the player has no avatar yet, go through `/avatar` first.
  - **Join 🎟️** — code input + "Enter Room". Validate format; show inline error for unknown/full rooms.
  - **Party 🎪** — "Create Room" → creates a private room with the player as host → lobby.
- **Featured Modes** carousel (Classic, Lightning, Tag-Draw; "See All (5)"). v1: Classic playable; others show a "Soon" chip unless M6 is done.
- **Live Public Rooms** list: name, emoji, status ("Round 2/3" or "Lobby Waiting"), players `x/max`, "Join Room". Count badge ("12 active") and Refresh button. Poll every 10s or subscribe via socket.
- Bottom tab bar.

### 6.2 Avatar selection ("Pick Your Sketcher!")
- Large preview of the current avatar, editable display name field (default: random fun name like "DoodleFox 🦊"), max 16 chars, profanity-filtered.
- **Shuffle** button randomizes avatar + hat + name.
- Tabs: **Avatars · Hats & Gear · Expressions · Themes**. v1 must implement Avatars and Hats; Expressions/Themes may be placeholders.
- Avatar gallery (2-col grid): Pip Beret, Barnaby Bark, Mochi Whiskers, Professor Ted, Bot Scribble, Penny Splash, Foxy Palette, and locked **Cosmic Owl (LVL 5)**. Selected card shows coral check badge.
- "Equip Headgear" chip row: Beret, Party Hat, Scholar, Headphones, Royal.
- Sticky footer: shuffle icon button + **"Save & Jump In! 🚀"** → persists profile to `localStorage` and continues to the intended destination.
- Avatar images: the Stitch export references generated images; replace with our own illustrated assets (SVG or PNG) in `/public/avatars/`. Until real art exists, use simple original placeholder illustrations (colored circle + emoji is acceptable).
- **Levels/unlocks:** a guest XP counter stored in `localStorage` (+10 XP per match played, +5 per correct guess; level = floor(XP/100)+1). Cosmic Owl unlocks at level 5.

### 6.3 Room lobby / settings (`/room/:code`, state = lobby)
- Card with **room code** (e.g. `PARTY-77`), **Copy** (toast: "Room Code Copied to Clipboard!") and **Share** (Web Share API; fallback copy link). "Live Sync" indicator reflects socket connection state.
- **Choose Word Decks 📦** — multi-select list: Cute Animals 🐶, Yummy Treats 🍕, Everyday Magic ✨, Cartoons & Heroes 🦸. Count chip ("3 Selected"). At least one deck required.
- **Custom Wordlist ➕** — opens a sheet with a textarea (comma/newline separated, 3–32 chars each, min 10 words). Option: "Use only custom words".
- **Match Dynamics ⚡** — segmented controls: Rounds (3/5/8), Turn Timer (45s/60s/80s); stepper for Max Sketchers (2–8, default 6).
- **Fun Rules & Silly Modifiers 🎨** — toggles: Letter Hints, 3-Word Choice, Gentle Spelling, Private Party (private = not listed in public rooms).
- **Party Roster (x/max)** — 2-col grid of players with avatar, name, status ("Ready! 🌟" / "Choosing… 🎨" while on avatar screen); crown on host. "Waiting for N" indicator.
- Only the **host** can edit settings; non-hosts see them read-only. Changes sync live to all members.
- **"Start Party Match! 🚀"** (host only; disabled until ≥2 players). Non-hosts see a "Ready" toggle instead.
- **"Save as Favorite Preset ⭐"** — saves current settings to `localStorage`; offered as a preset when creating the next room.
- If the host leaves, host transfers to the longest-present player.

### 6.4 Game arena (`/room/:code`, state = playing)
Top to bottom, per the design:
- App bar: back (confirm "Leave match?"), title "Live Drawing Arena", timer pill, avatar. Arena variant also shows sound toggle and a muted-mic button (opens §6.6).
- **Status row:** deck + letter count pill ("🐾 Animals & Pets • 6 Letters"), "Round 2 of 3", turn countdown ("⏳ 38s").
- **Word tiles:** one rounded tile per letter. Drawer sees the full word; guessers see blanks (`_`) with revealed hint letters; spaces shown as gaps. After guessing, the guesser sees the full word.
- **Scoreboard strip:** horizontally scrollable player chips (avatar, name, "(You)", points). Chip turns cyan with "Guessed!" when that player has guessed this turn; drawer chip marked ✏️.
- **Canvas card:** "● Live Sketch" badge, "✏️ Name's turn" badge, dotted paper background. Fixed logical size **800×600**, scaled to fit width, aspect preserved.
- **Toolbar (drawer only; hidden or disabled for guessers):**
  - Tools: pencil, marker (thicker, slightly translucent), eraser (🧽), fill bucket (🪣).
  - Brush sizes: small / medium / large.
  - Undo / redo (stroke-level, drawer's own strokes this turn).
  - Palette of 8: `#FF85A1` bubblegum, `#7CF6EC` light cyan, `#2BB4AB` teal, `#FEC736` butter, `#FF7A59` coral, `#785A00` olive, `#1F1A21` ink, `#FFFFFF` white. Selected swatch gets the ring indicator.
  - Optional clear-canvas button (with confirm).
- **"Live Guesses & Cheers"** chat feed: player messages ("Leo: is it a puppy?"), hint bubbles (yellow), correct-guess banners (cyan with "+N pts" pill). Auto-scroll to newest unless the user scrolled up.
- **Input bar:** "Type your guess here… 🎈", emoji button (small quick-emoji picker), send button. Enter sends. Max 100 chars, rate-limit 1 msg / 500 ms.
- **Overlays:** word-pick sheet for the drawer (3 cards), turn-reveal card ("The word was KITTEN!" + per-player points), final results podium with "Play Again" (host) / "Back to Home".

### 6.5 Results
Not designed. Build a podium card (1st/2nd/3rd with avatars, sticker shadows, confetti) plus full ranked list, in the same visual language. Host sees "Play Again" (returns everyone to lobby with same settings).

### 6.6 Voice chat unlock prompt (modal)
The design gates voice chat behind a 10-second sponsor video ("Unlock Voice Chat! … Watch to Unmute / Stay Muted for Now").
- **v1: UI only, mocked.** Clicking the mic opens the modal; "Watch to Unmute" plays a 10s placeholder progress animation (no real ad SDK), then shows a toast "Voice chat coming soon!" and closes. "Stay Muted for Now" and ✕ close it.
- Put this behind a feature flag `FEATURE_VOICE_PROMPT` (default **off**) because of the child-safety questions in §13.
- Real voice (WebRTC, e.g. LiveKit) is out of scope for v1.

## 7. Real-time architecture

### Recommended stack
- **Monorepo** (pnpm workspaces): `apps/web`, `apps/server`, `packages/shared` (types, zod schemas, constants, word decks).
- **Web:** Next.js (App Router) + React + TypeScript + Tailwind CSS. Fonts: Plus Jakarta Sans (700/800), Quicksand (500/600) via `next/font`. Icons: Material Symbols Outlined (as in the designs).
- **Server:** Node + TypeScript + **Socket.IO**. In-memory room store for v1 behind a `RoomStore` interface so Redis can be swapped in later.
- **Validation:** zod schemas in `packages/shared` for every socket event, validated on the server.
- **Tests:** Vitest (unit: scoring, guess matching, state machine), Playwright (e2e: 2–3 browser contexts playing a full match).

### Room state machine (server)
`LOBBY → WORD_PICK → DRAWING → REVEAL → (WORD_PICK … ) → RESULTS → LOBBY`
All timers run on the server; clients receive `endsAt` timestamps (server time + clock offset estimated on connect) and render countdowns locally.

### Socket events (initial contract — refine in `packages/shared`)
Client → server:
- `room:create {settings, profile}` → `{code}`
- `room:join {code, profile}` / `room:quickplay {profile}`
- `room:updateSettings {partial}` (host)
- `room:ready {ready}` · `room:start` (host) · `room:leave`
- `turn:pickWord {index}` (drawer)
- `draw:stroke {id, tool, color, size, points[]}` — stream points in batches every ~30 ms while drawing
- `draw:fill {x, y, color}` · `draw:undo` · `draw:redo` · `draw:clear`
- `chat:guess {text}`

Server → client:
- `room:state {…}` full snapshot (on join/reconnect) — secret word omitted for non-eligible players
- `room:patch {…}` incremental updates (players, settings, scores)
- `turn:start {drawerId, wordMask, endsAt, round}` · `turn:wordChoices {words[3]}` (drawer only) · `turn:word {word}` (drawer + guessed players)
- `turn:hint {wordMask}` · `turn:end {word, deltas}` · `match:end {standings}`
- `draw:*` rebroadcast to others
- `chat:message {from, text, kind: 'chat'|'system'|'close'|'correct', points?}`

### Drawing sync
- Strokes are vector: arrays of normalized points (0–1 in canvas space) with tool/color/size. Render with quadratic smoothing on `<canvas>` using Pointer Events (mouse, touch, pen; `touch-action: none` on canvas).
- Server keeps the turn's stroke log so late joiners/reconnectors replay the canvas.
- Fill bucket: flood fill executed **client-side** deterministically from the stroke log (same algorithm on every client), tolerance-based.
- Undo/redo removes/re-adds the drawer's last stroke by id; all clients re-render from the log.
- Payload limits: ≤ 500 points per batch, ≤ 5,000 strokes per turn; reject oversize events.

### Reconnects & presence
- Each browser has a persistent `playerId` (UUID in `localStorage`). Reconnecting within 30s restores the seat and score.
- If the drawer disconnects for > 10s, their turn is skipped (no points).
- Empty rooms are deleted after 5 minutes.

## 8. Data

### Word decks (`packages/shared/decks/*.json`)
v1 ships 4 decks, **≥ 150 words each**, family-friendly, 3–14 letters, single or two-word phrases:
- `cute-animals` — "Puppies, hamsters, dinosaurs"
- `yummy-treats` — "Pancakes, cupcakes, smoothies"
- `everyday-magic` — "Backpacks, skateboards, treehouses"
- `cartoons-heroes` — "Superheroes, fairy tales" — **generic concepts only** (e.g. "superhero", "dragon", "mermaid", "castle"), no trademarked character names.

Avoid repeating a word within a match.

### Room (server, in memory)
```ts
Room {
  code: string; hostId: string; isPrivate: boolean; createdAt: number;
  settings: { decks: DeckId[]; customWords: string[]; customOnly: boolean;
              rounds: 3|5|8; turnSeconds: 45|60|80; maxPlayers: 2..8;
              letterHints: boolean; threeWordChoice: boolean; gentleSpelling: boolean };
  players: Map<playerId, { name; avatarId; hatId; score; connected; ready; guessedThisTurn; joinedAt }>;
  phase: 'LOBBY'|'WORD_PICK'|'DRAWING'|'REVEAL'|'RESULTS';
  round: number; drawerOrder: playerId[]; drawerIndex: number;
  word?: string; revealedIdx: number[]; endsAt?: number; strokes: Stroke[]; usedWords: Set<string>;
}
```

### Client-local (`localStorage`)
`playerId`, `profile {name, avatarId, hatId}`, `xp`, `favoritePreset`, `soundOn`.

## 9. Trust, safety & content
- Display names and chat run through a profanity filter (e.g. `obscenity` package, English v1). Blocked words are masked, not rejected.
- Public room names are chosen from a fixed friendly list ("Doodle Funhouse", "Animal Party", "Cartoon Club"…), not user-entered.
- Host can **kick** a player from the roster (long-press / menu). Kicked `playerId` can't rejoin that room.
- No free-text profile fields beyond name. No DMs. No images uploaded.
- Rate limits on every socket event; drop connections that exceed them.

## 10. Design system implementation
- Source: `/design/warm_doodle_pop/DESIGN.md`. Port the token set (colors, typography scale, radii, spacing) into Tailwind config and CSS variables.
- **Signature "sticker" elevation** — build as reusable utilities/components:
  - Resting: `border-[2.5px] border-ink shadow-[0_4px_0_#2B262D]`
  - Hover: translateY(-2px) + `0 6px 0`
  - Pressed: translateY(+4px) + shadow `0`
- Core components: `Button` (primary coral / secondary butter / ghost), `Chip`, `Card`, `SegmentedControl`, `Toggle`, `Stepper`, `TextField` (pill, ≥52px), `Modal`/`Sheet` (warm scrim `rgba(43,38,45,0.35)`), `Toast`, `AvatarBadge`, `PlayerChip`, `LetterTile`, `ChatBubble`.
- Canvas background: `#FFFDF7` with dotted grid.
- Motion: small bouncy transitions (150–250 ms); respect `prefers-reduced-motion`.
- Sounds (toggle in header): correct guess chime, turn start pop, timer tick in last 10s. Off by default on first visit is acceptable [OPEN].
- Accessibility: tap targets ≥ 44px, visible focus states (coral offset ring per DESIGN.md), color is never the only signal (e.g. "Guessed!" text accompanies cyan), chat feed is an ARIA live region.

## 11. Milestones

| # | Milestone | Scope |
|---|---|---|
| M1 | **Foundations** | Monorepo, Tailwind tokens, fonts, core UI components, static ports of all 5 screens with mock data. Storybook optional. |
| M2 | **Rooms & lobby** | Socket server, create/join by code, share link, roster presence, host settings sync, avatar/profile persistence. |
| M3 | **Drawing** | Canvas with all tools, stroke streaming, undo/redo, fill, clear, late-join replay. |
| M4 | **Game loop** | State machine, word pick, timers, hints, guessing, scoring, reveal, results, play again. |
| M5 | **Public play & polish** | Quick Play matchmaking, public room list, reconnects, kick, profanity filter, sounds, XP/levels, voice-prompt mock behind flag, e2e tests. |
| M6 | **Stretch** | Lightning mode (30s turns, 1 round, ×1.5 points), Tag-Draw (2 drawers share canvas; guessers vs drawers). |

## 12. Acceptance criteria (v1 = M1–M5)
1. Two browsers can create/join a room by code and by link, and see each other in the roster within 1s.
2. Host settings changes appear on the other client within 1s; non-host cannot change them.
3. A full 3-round match with 3 players completes with correct turn order, timers, hint reveals, and scores matching §4.
4. The secret word never appears in any payload sent to a guesser before they guess (verified by an e2e test inspecting socket frames).
5. Refreshing mid-turn restores the player's seat, score, and the current canvas.
6. Drawing works with mouse, touch (iOS Safari, Android Chrome), and pen; the page does not scroll while drawing.
7. Screens match the Stitch designs at 390px width (spot-check layout, colors, typography, sticker shadows).
8. Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 90 on Home.
9. Unit tests cover scoring, guess normalization/close-match, and every state-machine transition; `pnpm test` and `pnpm e2e` pass in CI.

## 13. Open questions (defaults in bold — implemented until decided)
1. **Name:** folder says "Neon Sketch", screens say "ScribbleX". → **Use ScribbleX**; keep the name in one constant.
2. **Room code format:** Home says "Enter 6-digit code", lobby shows `#PARTY-77`. → **6-char uppercase alphanumeric (no ambiguous chars: 0/O/1/I), displayed as `ABC-123`**; join links `/room/ABC123`.
3. **Close-guess visibility:** design shows "Mia is super close! ('cat')" to everyone, which leaks info. → **Show to the guesser only.**
4. **Ad-gated voice chat:** open voice between strangers in a product aimed at families/kids raises serious safety and legal issues (COPPA/GDPR-K), and ad-gating a safety-sensitive feature is unusual. → **Ship mock UI behind a flag, off by default.** If pursued: private rooms only, host must enable, age gate, and legal review.
5. **Quick Play with strangers + young audience:** → **Allowed in v1 with profanity filter + kick**; revisit with an age gate before launch.
6. **Ads / monetization overall** (sponsor video, cosmetics unlocks)? → **Out of scope for v1.**
7. **Guest progression** (levels, badges) stored only in the browser — acceptable that it's lost on device change? → **Yes for v1.**
8. **Top-bar "55s" timer pill** appears on lobby and avatar screens too — what does it count? → **Lobby auto-start countdown in public rooms (starts when ≥ 3 players); hidden in private rooms.**
9. Languages beyond English? → **English only**, but keep strings in a single `i18n/en.ts`.
10. Sounds on by default? → **Off until the user taps the sound toggle** (autoplay policies).

## 14. Success metrics (post-launch)
- Time from landing → first stroke seen: median < 15s.
- Match completion rate (started → results) ≥ 70%.
- % of private rooms that reach ≥ 3 players ≥ 50%.
- "Play Again" rate after results ≥ 40%.
