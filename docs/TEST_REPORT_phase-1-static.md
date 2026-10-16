# TEST REPORT — phase-1-static (static + syntax, no heavy deps)

> Date: 2026-10-16 | Branch: `feature/phase-1-scaffolding` @ `a0be095` | Agent: test-agent-static
> Scope: Phase 1 scaffolding static/syntax validation only. No code edited. `CRclone` never read/listed/imported (existence confirmed via `Test-Path` only, no traversal).
> Inputs read first: `MEMORY.md`, `docs/ISSUES_phase-1-frontend.md`, `docs/ISSUES_phase-1-backend.md`, `docs/ISSUES_phase-1-ai-shared.md`, `docs/ISSUES_phase-1-infra.md` + in-scope `CONTEXT.md` files (auto-attached as system-reminders, not edited).
> Method constraint: no `npm install` / `pip install`, no `docker build/up`, no network fetches. `npx tsc` not available offline → fallback to python-based import/structure check per task spec.

## 1. Env

| Item | Value |
|------|-------|
| OS / Shell | Windows, PowerShell 5.1 (`win32`) |
| Workdir | `D:\Documents\Projects\CR` |
| Branch | `feature/phase-1-scaffolding` |
| Commit | `a0be095 phase(0): foundation - MEMORY, PHASES, SUGGESTIONS, AGENTS_PROMPT, README, gitignore + locked stack` |
| Python | `3.12.10 (tags/v3.12.10:0cc8128, MSC v.1943 64-bit)` |
| Node / npm / npx | `v24.16.0` / `11.13.0` / `11.13.0` |
| tsc | NOT available (`npx --no-install tsc --version` → `npm error npx canceled due to missing packages`, `Get-Command tsc` → none, `frontend|backend|shared/node_modules` → False) |
| Python libs (pre-installed, not installed by this run) | `fastapi 0.115.6`, `pydantic 2.13.4`, `uvicorn 0.34.0`, `pytest 8.3.4`, `PyYAML 6.0.3` |
| Docker | `29.5.3, build d1c06ef` (version check only, no daemon calls) |
| Lockfiles | `frontend/package-lock.json` → False, `backend/package-lock.json` → False |
| CRclone | `Test-Path D:\Documents\Projects\CRclone` → True (existence only, never entered) |
| Git status (pre-report) | Untracked scaffolding dirs (`ai-service/ backend/ docs/ frontend/ infra/ shared/ .dockerignore .worktrees/`) on feature branch; this report is the only file written |

## 2. Commands run (exact, from repo root unless noted)

```powershell
# C0 env
python --version; node --version; npm --version; npx --version
git branch --show-current; git rev-parse --short HEAD
Get-ChildItem -Recurse -File | Select-Object FullName

# C1 JSON load (all three)
python -c "import json; [json.load(open(p)) for p in ['frontend/package.json','backend/package.json','shared/package.json']]; print('JSON_LOAD_ALL_PASS')"
# C1b JSON detail
python -c "import json; d=json.load(open('frontend/package.json')); print(...)"
python -c "import json; d=json.load(open('backend/package.json')); print(...)"
python -c "import json; d=json.load(open('shared/package.json')); print(...)"
Get-Content frontend/package.json | ConvertFrom-Json | Select-Object -ExpandProperty scripts

# C2 frontend JS syntax
node --check frontend/next.config.js       # → NEXT_CONFIG_CHECK_PASS
node --check frontend/tailwind.config.js   # → TAILWIND_CHECK_PASS
node --check frontend/postcss.config.js    # → POSTCSS_CHECK_PASS

# C3 tsc availability probe (no install)
npx --no-install tsc --version             # → TSC_NOT_AVAILABLE
Get-Command tsc -ErrorAction SilentlyContinue  # → NO_GLOBAL_TSC
Test-Path frontend/node_modules / backend/node_modules / shared/node_modules  # → False ×3

# C4 backend/shared TS fallback (no tsc): import + export structure via Select-String
Select-String -Path backend/src/index.ts -Pattern "^import"
Select-String -Path backend/src/matchmaking.ts -Pattern "^import|^export"
Select-String -Path shared/types.ts -Pattern "^export|^import"
Select-String -Path frontend/app/page.tsx -Pattern "use client|NEXT_PUBLIC"
Select-String -Path frontend/app/layout.tsx -Pattern "import|globals.css"

# C5 python compile
python -m py_compile ai-service/main.py    # → PY_COMPILE_MAIN_PASS
python -m py_compile ai-service/test_main.py  # → PY_COMPILE_TEST_PASS

# C6 yaml
python -c "import yaml, sys; yaml.safe_load(open('infra/docker-compose.yml')); print('YAML_SAFE_LOAD_PASS')"
python -c "import yaml; d=yaml.safe_load(open('infra/docker-compose.yml')); print(services/networks/volumes); d2=yaml.safe_load(open('infra/docker-compose.prod.yml')); print(prod_services)"

# C7 Dockerfiles required strings (python substring check, no build)
python -c "checks={frontend/Dockerfile:[FROM node:20-alpine,WORKDIR /app,COPY package.json,RUN npm ci,RUN npm run build,EXPOSE 3000,CMD], ...}; for f,needles...: print(PASS|FAIL|f|needle)"

# C8 CONTEXT.md existence
python -c "import os; for d in [frontend,backend,ai-service,infra,docs,shared]: print(PASS|FAIL|d/CONTEXT.md); for f in [README.md,MEMORY.md,PROJECT_PHASES.md]: print(...)"

# C9 .env.example vars
python -c "files={frontend/.env.example:[NEXT_PUBLIC_BACKEND_URL], backend/.env.example:[PORT,REDIS_URL], ai-service/.env.example:[PORT], infra/.env.example:[POSTGRES_USER,POSTGRES_PASSWORD,POSTGRES_DB,REDIS_URL,BACKEND_URL,AI_URL,NEXT_PUBLIC_BACKEND_URL]}; ..."

# C10 misc corroboration
Get-Content ai-service/requirements.txt
python -c "import pathlib; t=pathlib.Path('shared/types.ts').read_text(); print('em-ote-found' if 'em:ote' in t else 'not-found')"
Test-Path docs/TEST_REPORT_phase-1-static.md  # → False (pre-write)
Test-Path frontend/package-lock.json; Test-Path backend/package-lock.json  # → False ×2
```

No `npm install`, no `pip install`, no `docker compose build/up`, no edits to source files (verified: only this report written).

## 3. Results — PASS/FAIL per check (with linked ISS IDs)

| # | Check | Result | Evidence | Linked ISS |
|---|-------|--------|----------|------------|
| S-01 | `frontend/package.json` valid JSON, expected scripts/deps | **PASS** | `JSON_LOAD_ALL_PASS`; name `cr-clone-frontend`, scripts `build,dev,lint,start`, deps include `next 14.2.5 + react 18 + tailwind ^3.4.1 + socket.io-client` | Corroborates `ISS-FE` PASS-01; open concern `ISS-FE-006` (lint script w/o eslint config) not invalidated |
| S-02 | `backend/package.json` valid JSON, expected scripts/deps | **PASS** | name `cr-clone-backend`, scripts `build,dev,start`, deps `express/cors/dotenv/redis/socket.io + typescript/tsx` | Corroborates `ISS-BE` PASS wiring section; no new issue |
| S-03 | `shared/package.json` valid JSON, expected fields | **PASS** | name `@cr/shared`, `types: ./types.ts`, script `typecheck: tsc --noEmit`, devDep `typescript ^5.5.0` | Corroborates `ISS-SH` PASS-08/10; no new issue |
| S-04 | `frontend/next.config.js` syntax | **PASS** | `node --check` exit 0 | Corroborates `ISS-FE-005` context (file parses; missing `output:'standalone'` is design gap, not syntax) |
| S-05 | `frontend/tailwind.config.js` syntax | **PASS** | `node --check` exit 0 | Corroborates PASS-03; dangling `./components/**` tracked in `ISS-FE-007` (minor, not syntax) |
| S-06 | `frontend/postcss.config.js` syntax | **PASS** | `node --check` exit 0 | Corroborates PASS-04 |
| S-07 | Backend TS `tsc --noEmit` | **SKIP (env-limited) → fallback PASS-structural** | `npx --no-install tsc` unavailable, no `node_modules`, no global `tsc`; per task spec used `Select-String` import/export check instead (see S-08). Full typecheck deferred to test agent with deps. | Matches `ISS-BE` PASS note: “Full `tsc --noEmit` not executed (no `node_modules` … test agent runs it after `npm install`)” |
| S-08 | Backend/shared TS structure (fallback): imports resolve to declared deps, exports present, braces balanced by inspection | **PASS-structural** | `backend/src/index.ts:1-5` imports `express,cors,dotenv,http, socket.io` — all in `backend/package.json` deps or node builtins; `matchmaking.ts` exports `QueuedPlayer/joinQueue/leaveQueue/queueSize/clearQueue`, no imports (pure); `shared/types.ts` exports `CardType/TowerKind/PlayerSide/Vec2/Card/Tower/Unit/GameState/SocketEvents`, no imports (types-only, correct); `frontend/app/page.tsx:1` has `"use client"` + `NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"`; `layout.tsx:1-2` imports `next Metadata` + `./globals.css` | Latent issues remain logic-level, not syntax: `ISS-BE-002` (PORT NaN), `ISS-BE-003` (no exports), `ISS-BE-004` (matchmaking unwired), `ISS-BE-005/006` (validation/pairing gaps), `ISS-BE-007/008/010` (CORS/404/naming) — none contradicted. Shared typo `'em:ote'` reconfirmed present → `ISS-SH-001` (major) still open; `ISS-SH-002/003/004` unaffected |
| S-09 | `ai-service/main.py` py_compile | **PASS** | `PY_COMPILE_MAIN_PASS` | Stub logic issues `ISS-AI-001` (difficulty coercion), `ISS-AI-002` (no balance models), `ISS-AI-003` (unbounded x/y), `ISS-AI-008` (opaque game_state) are runtime semantics, not syntax — still open |
| S-10 | `ai-service/test_main.py` py_compile | **PASS** | `PY_COMPILE_TEST_PASS` | Coverage gaps `ISS-AI-006` + import fragility `ISS-AI-007` still open (file parses) |
| S-11 | `infra/docker-compose.yml` YAML safe_load | **PASS** | `YAML_SAFE_LOAD_PASS` via `PyYAML 6.0.3`; services `ai-service,backend,frontend,postgres,redis`, network `cr-net`, volumes `pgdata,redisdata` | Corroborates `ISS-IN` PASS list (5/5 services, no `version:` key); remaining `ISS-IN-001…007` are semantics/conventions, not YAML syntax |
| S-12 | `infra/docker-compose.prod.yml` YAML safe_load | **PASS** | prod services same 5; `name: cr-prod` confirmed | `ISS-IN-002` (name split), `ISS-IN-003` (prod port publishing) still open |
| S-13 | `frontend/Dockerfile` required strings | **PASS-syntax / FAIL-build-gate** | All 7 substrings present: `FROM node:20-alpine`, `WORKDIR /app`, `COPY package.json`, `RUN npm ci`, `RUN npm run build`, `EXPOSE 3000`, `CMD` | Syntax PASS but build FAILs without lockfile → **`ISS-FE-001` (blocker) reconfirmed**: `Test-Path frontend/package-lock.json` → False so `RUN npm ci` errors. Design issues `ISS-FE-002` (single-stage), `ISS-FE-004` (root user), `ISS-FE-003` (NEXT_PUBLIC baked at build) remain |
| S-14 | `backend/Dockerfile` required strings | **PASS-syntax / FAIL-build-gate** | All 7 present with `EXPOSE 4000` | Same lockfile gate → **`ISS-BE-001` (major) reconfirmed** (`backend/package-lock.json` → False). Hardening `ISS-BE-009` remains |
| S-15 | `ai-service/Dockerfile` required strings | **PASS** | All 6 present: `FROM python:3.12-slim`, `WORKDIR /app`, `COPY requirements.txt`, `pip install`, `EXPOSE 8000`, `uvicorn` | Pinning/hardening `ISS-AI-004/005` remain (not syntax) |
| S-16 | `CONTEXT.md` per top-level dir (MEMORY.md §2) | **PASS (6/6)** | `frontend/backend/ai-service/infra/docs/shared/CONTEXT.md` all exist + root `README.md/MEMORY.md/PROJECT_PHASES.md` exist | Closes MEMORY.md §2 gate for Phase 1; content accuracy already reviewed in ISS files |
| S-17 | `.env.example` vars | **PASS (all present)** | `frontend`: `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`; `backend`: `PORT=4000 + REDIS_URL=redis://redis:6379`; `ai-service`: `PORT=8000`; `infra`: all 7 `POSTGRES_USER/PASSWORD/DB, REDIS_URL, BACKEND_URL, AI_URL, NEXT_PUBLIC_BACKEND_URL` | Consistent with `ISS-IN` PASS-11 (`All 7 .env.example vars consumed`); gaps `ISS-IN-005` (PORT hardcoded w/o fallback) + `ISS-IN-006` (no DATABASE_URL) + `ISS-IN-001` (infra/.env load dir) remain open but vars themselves present |
| S-18 | No lockfiles (Docker gate probe) | **FAIL (expected, pre-documented)** | `frontend/package-lock.json` → False, `backend/package-lock.json` → False | **Reconfirms `ISS-FE-001` (blocker) + `ISS-BE-001` (major)** — `docker compose build frontend/backend` will fail at `npm ci` today |
| S-19 | `shared/types.ts` known typo probe | **FAIL (pre-filed, still present)** | `'em:ote'` found on line 82 | **Reconfirms `ISS-SH-001` (major)** — string-literal valid TS so S-08 passes, wire name wrong |
| S-20 | CRclone isolation | **PASS** | No `CRclone` path read/listed/imported; only `Test-Path` existence check; `Select-String` greps limited to `D:\Documents\Projects\CR` scope | Complies with MEMORY.md §1 + all ISS scope statements |

## 4. Overall verdict

**STATIC-SYNTAX: PASS (with known open issues) — DOCKER-BUILD GATE: FAIL (blocked, as already filed).**

- All parseable artifacts parse: 3/3 `package.json` JSON-load PASS, 3/3 frontend `*.js` `node --check` PASS, 2/2 Python `py_compile` PASS, 2/2 compose YAML `safe_load` PASS, 3/3 Dockerfiles contain required strings, 6/6 `CONTEXT.md` present, 4/4 `.env.example` var sets complete.
- No new blocker found by static sweep. All FAILs observed are the already-filed ones:
  - `ISS-FE-001` (blocker, missing `frontend/package-lock.json`) + `ISS-BE-001` (major, missing `backend/package-lock.json`) → `docker compose build` cannot succeed today. This is the sole gate failure.
  - `ISS-SH-001` (major, `'em:ote'` typo) reconfirmed present via substring probe.
  - All other `ISS-FE-002…009`, `ISS-BE-002…010`, `ISS-AI-001…008` / `ISS-SH-002…004`, `ISS-IN-001…007` are semantic/convention/perf items — not contradicted by syntax results, remain `open` for fix agents.
- `tsc --noEmit` full typecheck explicitly **not run** (no `node_modules`, no network installs per task constraint). Fallback structural check passed; fix/test agents must run `npm install` + `tsc --noEmit` + `pytest -q` + `docker compose config/build` to close the loop.

## 5. Fix-agent handoff (no fix applied by this agent)

1. Highest priority: `ISS-FE-001` + `ISS-BE-001` — run `npm install` in `frontend/` + `backend/`, commit lockfiles, keep `npm ci` (do not downgrade to `npm install` in Docker).
2. Next: `ISS-SH-001` — rename `'em:ote'` → `'emote:send'` with `// BREAKING(phase-2)` note + same-phase frontend/backend update (see `ISS-SH-004` process).
3. Then majors: `ISS-AI-001` (Literal difficulty → 422), `ISS-AI-006` (balance/edge tests), `ISS-IN-001` (document `--env-file` vs root `.env`), `ISS-FE-002/003/004` (multi-stage + ARG + USER).
4. Verifier must re-run: `tsc --noEmit` per package, `pytest -q` from `ai-service/`, `docker compose -f infra/docker-compose.yml config` + `build`, and flip ISS `Status` per `docs/ISSUES_TEMPLATE.md` lifecycle.

---
*End of report — static only. No source files modified. Single file written: `docs/TEST_REPORT_phase-1-static.md`.*
