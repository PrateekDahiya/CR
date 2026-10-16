# @cr/shared

Shared TypeScript types + Socket.io protocol for CR Clone (Phase 1 stub).

- `types.ts` — `Card`, `Tower`, `Unit`, `GameState`, `SocketEvents` (stubs; full spec Phase 2).
- Import (until monorepo packaging is decided in Phase 4): `import type { Card, GameState } from '../../shared/types';`
- Typecheck: `npm install; npm run typecheck` inside `shared/`.
- Rules: additive changes only, JSON-serializable payloads, server-authoritative (see `CONTEXT.md`).
