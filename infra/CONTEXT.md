# CONTEXT.md — infra/

> Per MEMORY.md §2: purpose, tech, structure, how to run/test, key files, conventions.

## Purpose
Docker Compose orchestration for the CR Clone monorepo. Single entrypoint to build/run
all services (frontend, backend, ai-service, postgres, redis) on one shared network.

## Tech
- Docker Engine v29.5.3+ / Docker Compose v2 (YAML spec, no `version:` key).
- Images: `postgres:16`, `redis:7`; app services build from `../frontend|backend|ai-service/Dockerfile`
  (those Dockerfiles are owned by other Phase-1 agents — not this scope).

## Structure
- `docker-compose.yml` — dev stack (5 services, `restart: unless-stopped`, named volumes only).
- `docker-compose.prod.yml` — prod stub (same 5 services, `restart: always`, no bind-mounts for code;
  full image pinning/healthchecks in Phase 9).
- `.env.example` — copy to `.env` (`Copy-Item .env.example .env` inside `infra/`). All vars have
  `${VAR:-default}` fallbacks so compose works with or without `.env`.
- `.env` (gitignored via root `.gitignore` `infra/.env`) — local secrets, never commit.

## How to build / run / stop / logs
Run all commands from **repo root** (`D:\Documents\Projects\CR`):

```powershell
# 0. env (optional — defaults already work for local dev)
Copy-Item infra/.env.example infra/.env

# 1. build all images
docker compose -f infra/docker-compose.yml build

# 2. run (foreground, rebuild)
docker compose -f infra/docker-compose.yml up --build

# 3. run detached
docker compose -f infra/docker-compose.yml up -d --build

# 4. logs (all / single service)
docker compose -f infra/docker-compose.yml logs -f
docker compose -f infra/docker-compose.yml logs -f backend

# 5. stop (keep volumes) / down (keep volumes) / down + wipe DB
docker compose -f infra/docker-compose.yml stop
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml down -v  # DANGER: deletes pgdata + redisdata

# 6. prod overlay stub (Phase 9 hardens)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
```

> NOTE (Phase 1): `docker compose up` will FAIL until frontend/backend/ai-service Dockerfiles
> land (parallel agents). Do NOT run docker in this scaffolding step — files only.

## Ports table
| Service    | Container | Host      | URL / use                        |
|------------|-----------|-----------|----------------------------------|
| frontend   | 3000      | 3000      | http://localhost:3000 (Next.js)  |
| backend    | 4000      | 4000      | http://localhost:4000 (Express+Socket.io) |
| ai-service | 8000      | 8000      | http://localhost:8000 (FastAPI; /docs) |
| postgres   | 5432      | 5432      | `postgres://cr:crpass@localhost:5432/crdb` |
| redis      | 6379      | 6379      | `redis://localhost:6379`         |

Inter-service (inside `cr-net`): backend→ `redis://redis:6379`, `http://ai-service:8000`;
ai-service→ `http://backend:4000`; frontend SSR→ `http://backend:4000`; browser→ `http://localhost:4000`
via `NEXT_PUBLIC_BACKEND_URL`. See `infra/.env.example`.

## Key files
- `infra/docker-compose.yml:1` — dev stack (source of truth, 5 services + `cr-net`).
- `infra/docker-compose.prod.yml:1` — prod overlay stub.
- `infra/.env.example:1` — 7 vars: POSTGRES_USER/PASSWORD/DB, REDIS_URL, BACKEND_URL, AI_URL, NEXT_PUBLIC_BACKEND_URL.

## Conventions
- Compose file lives in `infra/`; build contexts MUST be `../<service>` (not `./<service>`).
- Env interpolation always with `:-default` fallback; never hardcode secrets.
- Named volumes `pgdata` (postgres `/var/lib/postgresql/data`), `redisdata` (`/data`) only.
  No bind-mounts for code in committed compose files (`docker-compose.override.yml` is gitignored for local mounts).
- Network: single `cr-net` (bridge). Every service joins it.
- `restart: unless-stopped` (dev) / `always` (prod). No `container_name` (let Compose name them).

## Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| `ADD failed: ../frontend not found` / build context error | Running compose from wrong cwd or Dockerfile missing | Run from repo root; `Test-Path frontend/Dockerfile` — if missing, other Phase-1 agent hasn't landed yet — wait, don't create it (out of scope: never touch `frontend/ backend/ ai-service/` code) |
| `port is already allocated` (3000/4000/8000/5432/6379) | Stale container or local service | `docker ps`; `docker compose -f infra/docker-compose.yml down`; or change host port mapping |
| `postgres password authentication failed` | Changed `.env` after volume init | `docker compose -f infra/docker-compose.yml down -v` (wipes DB) then `up`, or restore old password |
| `redis connection refused` from backend | Backend started before redis ready | `depends_on` orders start only; backend must retry-connect (Phase 3). Check `docker compose logs redis backend` |
| Frontend can't reach backend from browser | `NEXT_PUBLIC_BACKEND_URL` points at `http://backend:4000` (unreachable from host) | Browser must use `http://localhost:4000` — set `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000` in `infra/.env` |
| `env file not found` | No `infra/.env` | Optional — defaults apply. Or `Copy-Item infra/.env.example infra/.env` |
| Compose warns `version is obsolete` | `version:` key present | This repo omits `version:` — keep it that way |

> NOTE: build contexts are `../frontend` (not `./frontend`) because compose lives in `infra/` — keep `../<service>` per Conventions above.

## Phase 9 update (2026-10-17, branch feature/phase-9-deployment, v0.1.0)
- Prod overlay hardened: `restart: always`, healthchecks (postgres pg_isready, redis ping, backend + ai /health), `depends_on` healthy for backend->postgres, DATABASE_URL + SEASON + CORS_ORIGIN wired (backend CORS * dev-only until explicit-origin patch - documented, not changed).
- Env: `.env.example` gains DATABASE_URL, NEXT_PUBLIC_AI_URL, SEASON, CORS_ORIGIN (all `:-default` fallbacks, no secrets committed).
- Verify: `docker compose -f infra/docker-compose.yml config` + `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config` both PASS.
