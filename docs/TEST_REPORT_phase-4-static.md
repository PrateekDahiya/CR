# TEST REPORT — Phase 4 Frontend Shell (static)

> Agent: static test agent (CR Clone Phase 4) | Branch: `feature/phase-4-frontend-shell`
> Date (UTC): 2026-10-16 | Workdir: `D:\Documents\Projects\CR`
> Scope: `frontend/app/` (page, lobby/page, deck/page), `frontend/lib/` (cards, api, socket), `frontend/components/deck/`, `frontend/tests/shell.spec.ts`, `frontend/package.json`
> Method: STATIC ONLY (no live server, no Playwright run) — `node --check`, `python json.load`, route existence, `validateDeck`/`DeckBuilder` slot check, spec 3-test check, `data-testid` scan
> Inputs read (no edit): `MEMORY.md`, `frontend/package.json`, `frontend/app/page.tsx`, `frontend/lib/cards.ts`, `frontend/lib/socket.ts`, `frontend/tests/shell.spec.ts` (+ read-only: `frontend/lib/api.ts`, `frontend/app/lobby/page.tsx`, `frontend/app/deck/page.tsx`, `frontend/components/deck/DeckBuilder.tsx`, `frontend/components/deck/CardTile.tsx`, `frontend/app/layout.tsx`)
> Constraint obeyed: never read/touched `CRclone`; did NOT touch `docs/ISSUES_*.md` (reviewers own those per MEMORY#16). Only file written: this report. No commits.

## 1. Verdict: FAIL (5/9 PASS, 4 FAIL — 3 blockers for fix cycle, no live run)

Phase 4 frontend shell is structurally complete (routes + lib + spec files all exist, `validateDeck` + 8-slot logic correct, `package.json` valid) but the **Playwright contract in `frontend/tests/shell.spec.ts` is broken by the implementation**: zero `data-testid` attributes exist in any source file, the home test expects `button` roles the page does not render, and the deck test expects 8× `card-slot` nodes that are never emitted. As-written, 2 of 3 spec tests cannot pass even before a live run. Lobby passes only via the spec's fallback selector, not the preferred `player-id-input` id.

No `docs/ISSUES_phase-4*.md` file existed at check time (see §5 — linked-ISS column below uses *proposed* IDs for the review/fix agents; this agent created none).

## 2. PASS/FAIL table (requirements)

| # | Requirement | Result | Evidence | Linked ISS (proposed — reviewers own file) |
|---|-------------|--------|----------|---------------------------------------------|
| (1) | `node --check` on `lib/cards.ts`, `lib/api.ts`, `lib/socket.ts` (note JSX if fails) | **PASS** | `node --check` on all three → exit 0, no output (`node v24.16.0`). No JSX in these files so check is meaningful (not full `tsc`; Node 24 type-strips TS). Files are pure TS transport/lib, no React imports. | — |
| (2) | `python json.load package.json` | **PASS** | `json.load` OK. Scripts: `dev, build, start, lint, test:e2e` (`test:e2e = playwright test --project=chromium`). Deps: `next 14.2.5, react, react-dom, socket.io-client`. DevDeps include `@playwright/test ^1.49.1, typescript, tailwindcss`. | — |
| (3) | Routes exist: `app/page`, `lobby/page`, `deck/page` | **PASS** | `Test-Path` → True for all three (`frontend/app/page.tsx`, `frontend/app/lobby/page.tsx`, `frontend/app/deck/page.tsx`) + `app/layout.tsx` present with title `CR Clone`. Branch verified `feature/phase-4-frontend-shell` (`git branch --show-current`). | — |
| (4) | DeckBuilder 8 slots | **PASS (logic) / FAIL (contract)** | Logic PASS: `DeckBuilder.tsx` imports `DECK_SIZE`, renders `Array.from({ length: DECK_SIZE })` slot grid, `DECK_SIZE = 8` in `lib/cards.ts`. Contract FAIL: **0 occurrences** of `card-slot` in `DeckBuilder.tsx`/`CardTile.tsx` — spec's `locator('[data-testid="card-slot"]')` finds nothing. Counted under (7); fix is one-line per slot. | Proposed ISS-001 (blocker): deck slots missing `data-testid="card-slot"` |
| (5) | `validateDeck` present | **PASS** | `export function validateDeck` in `frontend/lib/cards.ts:306` (exactly 8 distinct known ids, max 2 spells, `DECK_SIZE=8`, `MAX_SPELLS=2`); imported + used in `DeckBuilder.tsx` (`validateDeck(deck)` → Valid/Invalid badge). Starter decks `STARTER_DECK_BALANCED`/`HEAVY` both legal. | — |
| (6) | Playwright spec 3 tests present | **PASS** | `frontend/tests/shell.spec.ts` contains exactly 3 `test(` cases: `home / loads title CR Clone + 3 buttons`, `deck /deck renders 8 slots`, `lobby /lobby shows player input`. Chromium-only, `BASE` fallback `http://localhost:3000`. File exists; syntax not executed (static only). | — |
| (7) | `data-testid` scan | **FAIL** | Scan of all `frontend/**/*.tsx|ts`: **zero** `data-testid` in source (`app/page, lobby/page, deck/page, layout, DeckBuilder, CardTile, lib/*` all report `no testid`). Only hits are the 4 references *inside* `shell.spec.ts` itself (2× `card-slot`, 2× `player-id-input`). So deck-test and preferred lobby selector have nothing to match. | Proposed ISS-001 (blocker, deck) + ISS-002 (major, lobby `player-id-input`) |
| (8) | Home spec matches implementation (title + 3 buttons) | **FAIL** | Spec expects `getByRole("button", {name: /^Play$/|/^Lobby$/|/^Deck$/ })`. Implementation `app/page.tsx` renders three `<Link>` (`role=link`, labels `Play vs AI`, `Play 1v1`, `Deck`) + `<h1>CR Clone</h1>` + backend status dot. Zero `<button>` in file. Title/heading part passes; the three button assertions fail as-written. Layout nav adds Menu/Lobby/Deck links but does not satisfy button roles either. | Proposed ISS-003 (blocker): home shell uses Links, spec expects buttons |
| (9) | Lobby input present (preferred `player-id-input` / fallback text input) | **PASS (fallback) / FAIL (preferred)** | Lobby `lobby/page.tsx` renders one `<input type="text" id="playerId" placeholder="e.g. player-1">` → spec fallback selector (`input[type=text], input:not([type)], …`) PASSES. Preferred `[data-testid="player-id-input"]` count = 0 → preferred assertion path FAILS. | Proposed ISS-002 (major): add `data-testid="player-id-input"` to lobby input |

## 3. Check details / commands run

All from workdir `D:\Documents\Projects\CR`, branch `feature/phase-4-frontend-shell` (`git branch --show-current` OK; status shows expected shell-phase modifications only — left untouched per MEMORY#16):

```powershell
# branch / tree
git branch --show-current
# toolchain
node --version  # v24.16.0
node --check frontend/lib/cards.ts   # exit 0
node --check frontend/lib/api.ts     # exit 0
node --check frontend/lib/socket.ts  # exit 0
# package.json
python -c "import json; d=json.load(open('frontend/package.json')); print(...)"
# routes
Test-Path frontend/app/page.tsx, frontend/app/lobby/page.tsx, frontend/app/deck/page.tsx  # True x3
# slots / testids / spec (via C:\Users\prate\AppData\Local\Temp\opencode\static_check.py, utf8)
#  - DeckBuilder: DECK_SIZE import True, Array.from DECK_SIZE True, card-slot count 0
#  - cards.ts: validateDeck True, DECK_SIZE=8 True, MAX_SPELLS=2 True
#  - frontend scan: 0 testid in 9 source files; shell.spec.ts: 4 testid refs, 3 test( cases
# socket/api exports (static_check2.py): connect/disconnect/joinQueue/leaveQueue/selectDeck/
#  playCard/sendEmote/ping/requestSync/onStateUpdate/onMatched/onMatchEnd/onGameError all OK;
#  api backendUrl/aiUrl/getHealth/getAiHealth/postBotMove/getBalanceCards all OK
```

Expected vs actual:

```text
node --check x3 ............ expected exit 0, got exit 0 (PASS)
package.json load .......... expected valid JSON + test:e2e + playwright, got all (PASS)
routes ..................... expected 3 files, got 3 (PASS)
DeckBuilder slots .......... expected 8 slot nodes with card-slot id, got 8 slot divs with NO id (FAIL-contract)
validateDeck ............... expected exported + wired, got exported + wired (PASS)
spec 3 tests ............... expected 3, got 3 (PASS)
data-testid ................ expected card-slot x8 + player-id-input x1 in source, got 0 (FAIL)
home buttons ............... expected button Play/Lobby/Deck, got link Play vs AI/Play 1v1/Deck (FAIL)
lobby input ................ expected preferred testid, got fallback-only input (PARTIAL)
```

No live checks run (out of scope for this static report): `npm run dev`, `npm run build`, `npx playwright test --project=chromium` NOT executed; no screenshots.

## 4. Findings for fix agents (do NOT file here — reviewers own `docs/ISSUES_phase-4*.md`)

1. **Deck slots need `data-testid="card-slot"`** (proposed blocker). Add to the 8 slot `<div>`s in `DeckBuilder.tsx` slot grid (`Array.from({ length: DECK_SIZE })` block, ~lines 96–125). Keep pool `CardTile` on a different id (spec contract comment says pool must NOT use `card-slot`).
2. **Lobby input needs `data-testid="player-id-input"`** (proposed major). One-line add to `<input id="playerId">` in `app/lobby/page.tsx` (~line 113). Fallback keeps test green meanwhile, but preferred id is the contract.
3. **Home shell vs spec role mismatch** (proposed blocker — needs reviewer decision, not blind fix). Either (a) change spec to `getByRole("link", …)` matching `Play vs AI / Play 1v1 / Deck`, or (b) change `app/page.tsx` to render actual `<button>`s named `Play/Lobby/Deck`. Current code + current spec cannot both be right. Note `page.tsx` links go to `/lobby?mode=ai`, `/lobby?mode=pvp`, `/deck` — sensible UX; spec update (option a) is likely cheaper.
4. Non-blocking notes: `socket.ts`/`api.ts` export surfaces match GAME_DESIGN §12 (queue/deck/card/emote/ping/sync + health/bot/balance) — static presence only, live ACK/error paths still untested (needs Phase 4 live/UI agents per MEMORY#17). `node --check` is NOT a typecheck — recommend `npx tsc --noEmit` in live phase.

## 5. Linked ISS status

- `docs/` listing at check time contained `ISSUES_phase-1*`, `ISSUES_phase-2*`, `ISSUES_phase-3*` only — **no `ISSUES_phase-4*.md` present**, so there are no stable ISS IDs to link. The `Proposed ISS-001/002/003` labels in §2 are suggestions for the parallel review agents; this agent files nothing there per task constraints.
- Fix agents: wait for reviewers' `docs/ISSUES_phase-4*.md`, then map §2 rows (4)/(7)/(8)/(9) to their IDs and verify with a live Chromium run (`npx playwright test --project=chromium` + `npm run dev` on :3000).

## 6. Verdict restated

**FAIL (static)** — implementation is complete and internally consistent, but the Playwright shell contract is currently unpassable (missing testids + button/link mismatch). Fix cycle required on the three proposed items above, then re-run this static scan plus the MEMORY#17 live/UI pass before merging to `main`.
