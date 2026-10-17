# backend/CONTEXT.md — Authoritative Game Server (Phase 1 Stub)

> Purpose, tech, structure, run/test, conventions. Keep updated at end of every phase (MEMORY.md rule 2).

## 1. Purpose
- Authoritative realtime game server for CR Clone (Clash Royale-like 1v1 card battler).
- Responsibilities (current stub → future):
  - `GET /health` liveness probe → `{ ok: true, service: "backend" }`.
  - Socket.io connection/disconnect logging + `ping` → `pong` stub.
  - In-memory matchmaking queue stub (`src/matchmaking.ts`: `joinQueue` / `leaveQueue`).
  - Future (Phase 3): authoritative tick loop @ 10–20Hz, movement/combat resolution, elixir regen, action validation/anti-cheat, Redis pubsub for matchmaking/ephemeral state, Postgres (via Prisma) for persistence.

## 2. Tech
- Node.js 20 + Express 4 + Socket.io 4 + CORS + dotenv + redis (client dep, unwired until Phase 3).
- Dev: TypeScript 5 + tsx (watch). Build: `tsc` → `dist/`. Run: `node dist/index.js`.
- Container: `node:20-alpine`, `npm ci` + `npm run build`, `EXPOSE 4000`, `CMD ["npm", "start"]`.

## 3. Structure
```
backend/
  package.json      # express, socket.io, cors, dotenv, redis | dev: typescript, tsx, @types/*
  tsconfig.json     # commonjs, ES2022, outDir dist, rootDir src, strict
  src/
    index.ts        # express app + http server + socket.io, /health, ping/pong
    matchmaking.ts  # in-memory FIFO queue stub (join/leave/size/clear)
  .env.example      # PORT=4000, REDIS_URL=redis://redis:6379
  Dockerfile        # node:20-alpine build
  .dockerignore
  CONTEXT.md        # this file
```

## 4. How to run / test
```powershell
Set-Location backend
Copy-Item .env.example .env   # then edit PORT / REDIS_URL if needed
npm install                   # NOT run during Phase 1 scaffold (per prompt)
npm run dev                   # -> http://localhost:4000 (tsx watch src/index.ts)
# build + prod:
npm run build
npm start
# health check:
# curl http://localhost:4000/health  -> {"ok":true,"service":"backend"}
# docker (from repo root, Phase 1+ compose):
# docker compose -f infra/docker-compose.yml up --build backend
```

## 5. Key files
- `src/index.ts`: single entrypoint. Creates `express()` app, `http.createServer`, `new Server(httpServer, { cors })`. No game logic yet.
- `src/matchmaking.ts`: pure in-memory queue, no I/O, safe to unit-test. Redis-backed in Phase 3.

## 6. Conventions
- Port `4000` (socket on same port). Env via `PORT`, `REDIS_URL`.
- JSON APIs + Socket.io events only; no view layer.
- Strict TS, `esModuleInterop`, `commonjs` modules (matches `tsc` + `node dist/`).
- Logging: `console.log` stubs for now; structured logger in Phase 3+.
- Validation: none yet — Phase 3 adds server-side action validation (positions, elixir costs, cooldowns).

## 7. Socket protocol (stub → Phase 3 expansion)
- Current: `connection`, `disconnect`, `ping` (client→server, any payload) → `pong` `{ received, serverTime }`.
- Planned: `queue:join`, `queue:leave`, `match:found`, `match:state` @ 10–20Hz, `action:playCard` (validated), `match:end`. Full spec lands in `docs/GAME_DESIGN.md` (Phase 2).

## 8. Future tick (Phase 3)
- Authoritative loop at 10–20Hz broadcasting snapshots; 60fps interpolation happens client-side (frontend Canvas).
- Keep tick deterministic, validate all client inputs, persist results to Postgres, ephemeral state in Redis.

## 9. Phase 3 update (2026-10-17 — backend server, feature/phase-3-backend-server)
- Authoritative engine @ 10Hz (`src/game/engine.ts` + `src/net/rooms.ts` TICK_MS=100, canonical `state:update`).
- Tests: 33/33 PASS (16 engine + 17 validation) per docs/TEST_REPORT_phase-3-backend.md.
- Run: `Set-Location backend; npm test` (plus `npx tsc --noEmit` clean).

## 10. Perf (MEMORY#20 — Phase 5 perf pass, feature/phase-5-battle-client)
- `tickGame` O(u·(u+t)) worst-case bounded (u≤40, t=6; ~2k dist² ops, p95 ≪5ms; measured ~0.03–0.05ms avg 40-unit combat tick, ~0ms once over via early-out). Single target-selection pass/unit with AABB+range early-outs, dist² (no sqrt), shared sort scratch + in-place sweeps (zero per-tick allocs). True O(u+t)/tick needs a spatial hash — deferred (constant tiny at u≤40).
- `playCard` validation O(1)/O(1) space (bounded: t=6, ≤5 recent ticks, squad ≤3); in-place playTicks compaction, towers by ref.
- Broadcast O(rooms): one `state:update` emit/room/tick (10Hz); JSON stringify-once-per-room (cached per mutation, invalidated by syncWire); wire snapshot in-place synced O(u+t) zero-alloc steady-state.
- Measured: full 40-unit wire snapshot ≈6105 bytes (EXCEEDS 4KB §9 budget at absolute-max density; ~22-unit mid-game ≈3979 bytes fits) — delta compression already deferred per GAME_DESIGN §13; never drop towers.

## 11. Phase 7 update (2026-10-17, branch feature/phase-7-persistence, MEMORY#20 + #21)
- Persistence: `prisma/schema.prisma` (User/Deck/Match, postgresql + DATABASE_URL) + `src/db.ts` (Prisma when installed + memory fallback, O(1) ops, leaderboard O(n log n) read) + `src/auth.ts` (guest base64url token O(1)) + `src/meta.ts` (6 REST routes) mounted in index.ts.
- Tests: `tests/meta.test.ts` 2 suites; full `npm test` 35/35 PASS; `tsc --noEmit` clean.
- Prod: `npm install @prisma/client prisma pg && npx prisma migrate dev` + DATABASE_URL enables Postgres (docker `postgres` service already in compose). Dev/preview runs memory fallback (db:false).

(End — Phase 1 scaffolding, 2026-10-16; Phase 3 update appended 2026-10-17)

## 12. Phase 10 update (2026-10-17, branch feature/phase-10-authentic-content, MEMORY#22 + #20)
- Content store: src/mysql.ts (Aiven MySQL cr via mysql2 optional dynamic import + local fallback, SSL per DB_SSL, O(1) pool + O(c)/O(m) reads with Big-O comments) + src/content.ts (GET /content/cards|/sprites|/menus|/status) mounted in index.ts. Deps: mysql2 installed for live path.
- Data: infra/mysql/schema.sql (cards/sprites/menus/users/decks/matches) + infra/mysql/seed.py (12 same-name CR cards/stats + 7 menus + 12 sprite metadata rows, original placeholders only). Live verified: cards source:mysql count 12, menus 7, sprites 12.
- Secrets: real creds env-only (infra/.env, gitignored); .env.example placeholders. No .env tracked.
- Tests: tests/content.test.ts 3 suites; full npm test 38/38 PASS; tsc --noEmit clean.
