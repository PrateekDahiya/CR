# ISSUES — phase-4-net (2026-10-17, reviewer: review-agent-net)

> Scope: net client + Playwright setup only. No code edited. Never read/copied from `CRclone`.
> Other parallel agents own shell/deck/test-reports — left untouched per MEMORY#16.
> Read: `MEMORY.md`, `docs/GAME_DESIGN.md §12`, `frontend/lib/socket.ts`, `frontend/lib/api.ts`,
> `frontend/tests/shell.spec.ts`, `backend/src/index.ts`, `shared/types.ts`.

## Summary
- Scope reviewed: `frontend/lib/socket.ts:1-278`, `frontend/lib/api.ts:1-119`, `frontend/tests/shell.spec.ts:1-56`, `frontend/tests/README.md:1-49`, `frontend/package.json:1-30`, `frontend/.env.example:1-2` vs `backend/src/index.ts:1-334`, `backend/src/net/rooms.ts:1-552`, `ai-service/main.py:1-60`, `shared/types.ts:1-160`, `docs/GAME_DESIGN.md §12`
- Commit/branch: `feature/phase-4-frontend-shell@bdf3d17`
- Verdict: pass-with-issues (0 blocker, 2 major, 5 minor)

### Goals checklist
- [x] socket events match backend (`queue:join/leave`, `deck:select`, `card:play`, `emote:send`, `state:update`/`queue:matched`/`match:end`/`error` twins, `serverTimeMs`) — PASS with notes (ISS-N4-002 double-fire, ISS-N4-004/005 minors)
- [x] REST shapes (`GET /health`, `POST /bot/move`, `GET /balance/cards`) — PASS with note (ISS-N4-006 `?card` filter stub gap)
- [ ] Playwright chromium project only — FAIL (ISS-N4-001: no `playwright.config.ts`; `package.json:10` + `tests/README.md:43-45` reference `--project=chromium` that does not exist)
- [x] baseURL env — PASS (`shell.spec.ts:17-20` honors `PLAYWRIGHT_BASE_URL`/`BASE_URL`, defaults `http://localhost:3000`)
- [x] 3 specs meaningful — PASS (`shell.spec.ts:23-55` covers `/`, `/deck` 8 slots, `/lobby` input; no socket/REST coverage — ISS-N4-003)

## Issues
### ISS-N4-001 — Missing `playwright.config.ts` (chromium project referenced but absent)
- **Severity**: major
- **Status**: open
- **File**: `frontend/playwright.config.ts` (missing) vs `frontend/package.json:10`, `frontend/tests/README.md:43-45`, `frontend/tests/shell.spec.ts:1-15`
- **Category**: conventions
- **Description**: `package.json:10` defines `test:e2e: playwright test --project=chromium` and `tests/README.md:43-45` says specs expect the `playwright.config.ts` chromium project, but no `playwright.config.*` exists in `frontend/` or repo root (glob + `Get-ChildItem` confirm). `npx playwright test --project=chromium` therefore has no project to select (Playwright errors/no-match on default config). Chromium-only/headless, `baseURL`/`webServer`, and CI e2e per MEMORY#17 cannot run canonically.
- **Repro**: `Get-ChildItem frontend/playwright.config.*` → no hits; `npm run test:e2e` from `frontend/` → project-not-found error.
- **Suggested fix**: Add `frontend/playwright.config.ts` (owned by infra/app-shell agent per `tests/README.md:43`) with single `projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]`, `use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000" }`, `webServer` for CI, `testDir: "./tests"`. Keep chromium-only; never add firefox/webkit.

### ISS-N4-002 — `onMatched` double-fires with hardcoded `side: "blue"` on legacy twin
- **Severity**: major
- **Status**: open
- **File**: `frontend/lib/socket.ts:228-244` vs `backend/src/index.ts:149-164`
- **Category**: correctness
- **Description**: Backend emits BOTH `queue:matched { matchId, opponentId, side, serverTimeMs }` and `match:found { matchId, opponentId }` to each socket (`index.ts:151-164`). `onMatched` subscribes to both and calls `cb` in each handler, so one match fires `cb` twice. The legacy handler hardcodes `side: "blue"` (`socket.ts:237`), so a red-side player gets a second (wrong) callback `{ side: "blue" }` that can flip UI state set from the correct first callback `{ side: "red" }`.
- **Repro**: Two clients join queue → each receives `queue:matched` then `match:found`; `onMatched` counter increments 2x per match; red client second payload has `side === "blue"`.
- **Suggested fix**: Dedupe by `matchId` (e.g. ignore `match:found` if `queue:matched` already seen for that `matchId` within N sec), or drop the legacy subscription once backend removes the twin, or carry the canonical `side` through (cache last `queue:matched` side per `matchId` instead of hardcoding `"blue"`).

### ISS-N4-003 — No test coverage for `socket.ts` / `api.ts` (net client untested)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/tests/shell.spec.ts:1-56` (only file in `frontend/tests/`)
- **Category**: conventions
- **Description**: The 3 specs are meaningful shell smoke tests (`/` title+3 buttons, `/deck` 8×`card-slot`, `/lobby` player input) — that goal PASSES. But net scope has zero coverage: no unit/mock-socket test asserting emit names (`queue:join`, `deck:select`, `card:play { handIndex, x, y }`, `emote:send`, `match:sync`), no `serverTimeMs` tracking test, no error-twin coalescing test, no REST shape test (`/health`, `/bot/move`, `/balance/cards`). Event drift (e.g. ISS-N4-002) will not be caught.
- **Repro**: `Get-ChildItem frontend/tests/` → only `shell.spec.ts` + `README.md`; grep `socket|api` in `frontend/tests/` → no hits.
- **Suggested fix**: Add `frontend/tests/net.spec.ts` (vitest or Playwright-independent): mock `socket.io-client` server, assert emit payloads match `GAME_DESIGN.md §12.1`, assert `queue:matched` sets `getLastServerTimeMs()`, assert `onGameError` coalesces `error`+`error:game` twins. Add `api` shape test with mocked fetch. Keep shell specs untouched.

### ISS-N4-004 — `ping()` uses `s.once("pong")`: concurrent-ping race + leaked listener on timeout
- **Severity**: minor
- **Status**: open
- **File**: `frontend/lib/socket.ts:196-208`
- **Category**: correctness
- **Description**: Each `ping()` registers `s.once("pong", ...)`. Two concurrent `ping()` calls register two `once` listeners; the first arriving `pong` resolves the first waiter regardless of which request it answers (RTTs can swap). On timeout the timer rejects but the `once` listener stays registered until the next `pong` arrives (resolves an already-settled promise, harmless but leaks one listener per timed-out ping). Backend `pong { received, serverTime }` (`index.ts:258-263`) echoes `received`, but client never correlates it.
- **Repro**: Read `socket.ts:196-208`; call `ping()` twice without awaiting → both `once("pong")` queued; inspect `socket.listeners("pong").length` after a timed-out ping → 1 leftover.
- **Suggested fix**: Correlate via `received` echo (send unique token, resolve only the waiter whose `received` matches), or serialize pings, and remove the `once` listener inside the timeout handler (`s.off("pong", handler)`).

### ISS-N4-005 — `StateUpdate` uses `any[]` + no public `onMatchStart`; `emitWithAck` defaults to `ok:true`
- **Severity**: minor
- **Status**: open
- **File**: `frontend/lib/socket.ts:28-42`, `frontend/lib/socket.ts:123-125`, `frontend/lib/socket.ts:149-158`
- **Category**: conventions
- **Description**: (a) `StateUpdate.towers/units` are `any[]` with eslint-disables instead of `shared/types.ts:39-58` (`Tower`/`Unit`), losing the drift guard the shared package exists for — structurally compatible today, but a wire change will not fail `tsc`. (b) `match:start { matchId, state }` server clock is tracked internally (`socket.ts:123-125`) but there is no exported `onMatchStart` subscriber, so lobby→battle transition code must bypass the wrapper via `getSocket().on(...)` (sequence diagram `GAME_DESIGN.md §12.6` relies on `match:start`). (c) `emitWithAck` resolves `{ ok: true }` when the server never calls back (`socket.ts:157`); for events the server always acks this masks failures (e.g. a future event without ack looks like success).
- **Repro**: `tsc --noEmit` passes even if `towers` shape is wrong (no `any` error due to disable); grep `onMatchStart` in `frontend/` → no hits.
- **Suggested fix**: Import `type { Tower, Unit, GameState } from "@cr/shared"` (or relative `../../shared/types`) for `StateUpdate`; add `onMatchStart(cb)` mirroring `onMatchEnd`; change the no-ack fallback to reject/timeout instead of `ok:true` (or at minimum warn).

### ISS-N4-006 — `getBalanceCards(card)` sends `?card=` but stub server ignores it; `.env.example` omits `NEXT_PUBLIC_AI_URL`
- **Severity**: minor
- **Status**: open
- **File**: `frontend/lib/api.ts:115-119` vs `ai-service/main.py:51-60`; `frontend/.env.example:1-2` vs `frontend/lib/api.ts:30-36`
- **Category**: correctness
- **Description**: (a) `getBalanceCards(card)` appends `?card=<id>` expecting server-side filtering (per `GAME_DESIGN.md §12.5`), but `ai-service/main.py:51-60` declares `def balance_cards() -> dict` with no query param and always returns the full 5-card stub list. Callers passing `card="knight"` get 5 cards, not 1 — frontend must defensively `.find()` client-side until Phase 6 implements the filter. REST shapes themselves (`{ cards: [{ name, win_rate, pick_rate }], note? }`) match. (b) `api.ts:30-36` supports `NEXT_PUBLIC_AI_URL` override, but `.env.example` documents only `NEXT_PUBLIC_BACKEND_URL`, so local AI-URL overrides are undiscoverable. `fetchJson` also sets `Content-Type: application/json` on GETs and has no timeout — harmless, noted only.
- **Repro**: `GET /balance/cards?card=knight` → 5 cards returned; `Get-Content frontend/.env.example` → no `NEXT_PUBLIC_AI_URL`.
- **Suggested fix**: In `api.ts` docs/`getBalanceCards`, filter client-side (`cards.find(c => c.name === card)`) with fallback to full list; add `NEXT_PUBLIC_AI_URL=http://localhost:8000` (+ optional `PLAYWRIGHT_BASE_URL`) to `.env.example`; Phase 6: add `card: str | None = None` query param to `balance_cards()`.

## Counts
- blocker: 0 | major: 2 | minor: 5 | verified: 0

## PASS
- Socket event names/payloads match backend: `queue:join { playerId, deck }` → `joinQueue` (`socket.ts:160-163` vs `index.ts:265-267,118-168`); `queue:leave { playerId }` idempotent ack (`socket.ts:165-168` vs `index.ts:274-280`); `deck:select` same-shape validate-without-queue (`socket.ts:170-173` vs `index.ts:291-300`); `card:play { matchId, playerId, handIndex, x, y, cardId?, at?, clientTick? }` canonical + back-compat (`socket.ts:175-188` vs `index.ts:302-304,170-229` + `shared/types.ts:139`); `emote:send` relay + 1/5s ack-only throttle (`socket.ts:190-193` vs `index.ts:306-308,231-252`); `ping→pong` + `serverTime ≡ serverTimeMs` handled on both keys (`socket.ts:129-131,196-208` vs `index.ts:258-263`); `match:sync` reconnect (`socket.ts:211-213` vs `index.ts:311-316`); server `queue:matched { matchId, opponentId, side, serverTimeMs }` + `match:found` twin, `match:start`, canonical `state:update` (no `match:state`), `match:end { matchId, winner, crowns }` (`rooms.ts:445,461-466`), identical `error`+`error:game` twins with coalescing (`socket.ts:260-278` vs `index.ts:107-111`); `serverTimeMs` tracked on `queue:matched`/`match:start`/`state:update`/`pong` (`socket.ts:86-96,117-131,218-226`).
- REST shapes match `GAME_DESIGN.md §12.5`: `GET {backend}/health → { ok, service }` (`api.ts:81-84` vs `index.ts:43-45`); `GET {ai}/health` (`api.ts:86-90` vs `main.py:31-34`); `POST {ai}/bot/move { difficulty, game_state? } → { card, x, y, difficulty }` (`api.ts:98-109` vs `main.py:37-48`); `GET {ai}/balance/cards → { cards: [{ name, win_rate, pick_rate }] }` (`api.ts:111-119` vs `main.py:51-60`); env overrides + trailing-slash trim + `encodeURIComponent` (`api.ts:15-36,103-119`).
- Playwright: `shell.spec.ts:17-20` honors `PLAYWRIGHT_BASE_URL`/`BASE_URL` with `localhost:3000` default; 3 specs meaningful (`/:23-30` title+Play/Lobby/Deck, `/deck:32-40` 8 slots, `/lobby:42-55` player-input with fallback); `package.json:10` + `tests/README.md` pin `--project=chromium` headless per MEMORY#17.
- Open items are 2 majors (missing config blocks canonical e2e; `onMatched` double-fire mis-assigns red side on legacy twin) + 5 minors (no net unit tests, ping race, `any[]`/missing `onMatchStart`/ack-default, `?card` stub gap + env example). No blocker. Safe for tester (manual `PLAYWRIGHT_BASE_URL` run works without config) + fix cycle.
