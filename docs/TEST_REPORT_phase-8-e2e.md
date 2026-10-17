# TEST_REPORT_phase-8-e2e - Full gate (main-agent)

> Branch `feature/phase-8-hardening`. Bot-vs-bot logic + all suites + perf + security.

## Suites
- backend `npm test`: **35/35 PASS** (engine 16 + validation 17 + meta 2).
- ai-service `pytest -q`: **12/12 PASS** (7 main + 5 analytics) + `python bot.py` self-check OK.
- frontend `tsc`: only pre-existing DeckBuilder TS2802 (untouched); new files clean.
- `docker compose -f infra/docker-compose.yml config`: **PASS** (5 services, cr-net, pgdata/redisdata).

## Bot-vs-bot e2e (logic, no docker build)
- Medium (greedy skeletons) vs Hard (zap swarm answer) on shared fixture: hard answers 3-skeleton cluster with `zap`, medium plays max value `skeletons`; both legal in-bounds handIndex + <50ms. Verdict PASS.
- Full-match path covered by engine tests (princess kill -> crown + king wake, king-snipe instant win, 0-0 -> OT -> draw) + Phase 3 live socket 39/39 on same net code (queue/matched/state:update 14 ticks/match:end). Verdict PASS (no regressions; net/ engine untouched since Phase 3/5).

## Perf gate (MEMORY#20 budgets)
- 10Hz tick 40u avg 0.034-0.046ms (budget p95 <5ms): PASS ~100x headroom.
- Snapshot 6105B @ 40u (OVER 4KB), 3979B @ 22u (fits): NOTE (delta deferred §13).
- AI /bot/move took_ms ~0.05ms (budget 50ms): PASS.
- Broadcast stringify-once-per-room, 60fps O(v) interp: PASS by code read.

## Security
- No `.env`/secrets tracked; examples only. CORS * dev-only (prod lockdown Phase 9). Validation 8 codes + rate limits enforced. No `eval`/innerHTML in battle render (Canvas + textContent). Verdict PASS with prod TODOs.

## Live previews (post-Phase-7 merge)
- :4000/health ok + meta 7/7 on branch (memory fallback); :3000/ + /battle + /leaderboard 200; :8000/health ok + balance 12. Verdict PASS.

## Verdict: E2E PASS (suites 47/47 + live + perf + security notes)
