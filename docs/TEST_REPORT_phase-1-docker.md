# TEST REPORT — phase-1-docker (Docker config validation only)

> Date: 2026-10-16 | Branch: `feature/phase-1-scaffolding`
> Role: test agent (Phase 1 Docker) per MEMORY.md §11 step 4
> Scope: Docker config validation ONLY. No full build. No edits. `CRclone` never touched.
> Inputs read FIRST: `MEMORY.md`, `infra/docker-compose.yml`, `infra/CONTEXT.md`, `frontend/Dockerfile`, `backend/Dockerfile`, `ai-service/Dockerfile`
> Also consulted (read-only): `frontend/package.json`, `backend/package.json`, `infra/.env.example`, `docs/ISSUES_phase-1-frontend.md`, `docs/ISSUES_phase-1-backend.md`, `docs/ISSUES_phase-1-infra.md`

## 1. Commands executed (from repo root `D:\Documents\Projects\CR`)

All commands read-only / validation-only. No `docker compose build`, no `docker compose up`.

### C1 — versions
```powershell
docker --version; echo "---"; docker compose version
```
Output (full):
```
Docker version 29.5.3, build d1c06ef
---
Docker Compose version v5.1.4
```
Verdict: **PASS** — matches MEMORY.md §13 (v29.5.3) / infra CONTEXT requirement (Engine v29.5.3+, Compose v2).

### C2 — compose config (YAML + interpolation validation)
```powershell
docker compose -f infra/docker-compose.yml config
```
Output (truncated — full render is 5 services + 2 volumes + 1 network, exit 0):
```
name: cr
services:
  ai-service:
    build:
      context: D:\Documents\Projects\CR\ai-service
      dockerfile: Dockerfile
    environment:
      BACKEND_URL: http://backend:4000
      PORT: "8000"
      REDIS_URL: redis://redis:6379
    ...
  backend:
    build:
      context: D:\Documents\Projects\CR\backend
      dockerfile: Dockerfile
    depends_on:
      postgres: { condition: service_started, required: true }
      redis: { condition: service_started, required: true }
    environment:
      AI_URL: http://ai-service:8000
      PORT: "4000"
      POSTGRES_DB: crdb
      POSTGRES_PASSWORD: crpass
      POSTGRES_USER: cr
      REDIS_URL: redis://redis:6379
    ...
  frontend:
    build:
      context: D:\Documents\Projects\CR\frontend
      dockerfile: Dockerfile
    depends_on:
      backend: { condition: service_started, required: true }
    environment:
      BACKEND_URL: http://backend:4000
      NEXT_PUBLIC_BACKEND_URL: http://localhost:4000
    ...
  postgres:
    image: postgres:16
    ...
  redis:
    image: redis:7
    ...
networks:
  cr-net: { name: cr_cr-net, driver: bridge }
volumes:
  pgdata: { name: cr_pgdata }
  redisdata: { name: cr_redisdata }
```
Verdict: **PASS** — YAML valid, no `version:` key warning, all `${VAR:-default}` fallbacks interpolated without `.env` (defaults: `cr/crpass/crdb`, `redis://redis:6379`, `http://backend:4000`, `http://ai-service:8000`, `http://localhost:4000`). Build contexts `../frontend|backend|ai-service` (relative to `infra/`) resolved to absolute `D:\Documents\Projects\CR\<service>` correctly. 5 services, 1 `cr-net` bridge, named volumes `pgdata`/`redisdata` only.

### C3 — build contexts + Dockerfiles + lockfiles exist?
```powershell
Test-Path -LiteralPath "frontend/Dockerfile"      # -> True
Test-Path -LiteralPath "backend/Dockerfile"       # -> True
Test-Path -LiteralPath "ai-service/Dockerfile"    # -> True
Test-Path -LiteralPath "frontend/package-lock.json" # -> False
Test-Path -LiteralPath "backend/package-lock.json"  # -> False
Test-Path -LiteralPath "frontend/package.json"      # -> True
Test-Path -LiteralPath "backend/package.json"       # -> True
Test-Path -LiteralPath "ai-service/requirements.txt" # -> True
git branch --show-current  # -> feature/phase-1-scaffolding
```
```powershell
Get-ChildItem -LiteralPath "infra"     # -> .env.example, CONTEXT.md, docker-compose.prod.yml, docker-compose.yml
Get-ChildItem -LiteralPath "frontend"  # -> app/, .dockerignore, .env.example, CONTEXT.md, Dockerfile, next.config.js, package.json, postcss.config.js, tailwind.config.js, tsconfig.json (NO package-lock.json)
Get-ChildItem -LiteralPath "backend"   # -> src/, .dockerignore, .env.example, CONTEXT.md, Dockerfile, package.json, tsconfig.json (NO package-lock.json)
Get-ChildItem -LiteralPath "ai-service" # -> main.py, requirements.txt, test_main.py, Dockerfile, .env.example, CONTEXT.md
```
Verdict:
- **PASS** — all 3 Dockerfiles exist; all 3 build-context dirs exist; `package.json` ×2 + `requirements.txt` exist; branch `feature/phase-1-scaffolding` confirmed.
- **FAIL (expected, build not attempted)** — `package-lock.json` missing in both `frontend/` and `backend/` (`Test-Path` = False). Both Dockerfiles run `COPY package.json package-lock.json* ./` + `RUN npm ci`, and `npm ci` errors without a lockfile (`npm error The 'npm ci' command can only install with an existing package-lock.json`). Therefore `docker compose build` / `docker build ./frontend|backend` is predicted to FAIL. Per task instruction, build was deliberately SKIPPED (no `--no-cache`, no timeout needed).

### C4 — build attempt
```
NOT EXECUTED — intentionally skipped per requirement:
"Do NOT run `docker compose build` if lockfiles missing (report as expected FAIL)".
Predicted failure reason: `npm ci` without lockfile (see C3).
ai-service build (python:3.12-slim + requirements.txt) is expected to PASS in isolation, but full-stack `build` still FAILs due to frontend/backend.
```
Verdict: **SKIP (expected FAIL)** — see §3.

## 2. PASS / FAIL summary

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| D1 | `docker --version` / compose version | PASS | 29.5.3 / v5.1.4 |
| D2 | `docker compose -f infra/docker-compose.yml config` (YAML + interpolation) | PASS | exit 0, 5 services rendered, defaults applied |
| D3 | Build contexts `../frontend|backend|ai-service` resolve from `infra/` | PASS | config shows absolute `D:\Documents\Projects\CR\<service>` contexts |
| D4 | Dockerfiles present (3/3) | PASS | `Test-Path` True ×3 |
| D5 | `frontend`/`backend` `npm ci` build readiness | FAIL (expected) | no `package-lock.json` (False ×2); `npm ci` requires lockfile |
| D6 | Full `docker compose build` | SKIP (expected FAIL) | not run by design; would fail on D5 |
| D7 | `ai-service` Dockerfile + `requirements.txt` present | PASS | `python:3.12-slim`, `pip install -r requirements.txt`, `EXPOSE 8000` |

Overall: **config VALID, build BLOCKED on lockfiles (expected Phase-1 state).**

## 3. Linked issues (all `Status: open`, no fix applied by this agent)

- **ISS-FE-001 (blocker)** — `docs/ISSUES_phase-1-frontend.md:27` — Missing `frontend/package-lock.json` breaks Docker `npm ci` (`frontend/Dockerfile:5-6`). Direct cause of D5 FAIL (frontend leg).
- **ISS-BE-001 (major)** — `docs/ISSUES_phase-1-backend.md:13` — Missing `backend/package-lock.json` breaks Docker `npm ci` (`backend/Dockerfile:5-6`). Direct cause of D5 FAIL (backend leg).
- Context (not gating this report, for fix-agent awareness):
  - **ISS-IN-001 (major)** — `docs/ISSUES_phase-1-infra.md:12` — `infra/.env` may be silently ignored depending on project dir (interpolation fallback masks it; config today uses defaults — consistent with this report's C2 output).
  - **ISS-FE-002/003/004, ISS-BE-009, ISS-IN-002..007** — perf/security/convention notes; do not affect config validation.

## 4. Recommendation

**Preferred: commit lockfiles, keep `npm ci` (deterministic).**
```powershell
Set-Location frontend; npm install   # generates package-lock.json
Set-Location ../backend; npm install  # generates package-lock.json
# then commit both lockfiles on feature/phase-1-scaffolding; re-run:
# docker compose -f infra/docker-compose.yml config
# docker compose -f infra/docker-compose.yml build   # short-timeout smoke only
```
This resolves ISS-FE-001 + ISS-BE-001 with no Dockerfile change and preserves reproducible builds.

**Weaker alternative (not recommended): switch Dockerfile to `npm install`.**
- Change `RUN npm ci` → `RUN npm install` (or `COPY package*.json` + fallback). Loses determinism; hides version drift; contradicts `frontend/CONTEXT.md` + review-agent guidance. Use only if lockfiles cannot be committed (e.g. registry offline).

After lockfiles land, the next test gate is `docker compose -f infra/docker-compose.yml build` (expect ai-service PASS, backend/frontend PASS), then `up -d postgres redis` health smoke before full `up --build`.

## 5. Constraints honored

- Only file written: `docs/TEST_REPORT_phase-1-docker.md` (this file).
- No code edited. No `CRclone` (`D:\Documents\Projects\CRclone`) read, listed, or referenced beyond this line.
- No `docker compose build/up` executed (predicted FAIL documented instead).
