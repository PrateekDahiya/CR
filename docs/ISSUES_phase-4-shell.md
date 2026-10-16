# ISSUES — phase-4-frontend-shell (2026-10-17, reviewer: shell-review-agent)

> Scope: frontend shell + deck only (MEMORY#16: net/tests agents own
> `docs/ISSUES_phase-4-net.md` + `docs/TEST_REPORT_phase-4-*.md` — untouched;
> read-only elsewhere; no commits; CRclone never touched).
> REQUIREMENT inputs read: MEMORY.md, docs/GAME_DESIGN.md §§1-4/12,
> frontend/app/page.tsx, frontend/app/lobby/page.tsx, frontend/app/deck/page.tsx,
> frontend/components/deck/DeckBuilder.tsx, frontend/components/deck/CardTile.tsx,
> frontend/lib/cards.ts, shared/types.ts (+ shell.spec.ts, tests/README.md,
> lib/socket.ts, layout/tailwind/globals/next.config as supporting evidence).

## Summary
- Scope reviewed: `frontend/app/page.tsx`, `frontend/app/lobby/page.tsx`,
  `frontend/app/deck/page.tsx`, `frontend/components/deck/DeckBuilder.tsx`,
  `frontend/components/deck/CardTile.tsx`, `frontend/lib/cards.ts`
  (vs `frontend/tests/shell.spec.ts` contract + GAME_DESIGN §§1/4).
- Commit/branch: `feature/phase-4-frontend-shell` @ `bdf3d17` + dirty tree
  (shell files uncommitted; other agents' files present — left alone per MEMORY#16).
- Verdict: **fail** (1 blocker + 3 majors; all fixes are small — see Suggested fix).

## Issues
### ISS-F4-001 — deck slots missing `data-testid="card-slot"` (e2e deck test fails)
- **Severity**: blocker
- **Status**: open
- **File**: `frontend/components/deck/DeckBuilder.tsx:96-125`
- **Category**: correctness
- **Description**: Slots grid renders exactly 8 nodes (`Array.from({length: DECK_SIZE})`)
  but none carries `data-testid="card-slot"`. `frontend/tests/shell.spec.ts:35-36`
  asserts `locator('[data-testid="card-slot"]')` has count 8 → **FAIL** (count 0).
  Card pool `CardTile`s correctly have no test id (spec: pool must use a different id).
- **Repro**: `Set-Location frontend; npm run dev; npx playwright test --project=chromium -g "8 slots"` → count 0 ≠ 8.
- **Suggested fix**: add `data-testid="card-slot"` + `data-testid={`card-slot-{i}`}`
  to the slot wrapper div (not to `CardTile` pool buttons).

### ISS-F4-002 — lobby input missing `data-testid="player-id-input"` (contract violated, test passes only via fallback)
- **Severity**: major
- **Status**: open
- **File**: `frontend/app/lobby/page.tsx:113-121`
- **Category**: conventions
- **Description**: Player-ID `<input id="playerId">` has no `data-testid="player-id-input"`.
  `shell.spec.ts:45-54` falls back to any visible text input so the test limps through,
  but `frontend/tests/README.md:48` contracts that lobby MUST expose the test id.
- **Repro**: inspect `/lobby` DOM — no `[data-testid="player-id-input"]` node.
- **Suggested fix**: add `data-testid="player-id-input"` (keep `id="playerId"` + label).

### ISS-F4-003 — localStorage deck key mismatch: builder writes `cr-clone-deck-v1`, lobby reads `cr-deck` (menu/lobby/deck flow broken)
- **Severity**: major
- **Status**: open
- **File**: `frontend/components/deck/DeckBuilder.tsx:17` vs `frontend/app/lobby/page.tsx:30`
- **Category**: correctness
- **Description**: DeckBuilder persists under `cr-clone-deck-v1`; lobby preview loads
  `cr-deck` (nothing ever writes that key), so lobby ALWAYS shows FALLBACK_DECK and
  never the user's built deck. Cross-page deck flow is silently dead.
- **Repro**: build a custom deck in `/deck` → open `/lobby` → preview shows starter, not custom.
- **Suggested fix**: unify on one key (e.g. `cr-clone-deck-v1`) via a shared constant;
  lobby should filter through `getCard` (drop unknown ids) like the builder does.

### ISS-F4-004 — home CTAs are links named "Play vs AI"/"Play 1v1", spec expects buttons Play/Lobby/Deck
- **Severity**: major
- **Status**: open
- **File**: `frontend/app/page.tsx:56-75` vs `frontend/tests/shell.spec.ts:27-29`
- **Category**: correctness
- **Description**: Home renders Next `<Link>` (= role `link`) with texts "Play vs AI",
  "Play 1v1", "Deck". Spec asserts `getByRole("button", {name: /^Play$|^Lobby$|^Deck$})` —
  no node matches (wrong role AND wrong names) → home test **FAILS** as written.
  Shell-vs-spec contract must be reconciled (coordinate with test agent; do not edit
  `frontend/tests/*` from this review).
- **Repro**: `npx playwright test -g "home / loads title"` → timeout, no such buttons.
- **Suggested fix**: EITHER update spec to `getByRole("link", {name: /play vs ai|play 1v1|deck/i})`
  (preferred — links are correct semantics) OR add explicit accessible names/roles in shell.

### ISS-F4-005 — `frontend/playwright.config.ts` missing (no `chromium` project; e2e not runnable)
- **Severity**: major
- **Status**: open
- **File**: `frontend/` (absent; referenced by `frontend/tests/README.md:43-45`)
- **Category**: conventions
- **Description**: README + spec assume a `chromium` project owned by the infra/app-shell
  agent, but no `playwright.config.ts` exists in `frontend/`. `npm run test:e2e`
  (`playwright test --project=chromium`) errors with unknown project. Blocks MEMORY#17
  UI verification of this shell.
- **Repro**: `Set-Location frontend; npm run test:e2e` → "Project(s) not found: chromium".
- **Suggested fix**: app-shell/infra agent adds minimal `playwright.config.ts`
  (chromium, baseURL `http://localhost:3000`, `tests/` dir).

### ISS-F4-006 — lobby ignores `?mode=ai|pvp` from home links
- **Severity**: minor
- **Status**: open
- **File**: `frontend/app/lobby/page.tsx:46-64` (home links at `frontend/app/page.tsx:57-67`)
- **Category**: correctness
- **Description**: Home links to `/lobby?mode=ai` and `/lobby?mode=pvp`, but lobby never
  reads search params (`useSearchParams`) — mode choice is silently dropped.
- **Repro**: click "Play vs AI" vs "Play 1v1" → identical lobby, no mode shown/remembered.
- **Suggested fix**: read `mode` via `useSearchParams`, display it, persist alongside
  `cr-player-id`, pass to net-client `joinQueue` later.

### ISS-F4-007 — lobby deck gate checks length only, not §4 spells/dupes
- **Severity**: minor
- **Status**: open
- **File**: `frontend/app/lobby/page.tsx:63`
- **Category**: correctness
- **Description**: `deckValid = deck.length === 8` — a hand-edited localStorage deck with
  3 spells/duplicates/unknown ids passes the lobby gate (server will reject as
  authoritative, but UX offers Join). Deck page already uses `validateDeck` — lobby should too.
- **Repro**: `localStorage.setItem('cr-deck', JSON.stringify([...3 spells...]))` → Join enabled.
- **Suggested fix**: `import { validateDeck } from "../lib/cards"` (adjust path) and gate on it.

### ISS-F4-008 — `hover:bg-slate-750` is not a Tailwind color (dead class)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/deck/CardTile.tsx:42`
- **Category**: conventions
- **Description**: Default palette has no `slate-750`; the hover rule silently no-ops.
- **Repro**: hover a pool card → no bg change (only border change applies).
- **Suggested fix**: `hover:bg-slate-700`.

### ISS-F4-009 — DeckBuilder reads localStorage in `useState` initializer (SSR hydration mismatch risk)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/deck/DeckBuilder.tsx:36`
- **Category**: correctness
- **Description**: `useState(loadInitialDeck)` reads localStorage on first client render
  while SSR rendered the starter deck → React hydration mismatch warning whenever a
  stored deck differs. Lobby does it correctly (starter init + `useEffect` hydrate).
- **Repro**: save custom deck → hard-reload `/deck` → hydration warning in console.
- **Suggested fix**: `useState([...STARTER_DECK_BALANCED])` + load stored deck in `useEffect`.

### ISS-F4-010 — deck page uses raw `<a href="/">` and has no onward link to lobby
- **Severity**: minor
- **Status**: open
- **File**: `frontend/app/deck/page.tsx:11-13`
- **Category**: conventions
- **Description**: Back-to-menu is a plain `<a>` (full reload, inconsistent with `Link`
  elsewhere); flow Deck→Lobby requires going back through menu first.
- **Repro**: click "← Back to menu" → full document reload (see Network tab).
- **Suggested fix**: `next/link` `<Link href="/">` + add `<Link href="/lobby">To lobby →</Link>`.

## PASS (verified — no issue filed)
- **P1 Routing**: `/` (`app/page.tsx`), `/lobby` (`app/lobby/page.tsx`),
  `/deck` (`app/deck/page.tsx`) all exist as App Router pages; layout nav links
  Menu/Lobby/Deck present (`app/layout.tsx:17-30`). ✅
- **P2 Tailwind**: directives + dark base + `.btn` layer (`app/globals.css`),
  `content` globs cover `app/` + `components/` (`tailwind.config.js:3-6`),
  `reactStrictMode` (`next.config.js`), utilities used inline throughout. ✅
- **P3 8 slots**: slot grid renders exactly `DECK_SIZE` (8) nodes; distinct-card,
  full-deck and remove-to-re-add logic correct (`DeckBuilder.tsx:52-66`). ✅
- **P4 Max 2 spells**: `MAX_SPELLS=2` enforced in `toggle` + `validateDeck`
  (`lib/cards.ts:306-323`); Cannon correctly typed `building`, not spell. ✅
- **P5 localStorage**: try/catch + corrupt-JSON + unknown-id guards on load
  (`DeckBuilder.tsx:19-33`), non-fatal save (`:39-45`); lobby player-id persist
  (`lobby/page.tsx:76-80`). ✅ (key mismatch itself is ISS-F4-003)
- **P6 Starter avg 3.375**: balanced deck costs 3+3+4+4+5+1+4+3=27 → 27/8=**3.375**
  matches GAME_DESIGN §4; heavy deck 30/8=3.75 ✅; all 12 card costs match §1 table;
  pool total 42/12=3.5 matches §1.2 ✅.
- **P7 No socket in deck**: `components/deck/*` + `app/deck/*` import only
  `react` + `lib/cards` (grep: zero socket/fetch/queue/match hits); transport
  correctly isolated in `lib/socket.ts` (net-client agent); lobby queue is an
  explicit local stub with `TODO(phase-4 net-client)` markers — correct separation. ✅
- **P8 Backend URL env**: `NEXT_PUBLIC_BACKEND_URL ?? http://localhost:4000` in
  home + lobby with live `/health` status dot (`app/page.tsx:6-7,20-36`);
  `.env.example` documents it; deck page correctly backend-free (local-only). ✅
- **P9 shared/types compat**: no breaking change needed; frontend `CardInfo`
  (`cost/hp/damage`) is display-side only, server remains authoritative per §4/§11. ✅
- **P10 Lobby fallback deck** equals `STARTER_DECK_BALANCED` ids (knight, archers,
  musketeer, baby-dragon, giant, skeletons, fireball, cannon). ✅

## Counts
- blocker: 1 | major: 4 | minor: 5 | verified: 0
