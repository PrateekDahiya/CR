# PROJECT_PHASES - Phase Tracker (Single Source of Truth for Progress)

> Rule: update at start AND end of every phase. `main` gets exactly one merge-commit per phase.
> Repo: https://github.com/PrateekDahiya/CR.git | Branch: `main` | Feature branches: `feature/phase-<n>-<slug>`

## DONE
- [x] Phase 0 - Foundation & Operating System (2026-10-16): MEMORY.md, PROJECT_PHASES.md, SUGGESTIONS.md, AGENTS_PROMPT.md, README skeleton, .gitignore, branching strategy defined. Tech stack LOCKED (user confirmed 2026-10-16): Next.js+Tailwind+TS frontend, Express+Socket.io+Redis+Postgres backend, FastAPI AI, Docker Compose.

## CURRENTLY IN PROGRESS
- [ ] Phase 0 - final step: `git init`, `main` + `feature/phase-0-foundation`, merge --no-ff, push. Then Phase 1 starts.

## NEXT (Planned)
- [ ] Phase 1 - Monorepo Scaffolding + Docker + Context Files: `frontend/` (Next.js+Tailwind), `backend/` (Express+Socket.io), `ai-service/` (FastAPI), `shared/`, `infra/docker-compose.yml`, per-dir CONTEXT.md, README run instructions, `docker compose up` verified.
- [ ] Phase 2 - Game Design Spec: cards, elixir, arenas, towers, win conditions, tick rate, protocol (socket events), balance numbers in `docs/GAME_DESIGN.md`.
- [ ] Phase 3 - Backend Game Server: matchmaking queue, authoritative tick loop (10-20Hz), movement/combat, elixir regen, validation/anti-cheat, Redis pubsub, unit+integration tests.
- [ ] Phase 4 - Frontend Shell: Next.js app, Tailwind, menu/lobby/deck-builder, auth stub, lobby→match flow, REST+Socket client.
- [ ] Phase 5 - Realtime Battle Client: Canvas renderer, 60fps interpolation, card deploy UX, SFX/animations, lag compensation, spectator stub.
- [ ] Phase 6 - Python AI Service: FastAPI bot (rule-based + difficulty levels), single-player mode, balance analytics endpoint.
- [ ] Phase 7 - Persistence & Meta: Postgres+Prisma (users/decks/matches/leaderboard), auth, profiles, leaderboard UI, season stub.
- [ ] Phase 8 - Testing & Hardening: e2e bot-vs-bot via docker, review/test/fix agent cycle, `docs/ISSUES_*` + `docs/TEST_REPORT_*`, perf + security pass.
- [ ] Phase 9 - Deployment: prod docker-compose, Vercel (frontend) + container host (backend/ai), env docs, release tag `v0.1.0`.

## Phase Log
| Phase | Branch | Main merge commit | Date | Notes |
|-------|--------|-------------------|------|-------|
| 0 | `feature/phase-0-foundation` | pending | 2026-10-16 | init operating files |
