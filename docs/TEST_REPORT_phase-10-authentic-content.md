# TEST_REPORT_phase-10-authentic-content - unit + live MySQL (main-agent)

> Branch `feature/phase-10-authentic-content`. MEMORY#17 live + #20 perf + #22 authentic content.

## Unit
- `npx tsc --noEmit` backend: PASS clean (after ISS-C10-001 bracket fix).
- `npm test` backend: **38/38 PASS** (35 Phase 7 + 3 content: 12-card roster, 12 sprite metadata, 7 menus).

## Live MySQL (Aiven `cr`, MySQL 8.4.8, SSL)
| # | Case | Result |
|---|------|--------|
| 1 | `SELECT VERSION()` 8.4.8, `SHOW TABLES` empty pre-schema | PASS |
| 2 | schema.sql 6 tables created (cards/sprites/menus/users/decks/matches) | PASS |
| 3 | seed.py SEED_OK cards=12 sprites=12 menus=7 | PASS |
| 4 | SELECT cards ORDER BY elixir: 12 rows, stats match GAME_DESIGN §1 | PASS |
| 5 | SELECT menus: 7 rows Battle/Deck/Clan/Shop/Leaderboard/Profile/Lobby | PASS |
| 6 | Restart preview :4000 with DB_* env (mysql2 installed) | PASS |
| 7 | GET /content/status -> configured:true live:true store:mysql | PASS |
| 8 | GET /content/cards -> source:mysql count:12 (skeletons..rock-golem) | PASS |
| 9 | GET /content/menus -> source:mysql 7 labels/routes | PASS |
| 10 | GET /content/sprites -> source:mysql count:12 note metadata-only | PASS |
| 11 | `git check-ignore infra/.env` ignored + `git ls-files` no .env/png/mp3 | PASS |

## Perf
- Content reads O(c)/O(m) single SELECTs; pool singleton O(1); live /content/cards p50 <100ms intra-region. No hot-path impact (content endpoints off tick loop).

## Verdict: PASS 38/38 + 11/11 live
- Sprites stored as metadata only (no binaries) per MEMORY#22; card/menu naming matches CR structure with original art.
