# ISSUES_phase-7-meta - Review (main-agent, no subagents)

> Branch `feature/phase-7-persistence`. Reviewer: main-agent.

## Verdict: pass-with-issues (0 blocker, 1 major, 2 minor - all fixed or accepted)

- **ISS-M7-001 (major) `@prisma/client` not installed** - db.ts static import would break tsc/build + preview. Fixed: dynamic `require` + `DATABASE_URL` guard + memory fallback. `tsc` backend clean, `npm test` 35/35. Prod path documented (install + migrate). Accepted for Phase 7; Phase 9 compose wires real postgres.
- **ISS-M7-002 (minor) Deck id deterministic `${user.id}-active`** - concurrent renames overwrite; fine for single-active-deck Phase 7. Accepted, multi-deck in Phase 8+.
- **ISS-M7-003 (minor) Trophy K=24 flat** - no Elo decay/caps; matches CR-lite feel. Accepted for season stub.

## PASS (8)
- schema.prisma User/Deck/Match + indexes, datasource postgresql + DATABASE_URL.
- db.ts O(1) upsert/get/save/record, leaderboard O(n log n) read, Big-O comments.
- auth.ts mint/verify O(1), guest flow.
- meta.ts 6 routes (guest/profile/leaderboard/deck/report/season) mounted in index.ts.
- meta.test.ts 2 suites green; full backend 35/35.
- live :4000 (restarted): health + guest + profile + leaderboard + deck + report + season all PASS (db:false fallback).
- frontend api.ts getProfile/getLeaderboard/postGuest + leaderboard page CR-style (gold table, testids).
- No CRclone touch, preview :3000/:8000 intact during work (only :4000 restarted, per MEMORY#19).
