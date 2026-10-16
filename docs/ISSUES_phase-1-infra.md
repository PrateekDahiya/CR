# ISSUES — phase-1-infra (2026-10-16, reviewer: infra-review-agent)

> Scope: Docker Compose + env + ignore files only. No code touched. `CRclone` never accessed.

## Summary
- Scope reviewed: `infra/docker-compose.yml`, `infra/docker-compose.prod.yml`, `infra/.env.example`, `.dockerignore`, `.gitignore` (cross-checked against `MEMORY.md`, `infra/CONTEXT.md`)
- Commit/branch: `feature/phase-1-scaffolding`@`a0be095`
- Verdict: pass-with-issues (no blockers; 1 major, 6 minor — all fixable without restructuring)

## Issues

### ISS-IN-001 — `infra/.env` may be silently ignored depending on compose project directory
- **Severity**: major
- **Status**: open
- **File**: `infra/docker-compose.yml:23,40-46` (also `infra/docker-compose.prod.yml:24,43-47`; context `infra/CONTEXT.md:26-27`)
- **Category**: correctness
- **Description**: `infra/CONTEXT.md` instructs users to create `infra/.env` and run compose from the repo root (`docker compose -f infra/docker-compose.yml up`). Neither compose file declares `env_file`, and Compose's interpolation-time `.env` lookup is project-directory dependent. If the effective project directory resolves to the repo root, `infra/.env` is NOT auto-loaded for `${VAR:-default}` interpolation — the stack then silently falls back to defaults and user customizations (e.g. a changed `POSTGRES_PASSWORD`) appear to have no effect. Because every var has a `:-default` fallback the stack still boots, so this is a silent-misconfiguration footgun, not a crash.
- **Repro**: `Copy-Item infra/.env.example infra/.env`; set `POSTGRES_PASSWORD=custom123` in `infra/.env`; from repo root run `docker compose -f infra/docker-compose.yml config` (once Dockerfiles land) and check whether `custom123` appears in the rendered config.
- **Suggested fix**: pick one and document it in `infra/CONTEXT.md`: (a) document `--env-file infra/.env` on every compose invocation, or (b) move the canonical `.env` to the repo root, or (c) set `COMPOSE_PROJECT_DIR` / `--project-directory`. Do NOT just add container-level `env_file:` and assume interpolation is fixed — those are two different mechanisms.
- **Fixes**: (left for fix agent)

### ISS-IN-002 — prod overlay changes top-level `name:` (`cr` → `cr-prod`), splitting volumes/networks
- **Severity**: minor
- **Status**: open
- **File**: `infra/docker-compose.prod.yml:12` (vs `infra/docker-compose.yml:11`)
- **Category**: conventions
- **Description**: Used as documented (`-f infra/docker-compose.yml -f infra/docker-compose.prod.yml`), the second file's `name: cr-prod` wins, so the "overlay" run becomes a *separate* Compose project with its own `cr-prod_pgdata` / `cr-prod_redisdata` volumes and network. Data does not carry over from the dev project. That may be intentional for prod isolation, but as an "overlay stub" it reads like it should refine the same project.
- **Repro**: `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config | Select-String "name:"` → shows `cr-prod`.
- **Suggested fix**: either remove `name:` from the prod overlay (inherit `cr` from base) or keep it and document in `infra/CONTEXT.md` that prod is a separate project with fresh volumes (and the `down -v` wipe warning applies per project).
- **Fixes**: (left for fix agent)

### ISS-IN-003 — prod stub still publishes postgres/redis ports to the host
- **Severity**: minor
- **Status**: open
- **File**: `infra/docker-compose.prod.yml:72-73` (`5432:5432`), `infra/docker-compose.prod.yml:82-83` (`6379:6379`)
- **Category**: security
- **Description**: Dev publishing DB/cache ports is correct for local tooling, but the prod file copies the same host bindings. A production database/cache should not be reachable from the host network by default. `infra/CONTEXT.md` already defers hardening to Phase 9, so this is a tracked stub limitation, not a Phase-1 defect — but it should be an explicit issue so Phase 9 doesn't inherit it silently.
- **Repro**: `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config` shows `5432:5432` / `6379:6379` published under the prod overlay.
- **Suggested fix**: in Phase 9, drop `ports:` from `postgres`/`redis` in the prod file (or bind `127.0.0.1:5432:5432` if host tooling is needed). No change needed for dev.
- **Fixes**: (left for fix agent)

### ISS-IN-004 — `ai-service` has no `depends_on` while consuming `BACKEND_URL`/`REDIS_URL`
- **Severity**: minor
- **Status**: open
- **File**: `infra/docker-compose.yml:49-61` (env `57-58`, no `depends_on` block)
- **Category**: correctness
- **Description**: `ai-service` reads `BACKEND_URL` and `REDIS_URL` but declares no startup ordering; symmetrically, `backend` reads `AI_URL` (`infra/docker-compose.yml:41`) but does not (and must not also) depend on `ai-service` — both directions would be a cycle. Current state is acyclic and acceptable for Phase 1, but the asymmetry vs `backend → postgres/redis` (`35-37`) and `frontend → backend` (`20-21`) is undocumented and will confuse the Phase-3 retry-logic work.
- **Repro**: static review — `ai-service` block has `ports`/`environment`/`networks`/`restart` but no `depends_on`.
- **Suggested fix**: document in `infra/CONTEXT.md` troubleshooting (which already covers redis retry) that the omission is intentional to avoid a backend↔ai-service cycle and that both services must retry-connect (Phase 3). Optionally add one-directional `ai-service → backend → postgres/redis` ordering — but only with the retry guarantee, since `depends_on` orders start, not readiness.
- **Fixes**: (left for fix agent)

### ISS-IN-005 — `PORT` hardcoded without `${VAR:-default}` fallback, against stated convention
- **Severity**: minor
- **Status**: open
- **File**: `infra/docker-compose.yml:39` (`PORT=4000`), `infra/docker-compose.yml:56` (`PORT=8000`); same in `infra/docker-compose.prod.yml:42,59`
- **Category**: conventions
- **Description**: `infra/CONTEXT.md:74` says "Env interpolation always with `:-default` fallback". Every other app var follows it, but `PORT` is a bare hardcoded value. Harmless today (matches the published container ports), but a user overriding the host mapping has no `PORT` knob, and the convention exception is undocumented.
- **Repro**: `Select-String "PORT" infra/docker-compose.yml infra/docker-compose.prod.yml` — no `${PORT` interpolation found.
- **Suggested fix**: either switch to `PORT=${BACKEND_PORT:-4000}` / `PORT=${AI_PORT:-8000}` (and mirror in `.env.example` + port mappings) or record `PORT` as an intentional hardcoded exception in `infra/CONTEXT.md`. Keep container `PORT` and published port in sync whichever way.
- **Fixes**: (left for fix agent)

### ISS-IN-006 — no `DATABASE_URL` in `.env.example` / backend env (Prisma convention gap)
- **Severity**: minor
- **Status**: open
- **File**: `infra/.env.example:1-11`; `infra/docker-compose.yml:38-44`
- **Category**: conventions
- **Description**: `MEMORY.md §10` specifies Postgres via Prisma, which conventionally consumes a single `DATABASE_URL=postgresql://user:pass@postgres:5432/db`. The backend instead receives split `POSTGRES_USER/PASSWORD/DB` vars and must construct the URL itself. Workable, but the construction ownership (backend code vs compose) is unspecified anywhere, so the Phase-3/4 backend agent has to guess.
- **Repro**: `Select-String "DATABASE_URL" infra/.env.example infra/docker-compose.yml infra/docker-compose.prod.yml` → no matches.
- **Suggested fix**: decide and document in `infra/CONTEXT.md`: (a) backend constructs `DATABASE_URL` from the three parts (current implicit design — write it down), or (b) add `DATABASE_URL=${DATABASE_URL:-postgresql://cr:crpass@postgres:5432/crdb}` to `.env.example` and pass it through to `backend`. Do not do both sources of truth.
- **Fixes**: (left for fix agent)

### ISS-IN-007 — `.gitignore` `infra/worktrees/*` swallows `.gitkeep`, unlike root `.worktrees` rule
- **Severity**: minor
- **Status**: open
- **File**: `.gitignore:32-35`
- **Category**: conventions
- **Description**: Root worktrees preserve the directory placeholder (`.worktrees/*` + `!.worktrees/.gitkeep`), but `infra/worktrees/*` has no matching exception, so an `infra/worktrees/.gitkeep` placeholder can never be committed and the directory cannot be kept in git. `MEMORY.md §11.6` allows either location, so both should behave the same.
- **Repro**: `git check-ignore -v infra/worktrees/.gitkeep` → matched/ignored (once the path exists); contrast `.worktrees/.gitkeep` → negated/kept.
- **Suggested fix**: add `!infra/worktrees/.gitkeep` under line 35, mirroring line 34.
- **Fixes**: (left for fix agent)

## PASS list (verified — no issue filed)
- 5/5 services present in both files (`frontend`, `backend`, `ai-service`, `postgres`, `redis`) — dev `infra/docker-compose.yml:14-85`, prod `infra/docker-compose.prod.yml:15-88`.
- Build contexts are `../frontend`, `../backend`, `../ai-service` (correct relative to `infra/`; no `./<service>` bug) — dev `16,31,51`, prod `17,32,53`, with explicit `dockerfile: Dockerfile`.
- Ports match spec `3000/4000/8000/5432/6379` (quoted `"<host>:<container>"` strings) — dev `19,34,54,69-70,79-80`; prod `20,36,57,72-73,82-83`.
- `depends_on` ordering correct where present (`frontend → backend`; `backend → postgres, redis`) — dev `20-21,35-37`; prod `21-22,37-39`.
- Single `cr-net` bridge network; every service joined; no stray networks — dev `25-26,45-46,59-60,73-74,83-84,91-93`; prod `27-28,48-49,62-63,76-77,86-87,94-96`.
- Named volumes only (`pgdata → /var/lib/postgresql/data`, `redisdata → /data`); no code bind-mounts — dev `71-72,81-82,87-89`; prod `74-75,84-85,90-92`.
- Restart policy per convention (`unless-stopped` dev ×5, `always` prod ×5); no `container_name` — dev `27,47,61,75,85`; prod `29,50,64,78,88`.
- No obsolete `version:` key in either file (Compose v2 spec) — confirmed by full-file read.
- All 7 `.env.example` vars consumed consistently (`POSTGRES_USER/PASSWORD/DB`, `REDIS_URL`, `BACKEND_URL`, `AI_URL`, `NEXT_PUBLIC_BACKEND_URL`); browser-vs-SSR split correct (`NEXT_PUBLIC_BACKEND_URL=http://localhost:4000` for host, `BACKEND_URL=http://backend:4000` in-net) — `infra/.env.example:5-11`.
- Pinned majors `postgres:16`, `redis:7` acceptable for Phase 1 (full pinning explicitly deferred to Phase 9 per `infra/CONTEXT.md:16-17`).
- Missing healthchecks / `depends_on: condition: service_healthy` acceptable for Phase 1 (deferred to Phase 9; retry documented in `infra/CONTEXT.md:86`).
- `.worktrees` ignored in both files (`.dockerignore:20-21`, `.gitignore:33-35`, modulo ISS-IN-007 `.gitkeep` asymmetry).
- `__pycache__` + `*.py[cod]` + `.venv/`/`venv/` covered in both (`.dockerignore:13-16`, `.gitignore:12-17`).
- Real `.env` files excluded in both (`infra/.env` + root patterns) while `infra/.env.example` stays committable (`.dockerignore:23-26`, `.gitignore:19-23`).
- `docker-compose.override.yml` gitignored for local mounts (`.gitignore:30`), matching `infra/CONTEXT.md:76`.
- `CRclone` never read, listed, or referenced (this review touched only the 5 in-scope files + Memory/Context docs).

## Counts
- blocker: 0 | major: 1 | minor: 6 | verified: 0
