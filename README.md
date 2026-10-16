# CR Clone — Clash Royale Clone (from scratch)

> Repo: https://github.com/PrateekDahiya/CR.git | Branch: `main` (phase-only merges) + `feature/*` for work.
> See `MEMORY.md` (operating rules), `PROJECT_PHASES.md` (progress), `SUGGESTIONS.md` (parking lot), `AGENTS_PROMPT.md` (agent log).

## 1. What this is
Realtime 1v1 card battler (Clash Royale-like): deploy troops/spells with elixir, destroy towers, win crowns. Monorepo from scratch (no reference to sibling `CRclone/`).

**Chosen stack (LOCKED 2026-10-16, user confirmed):**
- Frontend: Next.js (React) + TailwindCSS + TypeScript + Canvas battle renderer + Socket.io-client
- Game server: Node.js + Express + Socket.io (authoritative 10-20Hz tick), Redis for matchmaking/pubsub
- AI service: Python + FastAPI (rule-based bots, difficulty levels, balance analytics)
- DB: Postgres + Prisma (users/decks/matches/leaderboard), Redis (ephemeral)
- Infra: Docker Compose (frontend, backend, ai-service, postgres, redis)

## 2. Prerequisites
- Node 24+, npm, Python 3.12+, Docker 29+, Git 2.54+

## 3. Quickstart (Phase 1 COMPLETE — scaffolding + docker config PASS)
```powershell
# clone
git clone https://github.com/PrateekDahiya/CR.git
Set-Location CR
git checkout main

# Phase 1 verified:
docker compose -f infra/docker-compose.yml config  # -> exit 0, 5 services

# Phase 1+ run (all services, needs npm install fix already applied via npm install in Dockerfiles):
docker compose -f infra/docker-compose.yml up --build

# Frontend dev (Phase 4+):
# Set-Location frontend; npm install; npm run dev  # -> http://localhost:3000
# Backend dev (Phase 3+):
# Set-Location backend; npm install; npm run dev    # -> http://localhost:4000
# AI service dev (Phase 6+):
# Set-Location ai-service; pip install -r requirements.txt; uvicorn main:app --reload --port 8000
```

Ports (planned): frontend 3000, backend 4000 (socket same), ai-service 8000, postgres 5432, redis 6379.

## 4. Building
- `docker compose -f infra/docker-compose.yml build` builds all images.
- Frontend: `npm run build` (Next.js). Backend: `npm run build` (tsc). AI: `ruff` + `pytest` (Phase 6+).

## 5. Running & Testing
- Docker e2e: `docker compose -f infra/docker-compose.yml up` then open `http://localhost:3000`.
- Unit/integration per service: see per-directory `CONTEXT.md` (Phase 1+).
- Test reports: `docs/TEST_REPORT_<feature>.md`. Issues: `docs/ISSUES_<feature>.md`.

## 6. Deployment
- Dev: docker-compose local. Staging/prod: prod compose `infra/docker-compose.prod.yml` (Phase 9) + Vercel for frontend (optional) + container host for backend/ai. Env via `.env` (see `infra/.env.example` Phase 1+).
- Release: tag `v0.1.0` after Phase 9 green.

## 7. Branching (mandatory)
- `main` = phase merges only. Work in `feature/phase-<n>-<slug>`, merge with `git merge --no-ff` directly (no PR wait).
- Agents use isolated worktrees under `.worktrees/` merged into feature branch.

## 8. Docs map
- `MEMORY.md` rules, `PROJECT_PHASES.md` status, `SUGGESTIONS.md` ideas, `AGENTS_PROMPT.md` agent prompts, `*/CONTEXT.md` per-dir guides, `docs/GAME_DESIGN.md` (Phase 2+).

## 9. Troubleshooting (early)
- `git ls-remote` empty = repo empty (expected pre-Phase 0 push).
- `gh` CLI not installed — use `git` directly.
- Do NOT open `../CRclone` — forbidden reference.
