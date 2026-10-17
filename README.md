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

## 3. Quickstart (v0.1.0 - all 10 phases DONE + TESTED)
```powershell
# clone
git clone https://github.com/PrateekDahiya/CR.git
Set-Location CR
git checkout main   # phase-only merges 0..9 + tag v0.1.0

# validate compose (no build):
docker compose -f infra/docker-compose.yml config
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config

# run everything (dev):
docker compose -f infra/docker-compose.yml up --build
# -> UI http://localhost:3000, backend http://localhost:4000/health, ai http://localhost:8000/health

# run prod overlay (restart always + healthchecks + DATABASE_URL/SEASON):
Copy-Item infra/.env.example infra/.env   # edit POSTGRES_PASSWORD + CORS_ORIGIN for real hosts
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build

# local dev (no docker):
# Set-Location backend; npm install; npm run dev      # -> :4000
# Set-Location frontend; npm install; npm run dev     # -> :3000 (NEXT_PUBLIC_BACKEND_URL=http://localhost:4000)
# Set-Location ai-service; pip install -r requirements.txt; uvicorn main:app --port 8000
```

Ports (planned): frontend 3000, backend 4000 (socket same), ai-service 8000, postgres 5432, redis 6379.

## 4. Building
- `docker compose -f infra/docker-compose.yml build` builds all images.
- Frontend: `npm run build` (Next.js). Backend: `npm run build` (tsc). AI: `ruff` + `pytest` (Phase 6+).

## 5. Running & Testing
- Docker e2e: `docker compose -f infra/docker-compose.yml up` then open `http://localhost:3000`.
- Unit/integration per service:
  - backend: `Set-Location backend; npm test` (35/35: engine 16 + validation 17 + meta 2) + `npx tsc --noEmit` clean.
  - ai-service: `python -m pytest -q` (12/12) + `python bot.py` self-check.
  - frontend: `npx playwright test --project=chromium` (shell 3 + battle 4 PASS) + `tsc` (only pre-existing DeckBuilder TS2802).
- Test reports: `docs/TEST_REPORT_<feature>.md` (static + live + e2e). Issues: `docs/ISSUES_<feature>.md`.
- Perf budgets (MEMORY#20): tick ~0.04ms (<5ms), AI ~0.05ms (<50ms), 60fps O(v). Snapshot 6105B@40u note (delta deferred).
- Live previews: :3000/:4000/:8000 (MEMORY#19, detached, restarted per phase).

## 6. Deployment
- Dev: `docker compose -f infra/docker-compose.yml up --build` (restart unless-stopped, memory fallback DB).
- Prod: `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build` (restart always, healthchecks postgres/redis/backend/ai, DATABASE_URL + SEASON wired, CORS_ORIGIN documented - backend still CORS * until explicit-origin patch).
- Frontend alt: Vercel (set NEXT_PUBLIC_BACKEND_URL + NEXT_PUBLIC_AI_URL to container host). Backend/AI: any container host (Render/Fly/VM) with postgres:16 + redis:7.
- Env: copy `infra/.env.example` -> `infra/.env` (gitignored), set POSTGRES_PASSWORD, DATABASE_URL, CORS_ORIGIN, SEASON. Never commit `.env`.
- Prisma: `npm install @prisma/client prisma pg` in backend, `npx prisma migrate dev` with DATABASE_URL (Phase 7 schema User/Deck/Match).
- Release: tag `v0.1.0` (Phase 9 green = phases 0-9 merged + suites 47/47 + live + compose config PASS).

## 7. Branching (mandatory)
- `main` = phase merges only. Work in `feature/phase-<n>-<slug>`, merge with `git merge --no-ff` directly (no PR wait).
- Agents use isolated worktrees under `.worktrees/` merged into feature branch.

## 8. Docs map
- `MEMORY.md` rules, `PROJECT_PHASES.md` status, `SUGGESTIONS.md` ideas, `AGENTS_PROMPT.md` agent prompts, `*/CONTEXT.md` per-dir guides, `docs/GAME_DESIGN.md` (Phase 2+).

## 9. Troubleshooting (early)
- `git ls-remote` empty = repo empty (expected pre-Phase 0 push).
- `gh` CLI not installed — use `git` directly.
- Do NOT open `../CRclone` — forbidden reference.
