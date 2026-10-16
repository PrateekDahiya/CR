# ISSUES — phase-1-frontend (2026-10-16, reviewer: code-review-agent)

> Scope: frontend scaffolding review per MEMORY.md §11 step 3.
> Read-only review. No code edited. CRclone never touched.

## Summary
- Scope reviewed: `frontend/package.json`, `frontend/Dockerfile`, `frontend/app/page.tsx`, `frontend/app/layout.tsx`, `frontend/app/globals.css`, `frontend/next.config.js`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/tsconfig.json`, `frontend/.env.example`, `frontend/.dockerignore`, `infra/docker-compose.yml` (frontend service), `frontend/CONTEXT.md`
- Commit/branch: `feature/phase-1-scaffolding@a0be095`
- Verdict: pass-with-issues (1 blocker, 3 major, 5 minor — no fail; scaffold is structurally correct, Docker build is currently broken without lockfile)

## PASS checklist (verified)
- [x] PASS-01 — `frontend/package.json:1` valid JSON, Next `14.2.5` + React 18 + TS 5 + Tailwind `^3.4.1` + `socket.io-client` present, scripts `dev/build/start/lint` present
- [x] PASS-02 — `frontend/app/layout.tsx:2` imports `./globals.css`; `frontend/app/globals.css:1-3` has `@tailwind base/components/utilities` + dark base
- [x] PASS-03 — `frontend/tailwind.config.js:3-6` content globs cover `./app/**/*` + `./components/**/*` (correct for App Router + future dir)
- [x] PASS-04 — `frontend/postcss.config.js:3-4` wires `tailwindcss` + `autoprefixer`
- [x] PASS-05 — `frontend/next.config.js:3` `reactStrictMode: true`, valid `NextConfig` export
- [x] PASS-06 — `frontend/app/page.tsx:1` `"use client"` correct for `alert()` stubs; `NEXT_PUBLIC_BACKEND_URL` read with `?? "http://localhost:4000"` fallback, no secret leak (public var by design)
- [x] PASS-07 — `frontend/Dockerfile:11` `EXPOSE 3000`; `ENV PORT=3000`, `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1` correct
- [x] PASS-08 — `frontend/.env.example:2` exists with `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`
- [x] PASS-09 — `frontend/.dockerignore:1-9` ignores `node_modules`, `.next`, `.env*.local` — correct
- [x] PASS-10 — `infra/docker-compose.yml:15-17` frontend `build.context: ../frontend` correct relative to `infra/`; `ports: 3000:3000`, `restart: unless-stopped`, `networks: cr-net` correct
- [x] PASS-11 — `frontend/CONTEXT.md:1` present per MEMORY.md §2 (purpose/tech/structure/run/conventions); correctly flags missing lockfile TODO
- [x] PASS-12 — No `pages/` dir, App Router only; no `CRclone` reference/import found in reviewed scope; no hardcoded secrets

## Issues

### ISS-FE-001 — Missing `package-lock.json` breaks Docker `npm ci`
- **Severity**: blocker
- **Status**: open
- **File**: `frontend/Dockerfile:5-6`
- **Category**: correctness
- **Description**: `COPY package.json package-lock.json* ./` + `RUN npm ci` requires a committed lockfile. `frontend/` has no `package-lock.json` (verified `Test-Path` = False). `npm ci` errors `npm error The 'npm ci' command can only install with an existing package-lock.json`. So `docker build ./frontend` and `docker compose build frontend` both fail. `frontend/CONTEXT.md` Notes already admits this TODO.
- **Repro**: `Test-Path frontend/package-lock.json` → False; `docker build -t cr-frontend ./frontend` → `npm ci` failure
- **Suggested fix**: Run `npm install` once locally in `frontend/` and commit `package-lock.json`. Keep `npm ci` in Dockerfile (deterministic). Alternative (weaker): change Dockerfile to `COPY package*.json ./` + `RUN npm ci --omit=dev || npm install`.
- **Fixes**:

### ISS-FE-002 — Dockerfile declares `AS builder` but ships single-stage image
- **Severity**: major
- **Status**: open
- **File**: `frontend/Dockerfile:1-17`
- **Category**: perf
- **Description**: `FROM node:20-alpine AS builder` names a build stage but there is no second `FROM ... AS runner` stage. Final image keeps `devDependencies` (typescript, eslint, tailwind, postcss), build cache, and source — larger image, larger attack surface, slower pull/start. Conventional Next Docker uses multi-stage (`deps` → `builder` → `runner` with `COPY --from=builder /app/.next/standalone`).
- **Repro**: Inspect `frontend/Dockerfile` — single `FROM`, `CMD ["npm", "start"]` serves from full SDK image
- **Suggested fix**: Add runner stage: `FROM node:20-alpine AS runner` + `WORKDIR /app` + `ENV NODE_ENV=production` + `COPY --from=builder /app/.next ./.next` + `COPY --from=builder /app/node_modules ./node_modules` (or adopt `output: 'standalone'` + `COPY --from=builder /app/.next/standalone ./` + `CMD ["node", "server.js"]`). See also ISS-FE-005.
- **Fixes**:

### ISS-FE-003 — `NEXT_PUBLIC_BACKEND_URL` passed at container runtime but baked at build time
- **Severity**: major
- **Status**: open
- **File**: `infra/docker-compose.yml:22-24`
- **Category**: correctness
- **Description**: `NEXT_PUBLIC_*` vars are inlined by Next at `npm run build` time (which happens inside `docker build`). Compose `environment:` only applies at `docker run` time, so changing `NEXT_PUBLIC_BACKEND_URL` in `infra/.env` without `--build` has no effect on the served bundle. Browser-to-backend URL mismatch (`http://backend:4000` vs `http://localhost:4000`) already documented as a pitfall in `infra/CONTEXT.md` Troubleshooting, but compose still suggests runtime-only override.
- **Repro**: `docker compose -f infra/docker-compose.yml up --build` with `NEXT_PUBLIC_BACKEND_URL=http://backend:4000`, then open browser — fetch fails (backend DNS only resolves inside `cr-net`); changing env without rebuild does not change rendered `Backend: ...` string in `app/page.tsx:22`
- **Suggested fix**: Pass as build arg: add `build.args: NEXT_PUBLIC_BACKEND_URL: ${NEXT_PUBLIC_BACKEND_URL:-http://localhost:4000}` in compose frontend service + `ARG NEXT_PUBLIC_BACKEND_URL` in Dockerfile before `RUN npm run build`. Document that changing the public URL requires rebuild. Long-term (Phase 4): use runtime config endpoint or server-side fetch via `BACKEND_URL=http://backend:4000`.
- **Fixes**:

### ISS-FE-004 — Dockerfile runs as root, no `USER` drop
- **Severity**: major
- **Status**: open
- **File**: `frontend/Dockerfile:1-17`
- **Category**: security
- **Description**: No `USER node` / non-root user. Next `node:20-alpine` ships a `node` user; running `npm start` as root violates least-privilege and prod hardening expectations (Phase 9 will require it).
- **Repro**: Read `frontend/Dockerfile` — no `USER` directive
- **Suggested fix**: In runner stage (see ISS-FE-002) add `USER node` before `CMD`. If staying single-stage for Phase 1, add `RUN addgroup -S app && adduser -S app -G app` + `USER app` (or `USER node`) after `RUN npm run build`.
- **Fixes**:

### ISS-FE-005 — `next.config.js` missing `output: 'standalone'` for Docker
- **Severity**: minor
- **Status**: open
- **File**: `frontend/next.config.js:2-4`
- **Category**: perf
- **Description**: Without `output: 'standalone'`, `COPY . .` + `npm start` ships the whole source + full `node_modules`. `standalone` emits a minimal `server.js` + traced deps, the standard minimal Next Docker deploy.
- **Repro**: Read `frontend/next.config.js` — only `reactStrictMode`
- **Suggested fix**: Set `output: "standalone"` in `nextConfig`. Pair with multi-stage Dockerfile (ISS-FE-002).
- **Fixes**:

### ISS-FE-006 — `npm run lint` has no ESLint config file
- **Severity**: minor
- **Status**: open
- **File**: `frontend/package.json:9`
- **Category**: conventions
- **Description**: `package.json` defines `"lint": "next lint"` and installs `eslint` + `eslint-config-next`, but `frontend/` contains no `.eslintrc*` / `eslint.config.*`. On Next 14 `next lint` prompts to initialise config interactively, so `npm run lint` is not CI-safe as-is.
- **Repro**: `Get-ChildItem frontend/ | Where-Object { $_.Name -like '*eslint*' }` → empty; `npm run lint` asks to create config
- **Suggested fix**: Commit a minimal config: `{ "extends": "next/core-web-vitals" }` as `.eslintrc.json`, or drop the `lint` script until Phase 2 if lint is out of scope.
- **Fixes**:

### ISS-FE-007 — Tailwind `content` references non-existent `./components/**`
- **Severity**: minor
- **Status**: open
- **File**: `frontend/tailwind.config.js:5`
- **Category**: conventions
- **Description**: `frontend/components/` does not exist (`Test-Path` = False), so the second content glob matches nothing. Harmless today (Tailwind ignores missing globs) and `CONTEXT.md` marks it `(future)`, but it is a dangling reference that can mask a typo'd path later.
- **Repro**: `Test-Path frontend/components` → False
- **Suggested fix**: Keep as-is (forward-looking) or create empty `frontend/components/.gitkeep`, or add `./lib/**/*.{js,ts,jsx,tsx,mdx}` when `lib/socket.ts` lands (Phase 4). No action strictly required in Phase 1.
- **Fixes**:

### ISS-FE-008 — Compose `depends_on: backend` forces full stack for frontend-only preview
- **Severity**: minor
- **Status**: open
- **File**: `infra/docker-compose.yml:20-21`
- **Category**: conventions
- **Description**: `frontend` depends on `backend`, which transitively pulls `postgres` + `redis`. `docker compose up frontend` therefore builds/starts 4 services even though Phase-1 frontend is a static stub with no backend calls. Slows the fastest preview loop.
- **Repro**: `docker compose -f infra/docker-compose.yml up frontend` → backend/postgres/redis also start
- **Suggested fix**: Remove `depends_on: - backend` from frontend (Phase 1), or keep and document `docker compose up frontend --no-deps` for isolated preview. Re-add hard dependency in Phase 4 when lobby/match flow needs it.
- **Fixes**:

### ISS-FE-009 — Entire `page.tsx` is `"use client"` + `alert()` stubs, extra `BACKEND_URL` env is unused
- **Severity**: minor
- **Status**: open
- **File**: `frontend/app/page.tsx:1,30,37,43`
- **Category**: conventions
- **Description**: (a) Whole menu shell is a client component only to fire three static `alert()` stubs — acceptable Phase-1 placeholder but forfeits server-component static optimisation and `alert()` blocks the main thread / hurts a11y. (b) Compose also injects `BACKEND_URL=http://backend:4000` into frontend (`infra/docker-compose.yml:24`) but `page.tsx` only reads `NEXT_PUBLIC_BACKEND_URL` — dead env, confuses server-vs-browser URL story.
- **Repro**: Read `frontend/app/page.tsx:1` + `infra/docker-compose.yml:24`
- **Suggested fix**: (a) Keep for Phase 1; in Phase 4 split to server shell + client button islands, replace `alert()` with stub routes/toasts and add `aria-label`s. (b) Drop `BACKEND_URL` from frontend service or document it as reserved for future SSR fetch.
- **Fixes**:

## Counts
- blocker: 1 | major: 3 | minor: 5 | verified: 12
