# ISSUES_phase-8-hardening - Review (main-agent)

> Branch `feature/phase-8-hardening`. Full-repo gate before deployment.

## Verdict: PASS with notes (0 blocker, 1 major fixed, 2 minor accepted)

- **ISS-H8-001 (major) `bot.py` self-check wrong expectation** - medium expected `musketeer`, greedy correctly picks `skeletons` (240 dps/1 elixir = max value). Fixed: expectation -> `skeletons` + comment. Verified `python bot.py` OK + pytest 12/12.
- **ISS-H8-002 (minor) Snapshot 6105B @ 40u exceeds 4KB §9 budget** - known since Phase 5 perf pass; 22u mid-game 3979B fits. Accepted: delta compression deferred (GAME_DESIGN §13), never drop towers. Logged for Phase 9+ follow-up.
- **ISS-H8-003 (minor) Pydantic `class Config` deprecated + DeckBuilder TS2802** - both pre-existing, no behavior impact. Accepted, scheduled Phase 9 cleanup.

## PASS (12)
- backend `npm test` 35/35, `tsc --noEmit` clean.
- ai-service `pytest` 12/12, `bot.py` self-check OK.
- `docker compose config` PASS (5 services).
- No tracked secrets (only `.env.example` placeholders); no `.env` in git.
- CORS `*` dev-only (noted for prod lockdown Phase 9).
- Rate limits: play 5/s, emote 1/5s, validation 8 codes enforced (Phase 3 live 39/39 on same code).
- Previews :3000/:4000/:8000 alive (verified post-merge).
- Perf: tick ~0.04ms (budget 5ms), AI took_ms ~0.05ms (budget 50ms), 60fps interp O(v).
- UI: shell 8/8 + battle 4/4 Playwright Chromium PASS on same code (no battle/shell changes since); /leaderboard + /battle 200 live.
