# ISSUES_phase-6-ai - Review (main-agent, subagents deprecated)

> Branch `feature/phase-6-ai-service`. Reviewer: main agent (subagent infra returned `Model muse-spark-1.3-contributor-free has been deprecated` for PROMPT-045..047, so coders' outputs were reviewed directly).

## Verdict: pass-with-issues (0 blocker, 1 major, 3 minor) - all fixed in-branch except 1 deferred

### Fixed
- **ISS-AI6-001 (major) `bot.py: Mapping not imported`** - `from __future__ import annotations` masked it; runtime `NameError` on first call. Fixed: `from collections.abc import Mapping`. Verified `choose_move` returns legal move.
- **ISS-AI6-002 (major, now minor) `main.py _call_brain` missing canonical signature** - attempts list lacked `choose_move(state, hand, elixir, difficulty)` (bot.py actual). Fixed: canonical first + kwargs variant. Verified medium greedy `musketeer handIndex 1 took_ms 0.05`.
- **ISS-AI6-003 (minor) `bot.py hand` only accepted `list[str]`** - server passes dicts `{card,handIndex,cost}`, old code dropped to `""` -> fallback knight. Fixed: accept Mapping entries, preserve caller handIndex. Verified dict hand returns `giant handIndex 0`.
- **ISS-AI6-004 (minor) `_scan_enemies` hardcoded red half** - `uy >= RIVER_BOTTOM-3` wrong for blue bot. Fixed: `_on_bot_half(uy, bot)` + `bot` param. Verified blue/blue symmetry by code read.
- **ISS-AI6-005 (minor) `/balance/cards` returned 5 stub cards** - getter list missed `card_stats` + `default_store`. Fixed: added both. Verified live 8100 returns 12 cards.

### Deferred
- **ISS-AI6-006 (minor) Pydantic `class Config` deprecated** - `test_main` warns `PydanticDeprecatedSince20`. Defer to Phase 8 (switch to `ConfigDict`), no behavior impact.

## PASS (10)
- bot easy/medium/hard legal + in-bounds + handIndex in range + <50ms (bot self-check asserts).
- 12 CARDS mirror GAME_DESIGN §1 + backend CARDS (cost/hp/dps).
- analytics ring-buffer eviction accounting exact (cached == recompute).
- outlier band 0.45-0.55 min 30 games per spec.
- pytest 12/12 green (7 main + 5 analytics).
- live 8100: health, bot/move easy/med/hard/invalid->medium, substitution, balance 12.
- No CRclone touch, no preview :3000/:4000 kill, ephemeral 8100 only.
- MEMORY#20 Big-O docstrings present in bot/analytics/main.
- MEMORY#16: subagent files left alone (none created by failed tasks); main edited only ai-service/*.
- MEMORY#17: live matrix logged in TEST_REPORT_phase-6-ai.md.
