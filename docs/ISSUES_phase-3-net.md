# ISSUES — phase-3-net (2026-10-16, reviewer: review-agent-net)

> Scope: net review only. No code edited. Never read/copied from `CRclone`.
> Read: `MEMORY.md`, `docs/GAME_DESIGN.md §9/11/12`, `backend/src/net/rooms.ts`, `backend/src/net/validation.ts`, `backend/src/net/redis.ts`, `backend/src/index.ts`, `backend/src/matchmaking.ts`, `shared/types.ts`.

## Summary
- Scope reviewed: `backend/src/net/rooms.ts:1-526`, `backend/src/net/validation.ts:1-224`, `backend/src/net/redis.ts:1-131`, `backend/src/index.ts:1-334`, `backend/src/matchmaking.ts:1-110`, `shared/types.ts:1-160` vs `docs/GAME_DESIGN.md §9/11/12`
- Commit/branch: `feature/phase-3-backend-server@cf00bdb`
- Verdict: PASS (0 blocker, 0 major, 4 minor; all 7 goals PASS with notes)

### Goals checklist (all PASS)
- [x] 10Hz broadcast `state:update` — PASS (`rooms.ts:384/TICK_MS=100`, `rooms.ts:419` + `index.ts:167,314`; no `match:state` anywhere — see grep)
- [x] `tryMatch` pairing — PASS (`matchmaking.ts:97-109` FIFO, first=blue/second=red, `createRoom`; `index.ts:137-167` wires rooms + twins)
- [x] validation codes — PASS (8/8 codes `BAD_DECK|NOT_QUEUED|BAD_HAND_INDEX|NO_ELIXIR|BAD_POSITION|CARD_REJECTED|STALE_TICK|RATE_LIMITED` in `validation.ts:15-24`; deck/hand/elixir/position/tick/rate checks match §11)
- [x] error twins — PASS (`index.ts:107-111` `emitErrorTwins` identical payload, `fail()` ack+twins; `queue:matched`+`match:found` both emitted `index.ts:151-164`)
- [x] redis fallback never throws — PASS (`redis.ts:34-58,68-113,121-131` all try/catch + memory maps; `index.ts:56` `.catch`; `rooms.ts:413` `void publishState().catch()`)
- [x] no game logic duplication — PASS (`rooms.ts:1-16,386-412,460-526` delegates to engine hooks, STUB only advances clock + elixir/hand rotation, no movement/combat; `validation.ts:1-13` validation-only table, engine wins)
- [x] additive types — PASS (`shared/types.ts:91-160` keeps all Phase-1 keys, `SocketEventsV2 extends Omit<...>` per §12.3, no renames)

## Issues
### ISS-N3-001 — No 40-unit cap / size guard in net broadcast path
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/net/rooms.ts:236-269` (`syncWire`), `backend/src/net/rooms.ts:417-420` (`broadcastState`)
- **Category**: perf
- **Description**: Spec §9 requires live `units` cap N=40 + p95 tick ≤4KB JSON. `syncWire` maps all `sim.units` 1:1 and `broadcastState` emits full `room.state` with no truncation/summarize. If engine enforces cap this is harmless, but net layer (the broadcaster) has no guard, so a leaky engine silently blows the 10Hz budget (~100-150B/unit; 50+ units ≈ 6-8KB/tick).
- **Repro**: Read `rooms.ts:255-263` (no `.slice(0,40)`); grep `40` in `backend/src/net/` → no hits.
- **Suggested fix**: Additive guard in `syncWire` or `broadcastState` (e.g. `units.slice(0,40)` + warn/log when truncated, never drop towers), or assert/document that engine owns the cap and add `JSON.stringify(state).length` log to test report.

### ISS-N3-002 — `tryMatch` drains only one pair per call
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/matchmaking.ts:97-109` vs `backend/src/index.ts:137`
- **Category**: correctness
- **Description**: `tryMatch` shifts exactly 2 players and returns. `handleQueueJoin` calls it once per join. If queue already holds ≥4 (rapid joins/reconnects), one pair stays waiting until the next join event instead of draining. Not a pairing bug (FIFO order + blue/red assignment correct), just throughput.
- **Repro**: `joinQueue` x4 without interleaved `tryMatch`, then one `tryMatch()` → `queueSize()===2` left.
- **Suggested fix**: Loop in caller or callee: `while ((m = tryMatch()) !== null) { wireRoom(m); }` in `index.ts:137-167` (extract wiring into helper), keeping `tryMatch` single-pair for unit tests.

### ISS-N3-003 — `emote:send` RATE_LIMITED is ack-only, `card:play` RATE_LIMITED is ack+twins
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/index.ts:244-248` vs `backend/src/index.ts:187-191,113-116`
- **Category**: conventions
- **Description**: `card:play` throttle goes through `fail()` (ack `ok:false` + `error`/`error:game` twins with `matchId`), but emote throttle returns `ack { ok:false }` only with no twin emit. Spec §12.2 lists `RATE_LIMITED` as a twin-emitted code; clients toasting only on `error` will miss emote throttle. Cosmetic-only so no sim risk, but inconsistent.
- **Repro**: Send 2x `emote:send` within 5s → second gets ack `RATE_LIMITED`, no `error`/`error:game` observed; vs 6x `card:play`/s → ack + both twins.
- **Suggested fix**: Either route emote throttle through `fail(socket, ack, "RATE_LIMITED", ..., matchId)` for consistency, or document in §11.4 that emote throttle is ack-only by design (cosmetic, no reconcile needed) and keep as-is.

### ISS-N3-004 — `publishState` `JSON.stringify` sits outside try (can throw despite "never throws")
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/net/redis.ts:68-81`
- **Category**: correctness
- **Description**: `publishState` claims fallback-never-throws, and every Redis await is try/caught to memory maps — correct. But `const payload = JSON.stringify(state)` on line 69 executes before the `if (connected...) try`, so a non-serializable state (circular, BigInt) would throw synchronously out of the 10Hz path (`rooms.ts:413` does `.catch()` on the promise, which does not catch a sync throw). `GameState` is JSON-safe today, so latent only.
- **Repro**: `publishState("m1", { x: BigInt(1) })` → sync `TypeError`, not memory fallback.
- **Suggested fix**: Move `JSON.stringify` inside try (fallback to memory + warn on catch), or wrap: `let payload: string; try { payload = JSON.stringify(state); } catch (e) { console.warn(...); return; }`.

## Counts
- blocker: 0 | major: 0 | minor: 4 | verified: 0

## PASS
- All 7 net goals PASS: 10Hz `state:update` canonical (no `match:state`), FIFO `tryMatch` + twin emits, 8/8 validation codes per §11/§12.2, identical `error`/`error:game` twins (+ `queue:matched`/`match:found` twins), redis memory fallback on every path, no sim duplication (engine-delegated + marked STUB), additive-only `shared/types.ts` (`Omit`-based `SocketEventsV2`).
- Open items are minors only (cap guard, drain loop, emote-twin consistency, stringify placement). No blocker/major. Safe for test agent + fix cycle.
