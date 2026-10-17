# TEST_REPORT_phase-12-real-art - unit + live (main-agent)

> Branch `feature/phase-12-real-art`. MEMORY#18 + #23 enforced. 124/124 real card art from deckshop.pro loaded on /collection.

## Unit
- `cd backend; npm test` -> **39/39 PASS** (unchanged).
- `cd frontend; npm run build` -> clean, 12 routes.
- `cd frontend; npx playwright test --project=chromium` -> **11/11 PASS** in 3.8s.

## Live (Playwright Chromium, screenshots saved)
| # | Case | Result |
|---|------|--------|
| 1 | /collection lists 108 cards | PASS (Found: 108/12) |
| 2 | /collection has all 108 images loaded (naturalWidth > 0) | PASS (108/108) |
| 3 | /decks shows 8 playable cards with art | PASS (8/8) |
| 4 | /home -> top bar + 6-tab bottom nav + BATTLE | PASS |
| 5 | /shop -> Daily Deals + Trader | PASS |
| 6 | /social -> Leaderboard + Clan tabs | PASS |
| 7 | /battle -> canvas + elixir + 4-card hand + timer | PASS |
| 8 | /lobby -> player input | PASS |
| 9 | /deck -> 8 slots | PASS |
| 10 | Tower troops render (cannoneer/dagger-duchess/royal-chef/tower-princess) | PASS (350x496 each) |
| 11 | Screenshots mobile + desktop | 3 phase-12 PNGs in docs/screenshots/ |

## Card Art
- 124 PNG files in `frontend/public/cards/` (gitignored, 120 from /img/c/ + 4 from /img/tower-troop/).
- All kebab-case slugs match `card_catalog` rows.
- Natural sizes: tower troops 350x496, regular cards 97x120.
- Lazy local-fallback (rune + emoji) dimmed to 12% opacity when real art loads.

## Verdict: PASS 39/39 unit + 11/11 live + 124/124 art
