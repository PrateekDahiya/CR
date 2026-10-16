# ISSUES — phase-1-ai-shared (2026-10-16, reviewer: code-review-agent-ai-shared)

> Scope: `ai-service/` FastAPI stub + `shared/` types (Phase 1 scaffolding).
> Branch: `feature/phase-1-scaffolding`. Read-only review — no code edits made.
> Template: `docs/ISSUES_TEMPLATE.md`. IDs stable: `ISS-AI-*` (ai-service), `ISS-SH-*` (shared).

## Summary
- Scope reviewed: `MEMORY.md`, `ai-service/CONTEXT.md`, `ai-service/main.py`, `ai-service/requirements.txt`, `ai-service/test_main.py`, `ai-service/Dockerfile`, `shared/types.ts`, `shared/CONTEXT.md`
- Commit/branch: `feature/phase-1-scaffolding`@`<sha-not-resolved-read-only>`
- Verdict: pass-with-issues (stub works for Phase 1; no blockers; fix majors before Phase 3/6)

## Issues

### ISS-AI-001 — `/bot/move` silently coerces invalid difficulty instead of 422
- **Severity**: major
- **Status**: open
- **File**: `ai-service/main.py:40-42`
- **Category**: correctness
- **Description**: `BotMoveRequest.difficulty: str = "medium"` accepts any string; handler lowercases and falls back to `"medium"` for unknown values. Invalid input returns 200 with corrected value, hiding client bugs and contradicting Pydantic 422 semantics. `ai-service/CONTEXT.md:11` says stub "echoes `difficulty`", but silent coercion is not documented.
- **Repro**: `POST /bot/move {"difficulty":"impossible"}` → `200 {"difficulty":"medium", ...}` (expected 422).
- **Suggested fix**: Constrain type: `difficulty: Literal["easy","medium","hard"] = "medium"` (or `Field(pattern=...)` + validator for case-insensitive). Remove manual fallback; let FastAPI return 422. Update `ai-service/CONTEXT.md` stub description.
- **Fixes**: _left for fix agent_

### ISS-AI-002 — Missing Pydantic models for `/health` and `/balance/cards`
- **Severity**: minor
- **Status**: open
- **File**: `ai-service/main.py:32,51-60`
- **Category**: correctness / conventions
- **Description**: `BotMoveRequest/Response` use Pydantic (good), but `health()` returns bare `dict` and `balance_cards()` returns untyped `dict` with inline list comprehension (`win_rate: 0.5`, `pick_rate: 0.2`). No `response_model`, no OpenAPI schema for balance consumers; Phase 6 analytics will drift.
- **Repro**: Open `/docs` → `/balance/cards` response schema is empty/generic.
- **Suggested fix**: Add `class BalanceCard(BaseModel): name: str; win_rate: float; pick_rate: float` + `class BalanceResponse(BaseModel): cards: list[BalanceCard]; note: str`, set `response_model=BalanceResponse`. Optionally add `HealthResponse` for consistency.
- **Fixes**: _left for fix agent_

### ISS-AI-003 — `BotMoveResponse.x/y` unbounded (no arena-bounds validation)
- **Severity**: minor
- **Status**: open
- **File**: `ai-service/main.py:24-28`
- **Category**: correctness
- **Description**: Stub generates `x in [0,18]`, `y in [0,32]` (matches typical arena) but model declares bare `float` with no `ge/le`. Nothing prevents future logic from emitting out-of-bounds moves; no contract for backend/frontend validators (Phase 3).
- **Repro**: Code inspection only.
- **Suggested fix**: `x: float = Field(ge=0, le=18)` / `y: float = Field(ge=0, le=32)` with comment that bounds are provisional until `docs/GAME_DESIGN.md` Phase 2 locks arena size.
- **Fixes**: _left for fix agent_

### ISS-AI-004 — `requirements.txt` unpinned + dev deps shipped in prod image
- **Severity**: minor
- **Status**: open
- **File**: `ai-service/requirements.txt:1-6`, `ai-service/Dockerfile:6`
- **Category**: conventions / perf
- **Description**: All deps unpinned (`fastapi`, `uvicorn[standard]`, `pydantic`, `pytest`, `ruff`, `httpx`). `Dockerfile` `pip install -r requirements.txt` therefore non-reproducible and ships `pytest`+`ruff` to prod (image bloat). No lock/split.
- **Repro**: `pip install -r requirements.txt` resolves latest on each build.
- **Suggested fix**: Pin versions (e.g. `fastapi==...`) or add `requirements.prod.txt` vs `requirements.dev.txt`; `Dockerfile` installs prod-only. Phase 6 CI enforces `ruff` separately per `ai-service/CONTEXT.md:28`.
- **Fixes**: _left for fix agent_

### ISS-AI-005 — `Dockerfile` missing prod hardening (HEALTHCHECK, non-root, env flags)
- **Severity**: minor
- **Status**: open
- **File**: `ai-service/Dockerfile:1-12`
- **Category**: security / conventions
- **Description**: Base `python:3.12-slim`, `WORKDIR/COPY/EXPOSE/CMD` correct for Phase 1, but missing: `ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1`, non-root `USER`, `HEALTHCHECK CMD ... /health`. Acceptable stub, but will fail `infra/docker-compose` health-gated review in later phases (MEMORY.md §13).
- **Repro**: `docker build ai-service/` → image runs as root, no healthcheck.
- **Suggested fix**: Add `ENV` flags, `RUN useradd ... && USER appuser`, `HEALTHCHECK --interval=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"` (or `curl` if added). Keep `CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]`.
- **Fixes**: _left for fix agent_

### ISS-AI-006 — Test coverage gaps: no `/balance/cards`, no validation/edge tests
- **Severity**: major
- **Status**: open
- **File**: `ai-service/test_main.py:1-22`
- **Category**: correctness
- **Description**: Only 2 tests (`/health`, `/bot/move` happy-path `hard`). Uncovered: `GET /balance/cards` shape, `/bot/move` default-body (`{}` → `medium`), invalid-difficulty behaviour (currently 200, should be 422 after ISS-AI-001), `x/y` bounds, response-model conformance. Once ISS-AI-001 fixed, current suite will not catch regressions.
- **Repro**: `pytest -q` → 2 passed; `coverage` shows `balance_cards` uncovered.
- **Suggested fix**: Add tests: `test_balance_cards_shape` (keys, `win_rate/pick_rate` ranges), `test_bot_move_default_difficulty` (`{}` → `medium`), `test_bot_move_rejects_invalid_difficulty` (expects 422 after fix), `test_bot_move_bounds` (`0<=x<=18`, `0<=y<=32`).
- **Fixes**: _left for fix agent_

### ISS-AI-007 — Test duplicates stub card list + fragile `from main import app`
- **Severity**: minor
- **Status**: open
- **File**: `ai-service/test_main.py:6,21`
- **Category**: conventions
- **Description**: Line 21 hardcodes `["knight","archers","giant","fireball","skeletons"]` instead of importing `STUB_CARDS` from `main.py` — will silently diverge. Line 6 `from main import app` works only when `pytest` cwd is `ai-service/`; fails from repo root / CI without `pythonpath` tweak.
- **Repro**: From repo root: `pytest ai-service/test_main.py -q` → `ModuleNotFoundError: No module named 'main'`.
- **Suggested fix**: `from main import app, STUB_CARDS` + assert against `STUB_CARDS`; add `pytest.ini`/`pyproject` `pythonpath` or document "run from `ai-service/`" (already in CONTEXT) + CI `working-directory`.
- **Fixes**: _left for fix agent_

### ISS-AI-008 — `BotMoveRequest.game_state: dict` fully opaque (no schema)
- **Severity**: minor
- **Status**: open
- **File**: `ai-service/main.py:21`
- **Category**: conventions / docs
- **Description**: `game_state: dict = {}` is intentional per `ai-service/CONTEXT.md:27` ("dependency-free stubs until Phase 6"), so not a defect for Phase 1. Logged so Phase 6 replaces with typed `GameState` import or `Literal` snapshot model instead of growing `dict` usage.
- **Repro**: Inspection only.
- **Suggested fix**: Phase 6: define `GameSnapshot` Pydantic model (or import from shared contract) and type `game_state` accordingly. No change now; keep `description="Opaque ... (unused in stub)"`.
- **Fixes**: _left for fix agent_

### ISS-SH-001 — Wire-event typo `'em:ote'` (broken `domain:action` convention)
- **Severity**: major
- **Status**: open
- **File**: `shared/types.ts:82`
- **Category**: correctness / conventions
- **Description**: `SocketEvents` key `'em:ote'` splits the word "emote" with the namespace colon. Every other key follows `'domain:action'` (`'card:play'`, `'match:join'`, ...). Copy-paste into frontend/backend will bake a wrong wire name; fixing later is a breaking wire change.
- **Repro**: `rg "em:ote" shared/types.ts` → line 82. `tsc` passes (string literal is valid TS) so typecheck does not catch it.
- **Suggested fix**: Rename to `'emote:send'` (or `'emote:play'` — pick one, match Phase 5 design). Per `shared/CONTEXT.md:40` this is a breaking rename: add `// BREAKING(phase-2): renamed from 'em:ote'` note and update frontend+backend in the same phase. Never silently keep both spellings.
- **Fixes**: _left for fix agent_

### ISS-SH-002 — `card:play.handIndex` has no counterpart in `GameState`
- **Severity**: minor
- **Status**: open
- **File**: `shared/types.ts:81` vs `shared/types.ts:61-71`
- **Category**: correctness / docs
- **Description**: `card:play` payload includes `handIndex: number` implying a hand/deck model, but `GameState` exposes only `elixir/towers/units/crowns` — no `hand: string[]`, `deck`, `nextCard`, or `elixir` costs to validate against. Phase 3 authoritative server cannot validate `handIndex` without it.
- **Repro**: Inspection: `GameState` has no `hand`/`deck` field.
- **Suggested fix**: Phase 2 (`docs/GAME_DESIGN.md`) decides hand model, then additively extend `GameState` (e.g. `hand: string[]; nextCard?: string`) — additive-only, no rename. For Phase 1, add `// TODO(phase-2): define hand` comment on `card:play`.
- **Fixes**: _left for fix agent_

### ISS-SH-003 — No shared `CardBalance` type; ai-service balance payload drifts
- **Severity**: minor
- **Status**: open
- **File**: `shared/types.ts` (missing) vs `ai-service/main.py:54-58`
- **Category**: conventions
- **Description**: `GET /balance/cards` returns `{name, win_rate, pick_rate}` (snake_case) while `shared/types.ts:Card` uses camelCase and has no balance fields. No shared contract for analytics; frontend will hand-roll a duplicate interface.
- **Repro**: `rg -i "win_rate|pick_rate|Balance" shared/` → no hits.
- **Suggested fix**: Additively add (Phase 2/6, not now): `export interface CardBalance { cardId: string; winRate: number; pickRate: number; }` + `CardBalanceResponse`. Keep ai-service snake_case mapping at HTTP boundary or standardise on camelCase. Do not modify existing `Card` fields.
- **Fixes**: _left for fix agent_

### ISS-SH-004 — Typo fix must follow additive-only + `BREAKING(phase-N)` process
- **Severity**: minor
- **Status**: open
- **File**: `shared/CONTEXT.md:40`, `shared/types.ts:1-5`
- **Category**: conventions / docs
- **Description**: `shared/CONTEXT.md:40` mandates "Additive changes only — never rename/remove without `// BREAKING(phase-N)` note + updating both frontend and backend in same phase." `types.ts` header correctly states "Keep backward-compatible additions only." ISS-SH-001 rename therefore needs the `BREAKING` annotation workflow; currently no example/owner for who applies it.
- **Repro**: Docs inspection.
- **Suggested fix**: When fixing ISS-SH-001, include `// BREAKING(phase-2): 'em:ote' -> 'emote:send'` inline + note in fix commit. No other renames in Phase 1.
- **Fixes**: _left for fix agent_

## PASS list (verified)
- [PASS-01] `GET /health` returns `{"ok": true, "service": "ai"}` — matches `ai-service/CONTEXT.md:10` and `test_main.py:10-13`.
- [PASS-02] `POST /bot/move` happy path returns `{card, x, y, difficulty}` with valid card + echoed `hard` — `ai-service/main.py:37-48`, `test_main.py:16-22`.
- [PASS-03] `GET /balance/cards` stub returns `cards[]` with `win_rate/pick_rate` + Phase-6 note — `ai-service/main.py:51-60`, matches `ai-service/CONTEXT.md:12`.
- [PASS-04] Pydantic `BotMoveRequest/BotMoveResponse` present for bot endpoint — `ai-service/main.py:17-28`.
- [PASS-05] `httpx` present in `requirements.txt:6` — required by `fastapi.testclient.TestClient` (`test_main.py:3`); correct per `ai-service/CONTEXT.md:14`.
- [PASS-06] `Dockerfile` base/port/entrypoint correct: `python:3.12-slim`, `EXPOSE 8000`, `CMD uvicorn main:app --host 0.0.0.0 --port 8000` — `ai-service/Dockerfile:1-12`, port 8000 per `ai-service/CONTEXT.md:26`.
- [PASS-07] `requirements.txt` covers `fastapi`, `uvicorn[standard]`, `pydantic`, `pytest`, `ruff`, `httpx` — matches `ai-service/CONTEXT.md:14`.
- [PASS-08] `shared/types.ts` exports complete Phase-1 stub shapes: `Card` (id/name/type/elixirCost + optional stats), `Tower`, `Unit`, `GameState` (matchId/tick/serverTimeMs/elixir/towers/units/crowns + optional winner/endsAtMs), `Vec2`, `SocketEvents` — `shared/types.ts:8-89`.
- [PASS-09] Shared types JSON-serializable (no `Date`/`Map`/classes; ms timestamps), camelCase, no `any` — complies with `shared/CONTEXT.md:41-42`.
- [PASS-10] Additive-only header + `CONTEXT.md` conventions present and accurate (`shared/types.ts:1-5`, `shared/CONTEXT.md:39-43`); `ai-service/CONTEXT.md` run/test/port docs accurate.
- [PASS-11] `STUB_CARDS` pool (`knight/archers/giant/fireball/skeletons`) consistent between `main.py:14` and test expectation (modulo ISS-AI-007 duplication).

## Counts
- blocker: 0 | major: 3 | minor: 9 | verified: 11
