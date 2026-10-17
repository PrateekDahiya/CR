# ISSUES — phase-5-flow (2026-10-17, reviewer: flow/hand agent)

> Scope: elixir/hand/topbar + battle flow + spec. Read-only except this file. No commits.
> Parallel-agent note (MEMORY#16): arena + static tester working concurrently — this file only;
> did not touch `docs/ISSUES_phase-5-arena.md`, TEST_REPORTs, CRclone, :3000/:4000.

## Summary
- Scope reviewed: `frontend/components/battle/ElixirBar.tsx`, `frontend/components/battle/Hand.tsx`, `frontend/components/battle/BattleTopBar.tsx`, `frontend/app/battle/page.tsx`, `frontend/lib/battle/useBattle.ts`, `frontend/lib/battle/sfx.ts`, `frontend/tests/battle.spec.ts`, `frontend/lib/socket.ts`, `shared/types.ts` (+ `frontend/lib/cards.ts`, `frontend/components/battle/ArenaCanvas.tsx`, `docs/UI_REFERENCE.md §§4-6/8`, `docs/GAME_DESIGN.md §12` as refs)
- Commit/branch: `feature/phase-5-battle-client@4aff0d1`
- Verdict: **pass-with-issues** — sibling presentational components are spec-faithful in isolation; `/battle` fallback route works offline; merger is BLOCKED by fallback-vs-sibling prop/testid incompatibility (ISS-F5-001/002/005) + OT heuristic (ISS-F5-004). No Supercell assets found (emoji/CSS only — legal OK).

## PASS (verified, no issue filed)
- **PASS-01 Elixir purple gradient + 10 pips + number + shake:** `ElixirBar.tsx:23,30-104` — `linear-gradient(180deg,#c93cff,#a83cf0,#8a2be2)` matches UI_REFERENCE §4; 10 diamond (`rotate-45`) pips; number left (`elixir-count`, floored server float per GAME_DESIGN §7); `elixir-full-shake` + glow when `floored>=10`; `transition-[width] duration-300` fill animates per tick.
- **PASS-02 Elixir leak prop:** `ElixirBar.tsx:20,108-117` — optional `opponentElixir?: number|null` renders right-side `elixir-leak` (👁+floored) only when non-null. Matches UI_REFERENCE §5 spectator number.
- **PASS-03 Hand 4 slots + rarity + cost + Next:** `Hand.tsx:62-147` — `hand.slice(0,4)`, rarity borders common grey / rare orange / epic purple / legendary ring-approx, cost badge top-left (`card-hand-cost-i`, purple→red when unaffordable), emoji art + name, greyed (`opacity-50 grayscale`) when `cost>floor(elixir)`, gold glow + `ring-yellow-300` when selected, `Next:` mini preview (`card-next`) left of hand.
- **PASS-04 TopBar timer m:ss + OT + mute/emote:** `BattleTopBar.tsx:25-30,62-79,98-119` — `formatBattleTime` → `m:ss`; OT pulses + `⚡` + `OT` badge; `emote-button` + `mute-toggle` with correct aria-pressed/labels; enemy/player trophy + name slots.
- **PASS-05 Page localStorage keys:** `page.tsx:45-46,88-109` — `cr-player-id` + `cr-clone-deck-v1` exactly as required; JSON-parse guarded, filters unknown ids via `getCard`, falls back to starter 8.
- **PASS-06 Socket events + twins:** `socket.ts:161-213,228-278` + `useBattle.ts:233-267,302-408` — `deck:select → queue:join → queue:matched/match:start → state:update (10Hz) → card:play {handIndex,x,y,clientTick} → match:end`; `match:sync` resync; `queue:matched+match:found`, `error+error:game` (100ms coalesce) twins handled; `ping/pong` accepts `serverTime|serverTimeMs` per GAME_DESIGN §10.
- **PASS-07 SFX WebAudio mute persist:** `sfx.ts:11,36-65,95-137` — oscillator-only stub (deploy pop / hit thud / invalid buzz / win arpeggio / lose descend), no audio assets; mute persisted `cr-clone-muted` 1/0 + in-memory cache; SSR-guarded (`window` checks).
- **PASS-08 shared/types additive-only:** `shared/types.ts:91-160` — `CardStats/DeployRequest/ServerTick/CardPlayPayload/SocketEventsV2/Ack` additive; no renames/removals of `Card/Tower/Unit/GameState/SocketEvents`; wire stays JSON-only ms timestamps.
- **PASS-09 Elixir rate constants:** `useBattle.ts:79-88` — `REGULATION_MS 180000`, `DOUBLE_ELIXIR_AT_MS 120000`, `elixirRateFor` 1/2.8 vs 1/1.4 matches GAME_DESIGN §7.
- **PASS-10 Original-art only:** all chrome uses Tailwind gradients + emoji (🏰👑⚔️🟣); no PNG/MP3 committed; headers cite "inspired by, not copied".

## Issues
### ISS-F5-001 — Fallback-vs-sibling props NOT swappable (merger blocker)
- **Severity**: blocker
- **Status**: open
- **File**: `frontend/app/battle/page.tsx:115-482`
- **Category**: correctness
- **Description**: Header comment claims local fallbacks are "props-compatible" with `components/battle/*` so merger can "swap local definitions for import". They are not: ElixirBar fallback `{value,progress}` vs sibling `{elixir,max?,opponentElixir?}`; Hand fallback `{hand:string[],nextCard:string|null,elixir,selected,onSelect}` vs sibling `{hand:CardInfo[],elixir,selectedIndex?,nextCard?:CardInfo|null,onSelect?}`; BattleTopBar fallback `{enemyName,playerName,timeLeftSec,overtime,muted,...}` vs sibling `{enemyName,enemyTrophies?,playerName,playerTrophies?,timeLeftSec?,isOvertime?,isMuted?,...}`; ArenaCanvas fallback `{renderState,side,selectedCardId,hover,...}` vs sibling `{towers,entities/units,selectedCell,mySide,...}`. A mechanical import swap breaks `tsc` + runtime. Call sites at `page.tsx:633-723` bind fallback prop names.
- **Repro**: `grep -n "function BattleTopBar\|function ElixirBar\|function Hand\|function ArenaCanvas" frontend/app/battle/page.tsx` vs sibling `Props` interfaces; attempt import swap → type errors.
- **Suggested fix**: Merger picks ONE contract (recommend sibling props — they match UI_REFERENCE testids), rewrites `page.tsx` call sites + `battle.spec.ts` testids in a single commit; delete fallback block; update header comment with chosen prop table. Do not leave both contracts live.

### ISS-F5-002 — Spec testid contract matches fallback only, fails post-swap
- **Severity**: major
- **Status**: open
- **File**: `frontend/tests/battle.spec.ts:50-54`
- **Category**: correctness
- **Description**: Spec asserts `battle-canvas` + `card-hand`×4 + `next-card` + `elixir-pip-filled/empty` + `battle-join`. Siblings expose `arena-canvas` (ArenaCanvas.tsx:615), `card-hand`×1 wrapper + `card-hand-0..3` (Hand.tsx:72,105), `card-next` (Hand.tsx:77), `elixir-pip-0..9` + `elixir-count/fill/leak` (ElixirBar.tsx:60,83,95,111), no `battle-join` equivalent in sibling set. Spec passes on current fallback route but goes red the moment ISS-F5-001 is fixed by importing siblings. Also `card-hand-cost-i`, `elixir-leak`, `mute-toggle`, `emote-button` are never asserted.
- **Repro**: Replace fallback Hand/ElixirBar with sibling imports → `npx playwright test --project=chromium tests/battle.spec.ts` fails on `card-hand` count + `next-card` + `battle-canvas`.
- **Suggested fix**: After ISS-F5-001, update spec to assert BOTH contracts during transition or lock to canonical: `card-hand-0..3`, `card-next`, `elixir-bar`, `elixir-pip-*`, `battle-timer`, `battle-top-bar`, `mute-toggle`, `emote-button`; keep `battle-canvas`→`arena-canvas` alias assertion until route migrates. Add cost-badge + rarity-border + leak assertions.

### ISS-F5-003 — Elixir pip testids + fractional progress diverge
- **Severity**: major
- **Status**: open
- **File**: `frontend/components/battle/ElixirBar.tsx:95`
- **Category**: conventions
- **Description**: Sibling uses single-shape `elixir-pip-{i}` (filled = white vs empty) + fill-width `%` for fraction; fallback uses `elixir-pip-filled`/`elixir-pip-empty` + per-pip `progress` gradient (`page.tsx:410-415`). Neither is wrong alone, but e2e + arena-agent code referencing one shape fails on the other. Sibling also uses `role=progressbar` while fallback uses `role=meter`.
- **Repro**: `grep -rn "elixir-pip" frontend/` shows two disjoint naming schemes.
- **Suggested fix**: Canonicalize on sibling `elixir-pip-{i}` (keeps 10-pip count stable per wiki ref) + keep fill-width fractional display; add `data-filled="true|false"` attribute so both assertion styles work; unify `role` to `progressbar`.

### ISS-F5-004 — Overtime heuristic conflates double-elixir with sudden death; OT timer stuck at 0:00
- **Severity**: major
- **Status**: open
- **File**: `frontend/app/battle/page.tsx:591`
- **Category**: correctness
- **Description**: `overtime = timeLeftSec <= 60 && phase==="in-match"` lights ⚡+OT styling for the entire last regulation minute, but GAME_DESIGN §8 says last 60s is double-elixir, NOT overtime — OT exists only if tied at 180s, then 60s sudden death to hard cap 240s. `useBattle.ts:510-514` clamps `timeLeftSec` at 0, so true OT (t>180s) still displays `0:00`. No server OT signal (`endsAtMs`/`winner`/`crowns`) is consulted.
- **Repro**: Join match, reach t=120s → topbar shows OT badge a full minute early; force OT → timer frozen at 0:00.
- **Suggested fix**: Rename current flag to `isDoubleElixir` (show ⚡ rate hint, not `OT` badge); derive true `isOvertime` from server clock (`serverNowMs - matchStartMs > 180000` AND no winner yet, or `endsAtMs` extension) and count OT as `60 - (elapsed-180)`; keep regulation countdown clamped 0. Document mapping in code comment citing §8.

### ISS-F5-005 — Canvas testid + interaction contract mismatch (touch/hover lost on swap)
- **Severity**: major
- **Status**: open
- **File**: `frontend/app/battle/page.tsx:332-382`
- **Category**: correctness
- **Description**: Fallback canvas is `data-testid="battle-canvas"` with click+mousemove+mouseleave+touchstart and hover-validity ring via `isDeployValid`; sibling `ArenaCanvas.tsx:605-616` is `data-testid="arena-canvas"` with click-only (`onTileClick`), no touch handler, hover via `selectedCell` prop instead. Spec asserts `battle-canvas` (`battle.spec.ts:50`). Swapping to sibling breaks spec + drops mobile tap-to-deploy (primary 390x844 target per UI_REFERENCE §7).
- **Repro**: Import sibling ArenaCanvas into page → spec `battle-canvas` lookup fails; manual mobile emulation loses touch deploy.
- **Suggested fix**: Merger: keep `battle-canvas` as alias testid on sibling wrapper (or assert both), add `onTouchStart`→`onTileClick` parity to sibling, and wire `selectedCell` from page hover state. Verify 390x844 touch deploy in Playwright with `hasTouch: true`.

### ISS-F5-006 — Nested setState updaters (StrictMode double-invoke risk)
- **Severity**: major
- **Status**: open
- **File**: `frontend/lib/battle/useBattle.ts:419-444`
- **Category**: correctness
- **Description**: 60fps loop calls `setDisplayElixir/setElixirProgress/setRenderState/setPrevSnapshot` INSIDE a `setSnapshot` updater; `deploy()` calls `setQueue` inside a `setHand` updater (`useBattle.ts:485-495`). React may double-invoke updaters in StrictMode → hand cycles twice per deploy (card duplicated/lost from queue rotation) and extra renders per frame. Current manual QA may miss it because dev StrictMode is the trigger.
- **Repro**: Enable StrictMode, deploy one card, observe `hand`/`queue` — played card appears twice or queue order shifts by 2.
- **Suggested fix**: Compute from refs/locals outside updaters: read `snapshotRef.current`, then flat `setHand`/`setQueue`/`setDisplayElixir`/`setRenderState` calls sequentially; store latest snapshot in a ref mirror. Add unit test for single-deploy single-rotation.

### ISS-F5-007 — `isDeployValid` omits pocket-4 + tower-footprint (false red-X on legal pocket plays)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/lib/battle/useBattle.ts:94-107`
- **Category**: correctness
- **Description**: Client hint mirrors §5.3 own-half + river + spell-anywhere but omits pocket extension (Blue `y17-20` / Red `y11-14` on taken lane side after princess kill) and 1×1 tower-footprint exclusion. After a tower kill, legal pocket taps show red X + "Invalid spot" toast while server would accept (server authoritative per §11 — no desync, but UX false-negative).
- **Repro**: Kill enemy princess, tap pocket band y17-20 → client blocks, server `card:play` would ack ok.
- **Suggested fix**: Accept optional `pocketSides?: {left:boolean;right:boolean}` (derived from `renderState.towers destroyed flags`) in `isDeployValid`; allow pocket y-bands when set, else keep current conservative check with comment "hint-only, server wins". ArenaCanvas sibling already draws pocket dotted lines — reuse its side logic.

### ISS-F5-008 — Screenshot path resolves under `frontend/docs/` instead of repo `docs/`
- **Severity**: minor
- **Status**: open
- **File**: `frontend/tests/battle.spec.ts:83-87`
- **Category**: conventions
- **Description**: Paths `"docs/screenshots/phase-5-battle-{mobile,desktop}.png"` are relative to CWD. Run canonically from `frontend/` (`npx playwright test`) → files land at `frontend/docs/screenshots/`, not repo `docs/screenshots/` required by UI_REFERENCE §8. Also both viewports (390x844 + 1280x720) are correct per MEMORY#18, but mobile shot is overwritten by desktop in the same test (sequential `setViewportSize`) — single-file-per-viewport is intended, paths are right, base is wrong.
- **Repro**: `Set-Location frontend; npx playwright test --project=chromium tests/battle.spec.ts; Get-ChildItem docs/screenshots` appears under frontend/.
- **Suggested fix**: Use `"../docs/screenshots/phase-5-battle-mobile.png"` / `"-desktop.png"` (or `path.resolve(__dirname,"../../docs/screenshots/...")`); document CWD in `tests/README.md`.

### ISS-F5-009 — Fallback TopBar drops trophies + renames mute testid
- **Severity**: minor
- **Status**: open
- **File**: `frontend/app/battle/page.tsx:126-177`
- **Category**: conventions
- **Description**: Fallback TopBar omits `enemyTrophies/playerTrophies`, renames `muted→muted`/`overtime→overtime` (sibling: `isMuted/isOvertime`), uses `data-testid="battle-mute"` instead of canonical `mute-toggle`, drops `enemy-info/player-info/emote-button` testids, and styles timer without OT pulse ring. Any test/fix agent targeting sibling testids misses the live route.
- **Repro**: `grep -n "mute-toggle\|battle-mute\|enemy-info" frontend/app/battle/page.tsx frontend/components/battle/BattleTopBar.tsx`.
- **Suggested fix**: Align fallback testids to sibling names now (`mute-toggle`, `emote-button`, `enemy-info`, `player-info`) even before full prop swap; pass through trophy counts from lobby/player defaults.

### ISS-F5-010 — Legacy `match:found` twin synthesizes `side:"blue"` (wrong-half tint for red)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/lib/socket.ts:235-237`
- **Category**: correctness
- **Description**: `match:found {matchId,opponentId}` carries no side; `onMatched` legacy adapter defaults `side:"blue"`. A red-side player whose client processes the legacy event first gets blue deploy tint (`y0-14`) until canonical `queue:matched` arrives → taps own (bottom) half flagged invalid briefly.
- **Repro**: Force server to emit `match:found` before `queue:matched` for a red player → `side` flickers blue→red.
- **Suggested fix**: In legacy adapter, preserve current side instead of hardcoding blue (or mark `side:"unknown"` and skip tint until canonical arrives). One-line change; add comment citing GAME_DESIGN §12.7 twin note.

### ISS-F5-011 — `matchStartMsRef` never reset on leave (stale timer on Play Again)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/lib/battle/useBattle.ts:269-288`
- **Category**: correctness
- **Description**: `leave()` clears matchId/snapshots/phase but not `matchStartMsRef`/`lastServerMsRef`. `handlePlayAgain` (`page.tsx:603-607`) calls `leave(); join()` — until the next `queue:matched` arrives, `timeLeftSec` (derived from stale start) shows mid-game time on the idle/searching screen instead of 3:00.
- **Repro**: Play 60s, Play Again → searching overlay briefly shows ~2:00 instead of 3:00.
- **Suggested fix**: Reset `matchStartMsRef.current = 0` in `leave()` and at `join()` start; guard `timeLeftSec` to return 180 when `phase!=="in-match"`.

### ISS-F5-012 — Spec asserts offline-only; mute/emote/leak/rarity/cost unasserted
- **Severity**: minor
- **Status**: open
- **File**: `frontend/tests/battle.spec.ts:45-93`
- **Category**: conventions
- **Description**: Current 3 tests cover canvas+bar+hand+timer render, offline select→deploy-notice, and viewport screenshots — all without backend. No assertions for mute toggle persistence (`cr-clone-muted`), emote send path, `elixir-leak` spectator number, rarity border classes, cost-badge red state, or OT/double-elixir display. Live socket flow is the static tester's lane, but the spec's UI_REFERENCE §8 checklist (portrait arena, river/bridges, towers HP, timer, 10 pips, hand+Next, deploy, win overlay) is only partially encoded.
- **Repro**: `npx playwright test --project=chromium tests/battle.spec.ts` passes even with mute button removed (no assertion).
- **Suggested fix**: Add lightweight offline assertions: `mute-toggle` click flips `localStorage cr-clone-muted`; `card-hand-cost-0` visible; `card-next` title starts with `Next:`; `elixir-pip-*` count 10. Leave live match flow to TEST_REPORT live lane (ephemeral ports per MEMORY#17, never :3000/:4000).

## Counts
- blocker: 1 | major: 5 | minor: 6 | verified: 0
