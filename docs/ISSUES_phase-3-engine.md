# ISSUES — phase-3-engine (2026-10-17, reviewer: review-agent-phase-3-engine)

> Scope: engine + tests review on `feature/phase-3-backend-server`.
> Read (no edits): `MEMORY.md`, `docs/GAME_DESIGN.md` §§1–11,
> `backend/src/game/cards.ts`, `backend/src/game/arena.ts`,
> `backend/src/game/engine.ts`, `backend/tests/engine.test.ts`,
> `backend/tests/validation.test.ts`. `CRclone` never touched.
> Verification: `npm test` 33/33 pass; `npx tsc --noEmit` clean;
> plus ad-hoc `node --import tsx` probes (card table, arena constants,
> pocket/footprint/spell-zones, chip-leader @180s, OT sudden-death,
> zap stun, golem burst, cannon timers) — all PASS (see PASS section).

## Summary
- Scope reviewed: `backend/src/game/cards.ts`, `backend/src/game/arena.ts`, `backend/src/game/engine.ts`, `backend/tests/engine.test.ts`, `backend/tests/validation.test.ts` vs `docs/GAME_DESIGN.md` §§1–11
- Commit/branch: `feature/phase-3-backend-server`@`cf00bdb` (engine/tests are uncommitted worktree files on top)
- Verdict: pass-with-issues (engine implements the normative spec correctly; 1 minor defense-in-depth gap + test-coverage gaps; no blocker)

## Issues
### ISS-E3-001 — `createGame` accepts duplicate / 3-spell decks (deck rule enforced only in `cards.validateDeck`)
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/game/engine.ts:229`
- **Category**: correctness
- **Description**: `createGame` checks `deck.length === 8` + known ids only. It does not reject duplicate ids or `spells > 2` (GAME_DESIGN §4/§11: exactly 8 distinct, max 2 spells → `BAD_DECK`). `cards.validateDeck` enforces both, but nothing wires it into `createGame` — verified: `createGame('dup', D, [knight x2, ...])` does not throw. An illegal deck enters the sim if the net layer ever skips `validateDeck` at `queue:join`.
- **Repro**: `node --import tsx -e "import {createGame} from './src/game/engine.ts'; createGame('d',['knight','archers','fireball','musketeer','giant','skeletons','baby-dragon','cannon'],['knight','knight','archers','giant','skeletons','musketeer','baby-dragon','fireball']); console.log('no throw')"` → prints `no throw`
- **Suggested fix**: call `validateDeck` inside `createGame` and throw on error (or return a typed error); keep the net-layer `BAD_DECK` mapping at `queue:join`.
- **Fixes**:

### ISS-E3-002 — zero test assertions on the 12-card stat table (`cards.ts` unguarded against typos)
- **Severity**: minor
- **Status**: open
- **File**: `backend/tests/engine.test.ts:1`
- **Category**: conventions
- **Description**: No test imports `CARDS`/`CARD_LIST`/`validateDeck`. A typo in HP/damage/cost/range/speed/towerDamage/stun/burst/lifetime (GAME_DESIGN §1: Knight 1450/165/1.1, Archers 300x2/5.5, Giant 3400/buildings, Skeletons 80x3, Musketeer 600/6.0, Baby Dragon 1100/splash/flying, Mini P.E.K.K.A 550, Golem 4300+280/2.0, Fireball 700/280, Arrows 300/120, Zap 220/88+0.5s, Cannon 750/262/30s/1.0s, 40% tower rule, deck rule 8-distinct/≤2-spells) would ship silently. This review verified every value programmatically (all match), but nothing in CI pins them.
- **Repro**: `grep -rn "CARDS\|validateDeck" backend/tests/` → no hits
- **Suggested fix**: add `backend/tests/cards.test.ts` asserting cost/HP/damage/hitSpeed/range/sight/targets/count/radius/towerDamage/stun/burst/lifetime per card + `validateDeck` accept/reject cases (starter decks §4, 3-spell, dup, unknown, wrong length).
- **Fixes**:

### ISS-E3-003 — zero test assertions on arena geometry constants and tower spawns
- **Severity**: minor
- **Status**: open
- **File**: `backend/tests/engine.test.ts:1`
- **Category**: conventions
- **Description**: Nothing asserts 18×32 grid, river band y 15–16, bridges x 3–4/13–14, deploy bands (Blue y 0–14 / Red y 17–31), pocket 4 tiles (Blue ≤20 / Red ≥11, x<9 split), 6 tower positions (§5.4), Princess 1400/90/0.8/7.5, King 2400/100/1.0/7.0, footprint exclusion. All verified correct in this review via probes (`isInDeployZone` pocket side-split included), but unpinned in CI.
- **Repro**: `grep -rn "arena" backend/tests/` → no hits
- **Suggested fix**: add `backend/tests/arena.test.ts` for constants, `isInDeployZone` (own-half/river/pocket per-side), `isOnBridge`, `isOnTowerFootprint`, `TOWER_SPAWNS`.
- **Fixes**:

### ISS-E3-004 — win-path branches untested: chip-leader @180s, 1–1 HP% tiebreak, OT sudden-death
- **Severity**: major
- **Status**: open
- **File**: `backend/tests/engine.test.ts:296`
- **Category**: correctness
- **Description**: Win tests cover only king-snipe and full-HP 0–0 → OT → draw. Untested normative branches (§8.2–8.3): chipped 0–0 ends at 180s with no OT (e.g. 1000/1400 vs 1400/1400), 1–1 decided by lowest-standing-tower HP%, OT first-blood ends match immediately. Engine behavior was verified correct here by probe (chip → blue wins at 180, no OT; OT + princess kill → match ends), so this is a regression-guard gap, not a live bug.
- **Repro**: `grep -n "overtime\|sudden\|1000\|chip" backend/tests/engine.test.ts` → no matches
- **Suggested fix**: add tests: (a) red princess at 1000 HP → 1800 ticks → `over && winner blue && !overtime`; (b) 1–1 crowns with asymmetric HP% → HP% leader wins; (c) enter OT, drop a princess → sudden-death win.
- **Fixes**:

### ISS-E3-005 — combat-mechanics branches untested: tower-first order, cannon timers, splash/stun/burst/flying/building-targeting
- **Severity**: minor
- **Status**: open
- **File**: `backend/tests/engine.test.ts:1`
- **Category**: conventions
- **Description**: Engine correctly implements (§6.4 tower shots before troop shots with inter-phase sweep; §6.5 hitscan; Cannon deploy-delay 1.0s + 30s expiry; Baby Dragon splash; Zap 0.5s stun; Golem 280/2.0 burst; buildings-only targeting; fliers bypass bridges) — all verified by probe — but no test pins any of them. A refactor could silently reorder phases or drop a mechanic.
- **Repro**: `grep -n "towerPhase\|splash\|stun\|burst\|expiresAt\|readyAt\|flying" backend/tests/*.test.ts` → no matches
- **Suggested fix**: add `backend/tests/combat.test.ts`: tower-first kill preempts troop shot; cannon `readyAt`/`expiresAt`; zap stun + 88 tower chip; golem burst; baby-dragon splash; giant ignores troops; cannon pulls building-targeting.
- **Fixes**:

### ISS-E3-006 — `applySpell`/`golemBurst` hardcode per-card numbers instead of reading the `CARDS` table
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/game/engine.ts:310`
- **Category**: conventions
- **Description**: Spell radius/damage/towerDamage/stun are re-typed as literals (`2.5/4.0`, `700/300/220`, `280/120/88`, `0.5`) rather than read from `getCard()`. Values match the table today (40% rule verified), but the duplication can drift. Same for golem-burst radius fallback `?? 2.0` (engine.ts:689).
- **Repro**: read `applySpell` (engine.ts:310-339) vs `CARDS` (cards.ts:210-265) — two sources of truth
- **Suggested fix**: resolve `radius/damage/towerDamage/stunSec/deathBurst*` via `getCard(cardId)` / the dead unit's def; keep literals only as fallback with a comment.
- **Fixes**:

### ISS-E3-007 — spell-vs-tower `+0.5` radius tolerance is normatively homeless
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/game/engine.ts:329`
- **Category**: docs
- **Description**: `applySpell` and `golemBurst` test towers with `radius + 0.5` (sensible: 1×1 tower footprint, cf. `isOnTowerFootprint`), but GAME_DESIGN §§1/6/11 never locks a spell-vs-tower tolerance — a strict reader expects pure `radius`. Behavior is reasonable and tower-chip tests pass, but the constant should be spec'd.
- **Repro**: `grep -n "radius + 0.5" backend/src/game/engine.ts` → lines 329, 699
- **Suggested fix**: either lock `+0.5 tile tower-center tolerance` in GAME_DESIGN §11.2 (additive clarification) or name it `TOWER_SPELL_TOLERANCE` with a comment citing §5.3 footprint.
- **Fixes**:

### ISS-E3-008 — Fireball/Arrows travel/duration (§1: 0.8s/0.6s) resolve instantly; spec silent on spell timing
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/game/engine.ts:426`
- **Category**: correctness
- **Description**: §1 lists Fireball travel 0.8s and Arrows 0.6s duration, but `playCard` applies spell damage synchronously (comment: "0.8s travel is client visual"). §6.5 locks hitscan only for towers — spells have no timing rule, so instant resolution is an undocumented deviation (harmless at 10 Hz, but a design decision either way).
- **Repro**: `playCard` fireball → tower HP drops before any `tickGame`; code comment engine.ts:218
- **Suggested fix**: design call — either GAME_DESIGN states "spells resolve on the playing tick (travel/duration visual-only)" or engine queues delayed spell effects. Recommend the former (one-line §9/§11 note).
- **Fixes**:

## PASS (explicitly verified, no issue filed)
- **PASS-01 — 12 cards match §1**: all ids/costs/HP/damage/hitSpeed/speed/range/sight/targets/count/rarity verified programmatically (incl. Archers 300x2 survives Zap 220; Fireball 700 one-shots Musketeer 600; Musketeer range 6.0 < tower ranges; Cannon 750/262/5.5/30s/1.0s; 40% tower-damage rule 280/120/88; Golem burst 280/2.0). `validateDeck` accepts both §4 starters, rejects 3-spell/dup/unknown.
- **PASS-02 — arena 18×32 / towers / elixir constants**: `ARENA_W/H 18/32`, river `[15,17)`, bridges 3–4/13–14 (c3.5/13.5), deploy Blue 0–14 / Red 17–31, pocket 4 (Blue ≤20 / Red ≥11, x<9 split) incl. per-side pocket gating, 6 spawns at §5.4 coordinates, Princess 1400/90/0.8/7.5, King 2400/100/1.0/7.0, elixir 5/10/2.8s/1.4s/double@120s.
- **PASS-03 — tick order (§9 EXE + §6.4)**: `tickGame` runs elixir → movement → `towerPhase` → inter-phase `sweepDeadUnits` → `unitPhase` → cannon expiry → clock/win; dt clamped `(0,0.5]` (client clocks ignored, §10).
- **PASS-04 — king rule (§6.2 + ISS-D2-013)**: kings start inactive, activate on any damage (spell chip tested), princess loss activates friendly king, inactive king deals nothing but is targetable/damageable (code path `nearestEnemyTower` has no active-gate; `towerPhase` skips inactive).
- **PASS-05 — win/OT (§8)**: king kill → instant win + 3 crowns; `decideStoppage` crowns → lowest-standing-tower HP% (king included, destroyed excluded) → 0.5% epsilon; probes confirm chipped 0–0 (1000/1400) ends at 180s for the chip leader with no OT, full-HP tie → OT → draw at 240s, OT princess kill → sudden-death win.
- **PASS-06 — validation codes (§11/§12.2)**: engine returns `BAD_HAND_INDEX` (incl. non-integer), `CARD_REJECTED` (echo mismatch/over/wrong match), `STALE_TICK` (±5), `RATE_LIMITED` (5/s/side sliding window), `NO_ELIXIR`, `BAD_POSITION` (OOB/river/enemy-half/footprint; spells arena-wide only); all rejections leave elixir/units/towers/hands/crowns untouched (prunes `playTicks` window only). `BAD_DECK` lives in `cards.validateDeck` (queue:join scope); `NOT_QUEUED` is matchmaking scope — correct split.
- **PASS-07 — 33 tests meaningful and green**: 16 engine + 17 validation (counts verified: 7 elixir / 3 playCard / 4 towers-king / 2 win + 8 positions / 2 elixir / 5 hand / 2 clock-rate). Elixir math asserted to 1e-6 (2.8s→+1, 1.4s→+1, 7s single→2.5 vs double→5.0, cap 10); no-mutation snapshots on every reject; king-activation and both win tests exercise real sim paths. Gaps are filed as ISS-E3-002…005, not verdict-changers.
- **PASS-08 — engine:598 paren typo: NOT PRESENT**: flagged location re-checked — movement integration (`u.x += ((wx - u.x) / dd) * travel`, engine.ts:624-625) is paren-balanced; `npx tsc --noEmit` clean and `tsx --test` compiles/runs. No action needed (line numbers shifted; file is 765 lines).

## Counts
- blocker: 0 | major: 1 | minor: 7 | verified: 0
