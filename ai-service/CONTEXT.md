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
