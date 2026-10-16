# ISSUES — phase-1-backend (2026-10-16, reviewer: backend-review-agent)

> Scope: Phase 1 backend Express+Socket.io stub. Read-only review — no code edited.
> Template: `docs/ISSUES_TEMPLATE.md`. ID namespace `ISS-BE-*` (= backend track of `ISS-*`).

## Summary
- Scope reviewed: `backend/CONTEXT.md`, `backend/package.json`, `backend/tsconfig.json`, `backend/src/index.ts`, `backend/src/matchmaking.ts`, `backend/Dockerfile`, `backend/.env.example`, `backend/.dockerignore`, `infra/docker-compose.yml` (backend service)
- Commit/branch: `feature/phase-1-scaffolding@a0be095`
- Verdict: **pass-with-issues** (stub is correct for Phase 1; no blocker, fix majors before Docker test gate in MEMORY.md §13)

## Issues

### ISS-BE-001 — Dockerfile `npm ci` with no committed `package-lock.json` breaks `docker build`
- **Severity**: major
- **Status**: open
- **File**: `backend/Dockerfile:5-6`
- **Category**: correctness
- **Description**: Dockerfile does `COPY package.json package-lock.json* ./` then `RUN npm ci`. Repo has `backend/package.json` but no `backend/package-lock.json` (confirmed by glob; `npm install` was intentionally not run in Phase 1 scaffold). `npm ci` requires a lockfile and fails without one, so `docker compose -f infra/docker-compose.yml up --build backend` fails today.
- **Repro**: From repo root: `docker compose -f infra/docker-compose.yml build backend` → `npm ci` errors `requires existing package-lock.json`.
- **Suggested fix**: Generate and commit the lockfile, keep `npm ci`: run `npm install` once in `backend/`, commit `backend/package-lock.json`. Alternative (weaker, not preferred): change Dockerfile to `RUN npm install` — loses reproducible builds.
- **Fixes**: _left for fix agent_

### ISS-BE-002 — `PORT` parsing accepts `NaN`/`0`/negative without fallback
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/index.ts:9`
- **Category**: correctness
- **Description**: `Number(process.env.PORT ?? 4000)` yields `NaN` for `PORT=abc`, `0` for `PORT=""`. `httpServer.listen(NaN)` / `listen(0)` (random port) diverges from documented `4000` and breaks compose port mapping `4000:4000`.
- **Repro**: `PORT=abc npm run dev` → listen fails or binds unexpected port; no warning.
- **Suggested fix**: Validate, e.g. `const parsed = Number(process.env.PORT ?? 4000); const PORT = Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 4000;`
- **Fixes**: _left for fix agent_

### ISS-BE-003 — No exports (`app`/`httpServer`/`io`) — untestable without binding a port
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/index.ts:11`
- **Category**: conventions
- **Description**: `app`, `httpServer`, `io` are module-local and `listen()` runs on import. Test agent (MEMORY.md §11 step 4) cannot `supertest(app)` or open an ephemeral-port Socket.io client without side effects. `matchmaking.ts` is pure and testable; `index.ts` is not.
- **Repro**: `import '../src/index'` in a test always binds `:4000`; parallel tests clash.
- **Suggested fix**: `export { app, httpServer, io };` and guard listen: `if (require.main === module) httpServer.listen(...)`. No behavior change in prod.
- **Fixes**: _left for fix agent_

### ISS-BE-004 — `matchmaking.ts` never imported/wired; no `disconnect` cleanup → queue leak
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/index.ts:28`
- **Category**: correctness
- **Description**: Queue primitives (`joinQueue`/`leaveQueue`) exist but `index.ts` never imports them, exposes no `queue:join`/`queue:leave` handlers, and `disconnect` only logs. If wired later without cleanup, disconnected sockets stay queued forever (unbounded growth). For a pure Phase 1 stub this is acceptable, but it is currently dead code with a latent leak path.
- **Repro**: Code search: `matchmaking` appears in no import. Connect → disconnect → `queueSize()` never decreases (once wired).
- **Suggested fix**: Either (a) document as intentionally unwired stub with `// TODO(Phase 3): wire queue:join/leave + leaveQueue on disconnect`, or (b) wire now: `import { joinQueue, leaveQueue } ...; socket.on("queue:join", ...); socket.on("disconnect", () => leaveQueue(socket.id));`
- **Fixes**: _left for fix agent_

### ISS-BE-005 — `joinQueue` accepts empty/invalid `socketId`, no size cap/TTL
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/matchmaking.ts:17`
- **Category**: correctness
- **Description**: No guard on `socketId` (`""` gets queued, `findIndex` returns a bogus position). No `MAX_QUEUE`, no eviction of stale entries (`joinedAt` is recorded but never read). Single-process stub is fine, but an attacker or bug can grow the array without bound.
- **Repro**: `joinQueue("")` → `{ position: 1, size: 1 }`; loop `joinQueue("x"+i)` → unbounded memory.
- **Suggested fix**: Guard `if (!socketId || typeof socketId !== "string") throw new Error(...)` (or return error), add `const MAX_QUEUE = 1000` with rejection when full, and note TTL/eviction as Phase 3 Redis work.
- **Fixes**: _left for fix agent_

### ISS-BE-006 — No pairing primitive (`takePair`/`tryMatch`) — queue can only grow
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/matchmaking.ts:35`
- **Category**: conventions
- **Description**: API is `join/leave/size/clear` only. FIFO order itself is correct (`push` + `findIndex`), but nothing can pop two players to form a match, so Phase 3 will need new API. Flagging as gap, not bug — `CONTEXT.md` §5 defines this exact surface, so deferral is intentional.
- **Repro**: N/A (design gap).
- **Suggested fix**: Document deferral in file header (`Phase 3: add takePair(): [QueuedPlayer, QueuedPlayer] | null`), or add now: `export function takePair() { return queue.length >= 2 ? [queue.shift()!, queue.shift()!] : null; }`
- **Fixes**: _left for fix agent_

### ISS-BE-007 — CORS `*` (Express + Socket.io) — OK for dev, must not ship to prod
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/index.ts:12` and `backend/src/index.ts:22`
- **Category**: security
- **Description**: `app.use(cors())` and `new Server(..., { cors: { origin: "*", methods: ["GET","POST"] } })` accept any origin. Correct for Phase 1 local dev (frontend on `:3000` → backend on `:4000`), but overly permissive for staging/prod (CSWSH / credential-less API abuse).
- **Repro**: Any origin can `fetch(http://localhost:4000/health)` / open a Socket.io session.
- **Suggested fix**: Env-driven allowlist now, enforce later: `origin: (process.env.CORS_ORIGIN ?? "*").split(",")` with `CORS_ORIGIN=http://localhost:3000` in `.env.example` / compose; document `*` as dev-only in `backend/CONTEXT.md` §6.
- **Fixes**: _left for fix agent_

### ISS-BE-008 — No 404/error handlers, no listen error handling, no graceful shutdown
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/index.ts:45`
- **Category**: correctness
- **Description**: Unknown routes return Express default HTML (not JSON), no `app.use((err, ...))` handler, `httpServer.listen` has no `error` listener (`EADDRINUSE` crashes with stack), no `SIGTERM`/`SIGINT` close (compose `restart: unless-stopped` sends SIGTERM; open sockets delay shutdown).
- **Repro**: `GET /nope` → HTML 404; `PORT=4000` twice → unhandled error; `docker stop` waits full timeout with live sockets.
- **Suggested fix**: Add JSON 404 + error middleware, `httpServer.on("error", ...)` with non-zero exit, and `process.on("SIGTERM", () => { io.close(); httpServer.close(() => process.exit(0)); })`. Keep tiny for stub.
- **Fixes**: _left for fix agent_

### ISS-BE-009 — Dockerfile missing prod hardening (`NODE_ENV`, non-root, `HEALTHCHECK`, devDeps bloat)
- **Severity**: minor
- **Status**: open
- **File**: `backend/Dockerfile:1`
- **Category**: perf
- **Description**: Image builds with devDeps (`typescript`, `tsx`) in final layer, runs as root, no `NODE_ENV=production`, no `HEALTHCHECK` (compose has no healthcheck either, so `depends_on` is ordering-only — matches `infra/CONTEXT.md` troubleshooting note). Fine for Phase 1 stub; record for Phase 9 hardening.
- **Repro**: `docker build` image includes `tsx`/`typescript`; `docker inspect` shows no Healthcheck, User=root.
- **Suggested fix (Phase 9, not now)**: multi-stage build or `npm prune --omit=dev`, `ENV NODE_ENV=production`, `RUN adduser nodejs && USER nodejs`, `HEALTHCHECK CMD wget -qO- http://localhost:4000/health`. Do not change Phase 1 behavior.
- **Fixes**: _left for fix agent_

### ISS-BE-010 — `ping`/`pong` event name shadows engine.io heartbeat terminology
- **Severity**: minor
- **Status**: open
- **File**: `backend/src/index.ts:33`
- **Category**: conventions
- **Description**: Functionally correct (`client ping (any payload)` → `pong { received, serverTime }`, no crash on missing payload via `?? null`). But `ping`/`pong` are engine.io-level packet names; reusing them as application events confuses logs/debugging and risks collision with futureheartbeat tooling. No payload size/type validation or rate limit either (stub-acceptable).
- **Repro**: Works as documented; issue is naming/robustness, not breakage.
- **Suggested fix**: Rename to namespaced events (`game:ping` → `game:pong`) in Phase 2 protocol spec, or keep with comment. Add payload guard later with tick-loop rate limiting (Phase 3).
- **Fixes**: _left for fix agent_

## Counts
- blocker: 0 | major: 1 | minor: 9 | verified: 0

## PASS checklist (explicitly verified — no issue filed)
- [x] **TS validity**: `src/index.ts` + `src/matchmaking.ts` type-check clean by inspection (`strict: true`, `commonjs`/`ES2022`/`outDir dist`/`rootDir src` consistent with `npm run build` → `node dist/index.js`; `esModuleInterop` covers default imports; `_req` prefix avoids unused-param noise; `skipLibCheck` ok). Full `tsc --noEmit` not executed (no `node_modules` per Phase 1 scaffold — test agent runs it after `npm install`).
- [x] **express+http+socket.io wiring**: `express()` → `http.createServer(app)` → `new Server(httpServer, { cors })` → `httpServer.listen(PORT)` — single-port `:4000` correct; Socket.io shares HTTP server (no split-port bug).
- [x] **CORS `*` for dev**: acceptable for Phase 1 (`localhost:3000` → `:4000`); prod lockdown tracked in ISS-BE-007.
- [x] **`/health` shape**: `GET /health` → `{ ok: true, service: "backend" }` via `res.json` — matches `backend/CONTEXT.md` §1/§4.
- [x] **ping/pong**: handler present, echoes payload + `serverTime: Date.now()`; missing-payload safe — see ISS-BE-010 for naming only.
- [x] **Matchmaking FIFO**: `push` tail + `findIndex` position; duplicate `joinQueue(sameId)` correctly no-ops and returns stable position; `leaveQueue` splice + `{ removed, size }`; `clearQueue`/`queueSize` correct; single-threaded array ops race-free. Edge cases (empty id, cap, TTL, pairing) tracked in ISS-BE-005/006, leak wiring in ISS-BE-004.
- [x] **Dockerfile `EXPOSE 4000`**: present (`backend/Dockerfile:12`), matches `PORT=4000` + compose `4000:4000`. `node:20-alpine` + `WORKDIR /app` + `CMD ["npm","start"]` match `CONTEXT.md` §2. Build-breaker (missing lockfile) tracked separately in ISS-BE-001.
- [x] **`.env` handling (`dotenv`)**: `dotenv.config()` at `index.ts:7` (before `PORT` read); `backend/.env.example` has `PORT=4000` + `REDIS_URL=redis://redis:6379`; `.dockerignore` correctly excludes `.env`; compose provides `PORT`/`REDIS_URL` defaults so container works without `.env`.
- [x] **Missing Redis connection — expected, not a bug**: `redis: ^4.7.0` declared in `package.json` but never imported — matches `backend/CONTEXT.md` §§1–2 (`unwired until Phase 3`, Redis-backed queue + pubsub land with authoritative tick). No connection retry/auth/TLS needed yet. Compose already provides `REDIS_URL=redis://redis:6379` + `depends_on: [redis]` for Phase 3.
- [x] **Compose backend service**: `build.context: ../backend` (correct relative to `infra/`), `ports: 4000:4000`, `depends_on: [postgres, redis]`, `REDIS_URL`/`AI_URL` defaults point at in-net names, `cr-net` + `restart: unless-stopped` per repo convention. `PORT=4000` hardcoded (override inflexibility noted, not filed — trivial).
- [x] **Never touched `CRclone`**: review read only the 8 listed paths (+ `.env.example`/`.dockerignore`/templates for evidence); no `D:\Documents\Projects\CRclone` access, no code edits.
