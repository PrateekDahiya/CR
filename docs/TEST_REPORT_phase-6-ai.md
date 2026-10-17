# TEST_REPORT_phase-6-ai - pytest + live (main-agent)

> Branch `feature/phase-6-ai-service`. MEMORY#17 live + #20 perf budgets. Ephemeral port 8100, preview :3000/:4000 untouched.

## Env
- Python 3.12.10, fastapi + uvicorn[standard] + pytest + httpx (installed), Playwright N/A (no UI in Phase 6).
- `pytest ai-service/test_main.py ai-service/test_analytics.py -q` -> **12 passed** (7 main: health, easy, medium, hard+invalid, substitution, balance shape, latency budget; 5 analytics: math, zeros, outliers, eviction, pick_rate sum).

## Live matrix (http://127.0.0.1:8100, restarted after balance fix)
| # | Case | Result |
|---|------|--------|
| 1 | GET /health -> {ok:true, service:ai} | PASS |
| 2 | POST /bot/move easy hand 3 elixir 8 -> handIndex 0-3, x/y in bounds, took_ms <50 | PASS (0.05ms) |
| 3 | POST /bot/move medium greedy -> musketeer handIndex 1 (best DPS/elixir) | PASS |
| 4 | POST /bot/move hard swarm (2 skeletons) -> zap centroid | PASS (bot self-check) |
| 5 | POST /bot/move invalid difficulty BOGUS -> medium 200 (never 422) | PASS |
| 6 | POST /bot/move no-hand dict brain hint -> handIndex 0-3 clamped | PASS |
| 7 | POST /bot/move substitution (knight-only hand, brain giant) -> handIndex 0 substituted true/false legal | PASS |
| 8 | GET /balance/cards -> 12 cards (was 5 stub, fixed via default_store) | PASS |
| 9 | Latency: 20x hard avg <50ms | PASS (avg ~0.06ms) |

## Perf (MEMORY#20)
- Brain O(h+t+u) single-pass, zero per-call allocs beyond result (easy <=4 list). Measured took_ms 0.05ms (p95 budget 50ms, ~1000x headroom).
- Analytics insert O(k) k<=8, aggregate O(n+c) / cached O(c) c=12, space O(n)+O(c) n<=10000.
- Endpoints O(1) overhead + brain/aggregate.

## Verdict: PASS 12/12 unit + 9/9 live
- Cleanup: ephemeral 8100 to be killed at merge; preview :3000/:4000 intact (verified separately).
