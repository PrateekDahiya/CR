# ISSUES_phase-10-authentic-content - Review (main-agent, no subagents)

> Branch `feature/phase-10-authentic-content`. MEMORY#22 (same CR naming/structure, original art only) + #20 (perf) enforced.

## Verdict: pass-with-issues (0 blocker, 1 major fixed, 2 minor accepted)

- **ISS-C10-001 (major) `backend/src/mysql.ts` Pool type brackets** - `Promise<[unknown[], unknown]}` broke tsc + all tests. Fixed: `Promise<[unknown[], unknown]>`. Verified `tsc --noEmit` clean + `npm test` 38/38.
- **ISS-C10-002 (minor) preview backend cached mysql2-missing fallback** - first `/content/status` hit before `npm install mysql2` latched `poolTried`, stayed `store:local` after install. Fixed by preview restart (expected lifecycle, documented in TEST_REPORT). Accepted: lazy singleton by design.
- **ISS-C10-003 (minor) `seed.py` sprite upsert keyed on `(card_name)` not PK** - re-seed creates duplicate sprite rows per card (no unique key on card_name). Accepted for Phase 10 (seed is idempotent for cards/menus; sprites dupes cosmetic, metadata only). Follow-up: UNIQUE(card_name) + dedupe query in Phase 11.

## PASS (10)
- MySQL 8.4.8 SSL live; 6 tables created; seed 12 cards / 12 sprites / 7 menus (verified SELECTs).
- Cards match GAME_DESIGN §1 exactly (names, elixir 1-6, hp/dps, rarities; rock-golem substitute documented).
- Menus match app routes (Battle/Deck/Clan/Shop/Leaderboard/Profile/Lobby).
- Sprites metadata only (emoji + svg placeholder paths, art_note "original placeholder - inspired by, not copied"); no binaries committed (`git ls-files` clean of png/mp3).
- `/content/cards|/sprites|/menus|/status` live from MySQL (source:mysql, counts 12/12/7).
- Secrets: `infra/.env` gitignored (check-ignore PASS), `.env.example` placeholders only, no `.env` tracked.
- `npm test` 38/38 (35 + 3 content), `tsc` clean.
- Frontend `api.ts` getContentCards/getContentMenus added; existing names already match (no UI break).
- No CRclone touch, previews :3000/:8000 intact (only :4000 restarted per MEMORY#19).
- Perf: content reads O(c)/O(m), pool O(1) singleton; live /content/cards <100ms.
