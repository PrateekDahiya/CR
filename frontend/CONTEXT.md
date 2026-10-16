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
