# frontend/CONTEXT.md

> Per MEMORY.md §2: every top-level directory must explain purpose, tech, structure, how to run/test, key files, conventions.

## Purpose
Next.js lobby + deck + battle shell for CR Clone (Clash Royale-like 1v1 card battler).
Phase 1: minimal functional menu placeholder (title, Play/Lobby/Deck stubs, status dot).
Later phases: lobby → match flow (Phase 4), Canvas battle renderer 60fps + card deploy UX (Phase 5), profiles/leaderboard UI (Phase 7).

## Tech
- Next.js 14 (App Router) + React 18 + TypeScript 5
- TailwindCSS 3 + PostCSS + Autoprefixer
- socket.io-client 4 (installed, not wired until Phase 3/4 backend)
- Node 20 (Docker: `node:20-alpine`), npm

## Structure
```
frontend/
  app/
    layout.tsx    # root layout, metadata, globals.css import
    page.tsx      # "/" placeholder menu (client component)
    globals.css   # tailwind directives + base body styles
  package.json
  tsconfig.json
  next.config.js
  tailwind.config.js
  postcss.config.js
  Dockerfile
  .dockerignore
  .env.example
  CONTEXT.md      # this file
```

## How to run
```powershell
Set-Location frontend
Copy-Item .env.example .env.local
npm install
npm run dev     # -> http://localhost:3000
npm run build   # production build check
npm start       # serve production build on :3000
```

Docker:
```powershell
# from repo root (once infra/docker-compose.yml lands):
docker build -t cr-frontend ./frontend
docker run -p 3000:3000 cr-frontend
# -> http://localhost:3000
```

## Key files
- `app/page.tsx`: menu shell, reads `NEXT_PUBLIC_BACKEND_URL`, stub buttons fire `alert()` only.
- `app/layout.tsx`: html/body wrapper, page metadata.
- `app/globals.css`: `@tailwind base/components/utilities`, dark base.
- `next.config.js`: `reactStrictMode: true`.
- `tailwind.config.js`: content scans `app/` + `components/` (future).
- `Dockerfile`: `npm ci` → `npm run build` → `npm start`, `EXPOSE 3000`.

## Conventions
- App Router only, no `pages/` dir.
- Client interactivity: `"use client"` per file as needed (page.tsx is client for stub buttons).
- Env: all public vars prefixed `NEXT_PUBLIC_`; backend URL via `NEXT_PUBLIC_BACKEND_URL`.
- Styling: Tailwind utilities inline; no CSS modules yet.
- Socket logic (Phase 4+): isolate in `lib/socket.ts` / `components/` (not yet created).

## Ports
- frontend: 3000 (`PORT=3000`, `npm run dev` / `npm start`)
- backend (planned): 4000 (`NEXT_PUBLIC_BACKEND_URL`)
- ai-service (planned): 8000

## Notes / TODO
- `npm ci` in Docker requires `package-lock.json` — run `npm install` locally once and commit the lockfile before `docker build`.
- No backend wiring yet; status dot is static yellow `stub` by design.

## Phase 4 update (2026-10-17, branch feature/phase-4-frontend-shell)
- Routes: `/` menu (Play vs AI / 1v1 / Deck links + backend health dot), `/lobby` (playerId + deck preview + Join/Leave stubs), `/deck` (DeckBuilder 8 slots max2spells localStorage `cr-clone-deck-v1`).
- Lib: `lib/cards.ts` (12 cards + validateDeck), `lib/socket.ts` (queue/deck/card/emote + twins + serverTimeMs), `lib/api.ts` (health/bot/balance fetch).
- Tests: `tests/shell.spec.ts` Playwright Chromium (3 tests PASS live), `playwright.config.ts` chromium project, `npm run test:e2e`. Live UI 8/8 PASS (3100+4100). See docs/TEST_REPORT_phase-4-ui.md.

## Perf (MEMORY#20 — Phase 5 perf pass, branch feature/phase-5-battle-client)
- Frame O(entities): towers (6) + units (≤40) + fx only; static terrain (576 tiles + river + bridges) pre-rendered once to offscreen canvas, O(1) blit/frame; backing store DPR-capped at 2.
- Interp O(1)/unit single-pass (`toRenderUnits` O(v)): shared lookup scratch (no per-frame Map/closure), indexed loops; 60fps loop skips when `document.hidden` + freezes settled game-over frames (dirty-check skips fully static scenes).
- Elixir/deploy/pocket hints O(1)/O(t); particles ≤400 + floats ≤40 ring-buffered (drop oldest), in-place per-frame compaction (no splice/filter allocs).
