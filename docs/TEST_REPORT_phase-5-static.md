# TEST REPORT — Phase 5 Battle Client (STATIC ONLY)

> Branch: `feature/phase-5-battle-client` | Workdir: `D:\Documents\Projects\CR`
> Mode: STATIC — no servers started, no ports used (`:3000`/`:4000` untouched per MEMORY#19),
> no Playwright run (live tester runs UI separately). Read-only except this file; no commits.
> Date (UTC): 2026-10-16.

## Scope / files read (read-only)

- `MEMORY.md`
- `frontend/package.json`
- `frontend/components/battle/` (5 files: `ArenaCanvas.tsx`, `BattleTopBar.tsx`, `ElixirBar.tsx`, `Hand.tsx`, `TowerView.tsx`)
- `frontend/app/battle/page.tsx` (786 lines, fallback chrome + route)
- `frontend/tests/battle.spec.ts` (94 lines, 3 tests)
- `frontend/lib/battle/useBattle.ts` (553 lines), `frontend/lib/battle/sfx.ts` (137 lines)

## Static checks — PASS/FAIL table

| # | Check (command) | Result | Evidence |
|---|-----------------|--------|----------|
| S1 | `python json load frontend/package.json` | **PASS** | `package.json VALID JSON`; `test:e2e`, `next 14.2.5`, `socket.io-client`, `@playwright/test` present |
| S2 | Route `/battle` exists | **PASS** | `frontend/app/battle/page.tsx` exists (`Test-Path True`), exports default `BattlePage`, `data-testid="battle-page"` |
| S3 | Components exist (5/5) | **PASS** | `ArenaCanvas.tsx`, `BattleTopBar.tsx`, `ElixirBar.tsx`, `Hand.tsx`, `TowerView.tsx` all present |
| S4 | `lib/battle/*.ts` exist (non-JSX) | **PASS** | `useBattle.ts` (17684 B), `sfx.ts` (4064 B) |
| S5a | `node --check frontend/lib/battle/sfx.ts` | **FAIL (expected, non-blocking)** | `SyntaxError: Unexpected token ':'` at `let ctx: AudioContext \| null` — `node --check` does not typecheck TS; authoritative check is tsc (S7). No action. |
| S5b | `node --check frontend/lib/battle/useBattle.ts` | **PASS** | exit 0 (Node 24 type-stripping parses it). Not a real typecheck — see S7. |
| S6a | testid `arena-canvas-wrap` | **PASS** | `ArenaCanvas.tsx:606`, `page.tsx:669` |
| S6b | testid `elixir-bar` | **PASS** | `ElixirBar.tsx:39`, `page.tsx:395` |
| S6c | testids `card-hand-0..3` | **FAIL (contract drift)** | `Hand.tsx:105` uses template ``card-hand-${i}`` (dynamic 0–3, correct per component contract) BUT `page.tsx:457` fallback uses generic `card-hand` and spec asserts `getByTestId("card-hand")` count 4. Spec passes on fallback today, **breaks on merger swap**. Linked ISS-P5-S1. |
| S6d | testid `battle-timer` | **PASS** | `BattleTopBar.tsx:69`, `page.tsx:144` |
| S6e | testid `battle-top-bar` | **PASS** | `BattleTopBar.tsx:46`, `page.tsx:137` |
| S6f | canvas testid contract | **FAIL (contract drift)** | `page.tsx:356` = `battle-canvas` (spec uses this) vs `ArenaCanvas.tsx:614` = `arena-canvas`. Merger swap breaks spec. Linked ISS-P5-S2. |
| S7 | `tsc --noEmit` (battle files) | **PASS** | Filtered `tsc --pretty false \| Select-String battle` → empty (0 battle errors). Repo-wide has 1 pre-existing error in `components/deck/DeckBuilder.tsx(27,18) TS2802` (Phase 4 file, out of scope, noted only). |
| S8 | `battle.spec.ts` test count | **PASS** | 3 tests: `renders canvas + elixir bar + 4-card hand + timer`, `tap-to-deploy…`, `screenshots 390x390…`. Spec testids used: `battle-canvas, battle-error, battle-join, battle-page, battle-timer, card-hand, elixir-bar, next-card` — note `card-hand`/`battle-canvas` match fallback, NOT component testids (`card-hand-0`, `arena-canvas`). |
| S9 | No-live / no-ports compliance | **PASS** | No `npm run dev`, no `playwright`, no `docker`, no kill commands executed. Only `Test-Path`, `Get-ChildItem`, `Select-String`, `node --check`, `python -c json.load`, `npx tsc --noEmit`. |

## Linked ISS (reviewer-owned — NOT created/edited here per parallel-agent rule)

| Proposed ID | Severity | Summary | Location |
|-------------|----------|---------|----------|
| ISS-P5-S1 | **High (merger blocker)** | Hand testid contract drift: fallback `card-hand` (x4) vs component `card-hand-${i}`. Spec asserts the fallback form. Merger must unify + update spec. | `frontend/app/battle/page.tsx:457` vs `frontend/components/battle/Hand.tsx:105` vs `frontend/tests/battle.spec.ts:53,63` |
| ISS-P5-S2 | **High (merger blocker)** | Canvas testid drift: fallback `battle-canvas` vs component `arena-canvas` (+ missing `arena-canvas-wrap` wrapper in fallback has it, ok). Spec asserts `battle-canvas`. Merger must unify + update spec. | `page.tsx:356` vs `ArenaCanvas.tsx:606,614` |
| ISS-P5-S3 | **High (merger blocker)** | Props-interface drift on ALL 5 components (documented as intentional in `page.tsx:11-22` header): `BattleTopBar` (`overtime/muted` vs `isOvertime/isMuted/isMuted + trophies`), `ArenaCanvas` (`renderState/side/selectedCardId/hover/onTile/onHover` vs `towers/entities/selectedCell/mySide/onTileClick`), `ElixirBar` (`value/progress` vs `elixir/max/opponentElixir`), `Hand` (`hand:string[]/selected/nextCard:string` vs `hand:CardInfo[]/selectedIndex/nextCard:CardInfo`). Swap-in without adapter = type + runtime break. Merger must write adapters + update spec. | `page.tsx:115-483` vs `components/battle/*.tsx` |
| ISS-P5-S4 | Low | `DeckBuilder.tsx(27,18) TS2802` pre-existing (needs `--target es2015+` or downlevelIteration); out of Phase 5 scope, flag for Phase 4 owner. | `frontend/components/deck/DeckBuilder.tsx:27` |

Note: `ISSUES_phase-5-*.md` files (if any) are reviewer-owned; this report does not create or edit them.

## Verdict

**STATIC CONDITIONAL PASS** — route, all 5 components, both lib files, required testids, and 3-spec file are present; `package.json` is valid; `tsc --noEmit` is clean for all battle files.

**Merge is BLOCKED on ISS-P5-S1/S2/S3** (fallback-vs-component contract drift explicitly noted in `page.tsx` header as awaiting merger): testids (`battle-canvas`→`arena-canvas`, `card-hand`→`card-hand-0..3`) and props interfaces differ on every component, so a naive import swap breaks the spec and `tsc`. The merger/fixer (only role allowed cross-file edits) must reconcile contracts + update `battle.spec.ts` before Phase 5 can be called done. Live Playwright verification is deferred to the live tester (separate report).

Commands used (static only, no ports): `Test-Path`/`Get-ChildItem` (routes/components), `node --check` (S5), `python -c json.load` (S1), `Select-String data-testid` (S6), `Select-String test(` count (S8), `npx tsc --noEmit --pretty false` (S7).
