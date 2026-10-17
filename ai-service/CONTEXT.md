# ai-service — CONTEXT.md

> Purpose: Python + FastAPI microservice for rule-based bots (difficulty levels) + balance analytics. Phase 1 = stub; full bot logic lands in Phase 6.

## Tech
- Python 3.12, FastAPI, Pydantic, Uvicorn, Pytest, Ruff.

## Structure
- `main.py` — FastAPI app:
  - `GET /health` → `{"ok": true, "service": "ai"}`
  - `POST /bot/move` → `{card, x, y, difficulty}` stub (random card + coordinates, echoes `difficulty` from JSON body, defaults to `medium`).
  - `GET /balance/cards` → stub card list with placeholder `win_rate` / `pick_rate`.
- `test_main.py` — 2 pytest tests (`/health`, `/bot/move`) via `fastapi.testclient.TestClient`.
- `requirements.txt` — `fastapi`, `uvicorn[standard]`, `pydantic`, `pytest`, `ruff`, `httpx` (httpx required by TestClient).
- `Dockerfile` — `python:3.12-slim`, `pip install -r requirements.txt`, `EXPOSE 8000`, `CMD uvicorn main:app --host 0.0.0.0 --port 8000`.
- `.env.example` — `PORT=8000`.

## How to run / test (local, from `ai-service/`)
```powershell
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # -> http://localhost:8000, docs at /docs
pytest -q
```

## Key files & conventions
- Port **8000** (frontend 3000, backend 4000, postgres 5432, redis 6379).
- Keep endpoints dependency-free stubs until Phase 6; request/response schemas via Pydantic models in `main.py`.
- Lint with `ruff check .` (Phase 6+ enforces in CI).

## Status
- Phase 1 scaffolding complete (stub only, no game logic yet).

## Phase 6 update (2026-10-17, branch feature/phase-6-ai-service, MEMORY#20 + #21)
- `bot.py` (new): rule-based brain `choose_move(state, hand, elixir, difficulty)` easy O(h) random / medium O(h+t) greedy DPS-per-elixir on weakest lane / hard O(h+t+u) + counters (swarm centroid, <50% defence, tank split-push). Big-O in docstrings, p95 <50ms, no I/O. Accepts str + dict hand entries.
- `main.py` (upgraded): lazy `from bot import choose_move` (fast cold start), canonical signature first + tolerance list, POST /bot/move resolves ISS-P2-002 handIndex (nearest-by-cost + substituted flag) + took_ms, invalid difficulty -> medium 200, GET /balance/cards reads analytics store (guarded) else stub. O(1) request + O(h+t+u) brain.
- `analytics.py` (new): `BalanceAnalytics` ring-buffer deque(maxlen=10000) record_match O(k) / record_game O(k) / card_stats O(n+c) + cached O(c) / flag_outliers O(c) 0.45-0.55 min 30 games. Big-O docstrings.
- Tests: `test_main.py` 7 tests + `test_analytics.py` 5 tests (12 total, `pytest -q` green).
- Run: `pip install -r requirements.txt; uvicorn main:app --port 8000; pytest -q`. Live: 8100 ephemeral for tests, preview :8000 (MEMORY#19).
