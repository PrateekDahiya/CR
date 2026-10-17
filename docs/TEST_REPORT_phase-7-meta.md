# TEST_REPORT_phase-7-meta - unit + live (main-agent)

> Branch `feature/phase-7-persistence`. MEMORY#17 live + #20 perf.

## Unit
- `npx tsc --noEmit` backend: PASS clean. frontend: only pre-existing DeckBuilder TS2802 (untouched, deferred).
- `npm test` backend: **35/35 PASS** (33 Phase 3 + 2 meta suites: auth round-trip, upsert+deck+leaderboard+report).

## Live (:4000 restarted from branch)
| # | Case | Result |
|---|------|--------|
| 1 | GET /health ok:true | PASS |
| 2 | POST /auth/guest alice -> token YWxpY2U, trophies 0, db false | PASS |
| 3 | GET /profile/alice -> 0/0/0/0 season s1 | PASS |
| 4 | GET /leaderboard?limit=5 -> 1 entry alice | PASS |
| 5 | POST /deck 8 cards -> active row | PASS |
| 6 | POST /matches/report blue win 3-1 -> row s1 | PASS |
| 7 | GET /season -> s1 Goblin Stadium | PASS |

## Perf
- upsert/get/save/record O(1), leaderboard O(n log n) read n tiny, token O(1). No per-request allocs beyond rows.

## Verdict: PASS 35/35 + 7/7 live
