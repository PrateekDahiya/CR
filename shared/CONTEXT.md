# CONTEXT.md — shared/

> Per MEMORY.md §2: purpose, tech, structure, how to run/test, key files, conventions.

## Purpose
Single source of truth for TypeScript types + realtime protocol shared between
`frontend/` (Next.js) and `backend/` (Express + Socket.io). Prevents drift between
client prediction/rendering and the authoritative server. No runtime logic here —
types only (Phase 1 stub; executable validators arrive Phase 3+ if needed).

## Tech
- TypeScript `^5.5.0` (devDependency only), ESM (`"type": "module"`).
- No runtime dependencies. Must stay framework-free so both Next.js and Node import it
  without bundling issues.

## Structure
- `types.ts` — `Card`, `Tower`, `Unit`, `GameState`, `Vec2`, `SocketEvents` (+ `CardType`,
  `TowerKind`, `PlayerSide` aliases). All fields optional-where-uncertain; Phase 2 nails numbers.
- `package.json` — package `@cr/shared@0.1.0`, `private: true`, `types: ./types.ts`,
  script `typecheck: tsc --noEmit`.
- `README.md` — import recipe for frontend/backend.
- `CONTEXT.md` — this file.

## How to run / test
```powershell
# from repo root — after frontend/backend scaffolding lands (Phase 1, other agents):
# frontend:  npm install ../shared  (or file:../shared dep — decided Phase 4)
# backend:   npm install ../shared
# typecheck this package standalone:
Set-Location shared; npm install; npm run typecheck; Set-Location ..
```
- No unit tests in Phase 1 (types only). Phase 3 adds protocol validation tests importing these types.
- Convention check: `tsc --noEmit` must pass; no `any` in new types without `// TODO(phase-N)` comment.

## Key files
- `shared/types.ts:1` — all shared interfaces (import from `'@cr/shared'` or relative `../../shared/types` until packaging decided).
- `shared/package.json:1` — package stub.

## Conventions
- Additive changes only — never rename/remove a field without a `// BREAKING(phase-N)` note + updating both frontend and backend in the same phase.
- `SocketEvents` keys are the literal wire event names (`'card:play'`, `'state:update'`, …). Payloads stay JSON-serializable (no `Date`, `Map`, class instances — use `number` ms timestamps).
- Server is authoritative: if client and server disagree, server wins. Types express intent; validation lives in `backend/` (Phase 3).
- Keep this file + `types.ts` header comment updated at each phase boundary (MEMORY.md §2).
