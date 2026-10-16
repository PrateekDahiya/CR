# ISSUES — phase-2-protocol (2026-10-17, reviewer: review-agent-protocol)

> Scope: protocol draft review only. No runtime code edited. Never read/copied from `CRclone`.
> Read: `MEMORY.md`, `docs/DRAFT_PROTOCOL.md`, `shared/types.ts`, `backend/src/index.ts`, `ai-service/main.py`.

## Summary
- Scope reviewed: `docs/DRAFT_PROTOCOL.md` (325 lines) vs `shared/types.ts:1-89`, `backend/src/index.ts:1-47`, `ai-service/main.py:1-60`
- Commit/branch: `feature/phase-2-game-design@9fa59fb`
- Verdict: pass-with-issues (0 blocker, 2 major, 5 minor; all goals PASS with notes)

## Issues
### ISS-P2-001 — `SocketEventsV2` `card:play` override breaks `extends` (not additive)
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_PROTOCOL.md:245` vs `shared/types.ts:81`
- **Category**: correctness
- **Description**: Draft claims `interface SocketEventsV2 extends SocketEvents` with `'card:play': DeployRequest` is additive and "assignable to legacy payload". It is not. Legacy requires `{ matchId, playerId, cardId: string, at: Vec2, handIndex }`; `DeployRequest` makes `cardId?/at?` optional and requires `x/y`. TS errors on incompatible interface extension (`Interface incorrectly extends`). Copy-pasting §3 into `shared/types.ts` would fail `tsc --noEmit`.
- **Repro**: Compare `shared/types.ts:81` to `docs/DRAFT_PROTOCOL.md:214-224`; mentally apply `extends` with conflicting key.
- **Suggested fix**: In `GAME_DESIGN.md` normative section use `Omit` + union, e.g. `type CardPlayPayload = DeployRequest & { cardId?: string; at?: Vec2 }` and `interface SocketEventsV2 extends Omit<SocketEvents,'card:play'|'state:update'> { 'card:play': CardPlayPayload; ... }`, or keep legacy key and add new `card:play:v2` alias until Phase 3 `// BREAKING` cleanup. Add `tsc --noEmit` check to §5 checklist.

### ISS-P2-002 — `POST /bot/move` → `DeployRequest` gap (card name vs handIndex)
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_PROTOCOL.md:161-172` vs `ai-service/main.py:24-28`
- **Category**: correctness
- **Description**: Stub returns `{ card, x, y, difficulty }` (`main.py:43-48`, `x∈[0,18] y∈[0,32]`). Canonical `card:play` requires `{ handIndex: 0..3, x, y }` (`DRAFT §1.1`, `DeployRequest`). Draft §2 says "Phase 6: return legal DeployRequest-compatible move" but defines no mapping `card→handIndex`, and request `{ difficulty, game_state }` carries no `hand/matchId/playerId`. Sequence diagram `S->>AI: POST /bot/move` then `state:update bot unit spawned` skips who resolves legality (server must, but not stated).
- **Repro**: `POST http://localhost:8000/bot/move {"difficulty":"medium","game_state":{}}` → has `card`, no `handIndex`; cannot emit directly as `card:play`.
- **Suggested fix**: Document in `GAME_DESIGN.md`: AI returns suggestion `{ cardId?, handIndex?, x, y }`, server authoritative-resolves via current hand (`handIndex` wins, `cardId` echo validated, mismatch → `CARD_REJECTED`), or extend stub response additively with optional `handIndex?` in Phase 6. Keep REST contract additive-only.

### ISS-P2-003 — No tick payload size budget (10Hz claim without bytes/cap)
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_PROTOCOL.md:116-133`
- **Category**: perf
- **Description**: Frequency `10Hz (every 100ms)` and `GameState` shape (`matchId,tick,serverTimeMs,elixir,towers[6],units[],crowns,winner?,endsAtMs?`) are correctly preserved from `shared/types.ts:61-71`. But no size budget, no max `units` cap, no delta/compression policy. Late-game `units[]` unbounded → per-tick JSON grows linearly (~100-150B/unit; 20 units ≈ 2-3KB/tick ≈ 20-30KB/s/client; 50+ units ≈ 6-8KB/tick). No test in §5 asserts size.
- **Repro**: Estimate from `Tower` (6 fields) + `Unit` (7 fields) JSON; no cap in draft.
- **Suggested fix**: Add budget e.g. `p95 tick ≤4KB JSON, units cap N=40, truncate/summarize beyond cap, future delta allowed additively (e.g. optional projectiles?)`. Add tester check: log `JSON.stringify(state).length` over 60s bot game at 10Hz.

### ISS-P2-004 — Ack vs `error` event duplication ambiguous
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_PROTOCOL.md:43-55,84,145-150`
- **Category**: docs
- **Description**: §1 says "All client→server events expect ack `{ ok, error? }` unless noted" but examples use `ack { ok, position }` (`queue:join`), `ack { ok }` (`queue:leave`, `deck:select`), `ack {ok} or error {NO_ELIXIR/...}` (`card:play`), plus separate server→client `error` + legacy `error:game` twin. No canonical `Ack` type, no rule for when to use `ack.error` vs emitting `error`, risk of double-handling on client. Legacy `error:game { code,message }` (`shared/types.ts:88`) has no `matchId?` while new `error` adds it — twin emit shapes differ slightly.
- **Repro**: Read §1.1 vs §1.2 error codes list (`BAD_DECK,NOT_QUEUED,BAD_HAND_INDEX,NO_ELIXIR,BAD_POSITION,CARD_REJECTED,STALE_TICK,RATE_LIMITED`).
- **Suggested fix**: Define `type Ack = { ok: boolean; position?: number; error?: { code,message } }`; rule: synchronous validation → `ack`, async/broadcast failures → `error`+`error:game` twins with identical `{ code,message,matchId? }` (add `matchId?` to legacy twin additively). Client rule: toast on `error`, reconcile on next `state:update`.

### ISS-P2-005 — Timestamp key split (`serverTime` vs `serverTimeMs`) needs norming note
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_PROTOCOL.md:18,94-100` vs `backend/src/index.ts:33-38`, `shared/types.ts:64`
- **Category**: docs
- **Description**: Preservation is correct: `pong { received, serverTime }` kept verbatim (`index.ts:36-37`), `GameState.serverTimeMs` + `queue:matched.serverTimeMs` use `Ms` suffix. §0 correctly notes "Times are number ms". But interpolation (`tick` + clock offset from `pong`) must combine both keys; draft gives no formula/note, easy to mix `serverTime` with `serverTimeMs` in client code.
- **Repro**: `socket.emit("ping",...)` → `pong.serverTime`; `state:update` → `serverTimeMs`; no mapping note.
- **Suggested fix**: One-line norm in `GAME_DESIGN.md`: "All times `Date.now()` ms; `pong.serverTime ≡ serverTimeMs` semantically; Phase 3 MAY add `serverTimeMs` alias to `pong` additively, never rename `serverTime` until `// BREAKING(phase-3)`." Keep both on wire.

### ISS-P2-006 — `card:play` position validation references undefined half-split
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_PROTOCOL.md:84`
- **Category**: correctness
- **Description**: "x/y own-half (troops) or anywhere (spells)" is the right rule direction and bounds `x∈[0,18] y∈[0,32]` correctly cite `ai-service/main.py:46-47`. But arena half-split (`y` threshold, side mirroring for blue/red), spell exception list, and out-of-bounds → `BAD_POSITION` vs clamp behavior are undefined. Tester cannot validate.
- **Repro**: Try to implement server check from draft alone — threshold missing.
- **Suggested fix**: Point to `docs/DRAFT_ARENA.md` (or `GAME_DESIGN.md`) for normative `y=16` split + per-side own-half mapping + spell allow-list; state reject (no mutation + `BAD_POSITION`) vs clamp explicitly.

### ISS-P2-007 — Deck/duplicate rule + `STALE_TICK`/rate-limit thresholds vague
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_PROTOCOL.md:53,69,149,219-224`
- **Category**: docs
- **Description**: `deck.length===8, all ids known, no duplicates beyond allowed` + `STALE_TICK` + `RATE_LIMITED` + emote `1/5s` are sensible stubs, but "beyond allowed" (which cards allow dupes?), `clientTick` stale window (±N ticks?), and `card:play`/`queue:join` rate limits are undefined. `match:join` legacy alias "server ignores/mocks matchId" is also vague on ack behavior.
- **Repro**: Read §1.1 `queue:join`/`deck:select` validation bullets; `DeployRequest.clientTick?` has no consumer rule.
- **Suggested fix**: Reference `DRAFT_CARDS.md` card list as normative id source; define `STALE_TICK` window (e.g. `|clientTick - serverTick|>5` → reject, server wins), `card:play` burst cap (e.g. 5/s/side), legacy `match:join` ack behavior (ignore `matchId`, treat as `queue:join`). All additive, Phase 3 enforces.

## PASS checks (goals verified)
- **PASS-01 event names preserved**: `GET /health`, `ping→pong`, `emote:send { matchId,playerId,emoteId }` kept verbatim (`index.ts:15,33`, `types.ts:82`, DRAFT §0/§1.1/§3). No rename.
- **PASS-02 legacy aliases preserved**: `match:join/match:leave/match:found/match:start/state:update/match:end/error:game` all mapped in §0.1 table with dual-emit plan until Phase 3 `// BREAKING` cleanup. `match:start` retained as lobby→battle trigger.
- **PASS-03 additive types (with ISS-P2-001 fix pending)**: `CardStats/CardWithStats (optional)/DeployRequest (optional cardId,at,clientTick)/ServerTick (=GameState)/EntitiesSnapshot (Pick)/SocketEventsV2 extends` intent is additive-only; `state:update ≡ GameState`, `entities = towers+units` doc shorthand introduces no new wire field. Fix `card:play` variance per ISS-P2-001.
- **PASS-04 REST match**: `GET :4000/health → {ok,service:"backend"}` ✓; `GET :8000/health → {ok,service:"ai"}` (`main.py:31`) ✓; `POST /bot/move {difficulty,game_state} → {card,x,y,difficulty}` with `easy|medium|hard` normalize + `x[0,18] y[0,32]` (`main.py:37-48`) ✓; `GET /balance/cards → {cards:[{name,win_rate,pick_rate}],note}` (`main.py:51-60`) ✓. Ports `3000/4000/8000` correct.
- **PASS-05 tick 10Hz + payload shape**: `10Hz every 100ms`, `tick monotonic +1`, `serverTimeMs` interpolation driver, `elixir Record<blue|red> 0..10`, `towers[6] 1king+2princess/side`, `units[]`, `crowns`, `winner?/endsAtMs?` all consistent with `shared/types.ts:60-71` + `backend/CONTEXT.md §8`. No field renamed (ISS-P2-003 budget still needed).
- **PASS-06 error handling**: `error {code,message,matchId?}` + `error:game` twin, 8 codes, ack-or-error per intent, "next state:update is truth / no desync" rule — covers game-error path. Disambiguate ack-vs-event per ISS-P2-004.
- **PASS-07 AI compat**: stub contract unchanged, additive-fields-only promise for Phase 6 (`game_state: GameState`, preserve `{cards:[{name,win_rate,pick_rate}]}`), bot leg in sequence diagram (`POST /bot/move → {card,x,y}` → spawn next tick) present. Resolve `handIndex` mapping per ISS-P2-002.
- **PASS-08 sequence + checklist**: Mermaid covers lobby (`health/ping/deck:select`) → `queue:join → queue:matched → match:start` → 10Hz `state:update` loop → `card:play` ack/error → bot branch → `emote:send` relay → `match:end` → `queue:leave` cleanup + anytime `error` twin path. §5 checklist enforces draft-only diff, additive types, legacy names, REST shapes.

## Counts
- blocker: 0 | major: 2 | minor: 5 | verified: 0
- pass: 8 (PASS-01..PASS-08)
