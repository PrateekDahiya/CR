# ISSUES_phase-11-exact-ui - Review (main-agent, subagents deprecated)

> Branch `feature/phase-11-exact-ui`. MEMORY#18 + #22 + #23 enforced.

## Verdict: PASS (0 blocker, 1 minor fixed, 1 minor accepted, 9 PASS)

- **ISS-UI11-001 (minor) `app/page.tsx` import depth** - new code used `../../components/ui` but `frontend/app/page.tsx` needs `../components/ui` (one level up, not two). Fixed. `npm run build` PASS.
- **ISS-UI11-002 (minor) `BottomNav` "shop" not in key union** - added 6th tab to match exact-CR bottom bar. Fixed: key union widened. `npm run build` PASS.
- **ISS-UI11-003 (accepted) `DeckBuilder` Set iteration** - pre-existing `downlevelIteration` issue. Quick fix: `Array.from(new Set(valid))`. Acceptable, only touched this line.

## PASS (9)
- 6 shared components (TopBar/CardArt/CardFrame/BottomNav/CRButton/PageShell) - Tailwind-only, all testids, no new deps, gold/blue 3D, rarity glow.
- `crTheme.ts` tokens (rarity colors, diamond-plate bg, elixir purple).
- 4 new routes: `/decks` (tabbed grid 6/7/8/9/10), `/collection` (108 cards w/ rarity+cost filters), `/shop` (Daily Deals + Trader), `/social` (Leaderboard + Clan tabs).
- Home page refactored: top bar, playing-deck preview, gold BATTLE button, 1v1/AI variants, Game Modes (Trophy/Ranked/Merge/Casual), 6-tab bottom nav.
- MySQL `card_catalog` (108 facts, 12 playable) + `infra/mysql/seed_catalog.py` + `/content/catalog` endpoint live.
- Playwright Chromium 11/11 PASS (shell 7 + battle 4) on next dev. Screenshots captured 6 routes x 2 viewports.
- Backend `npm test` 39/39 PASS (engine 16 + validation 17 + content 6 + meta 2 + auth 1).
- No CRclone touch, previews :3000/:4000/:8000 intact, only :4000/frontend restarted (MEMORY#19).
- `git check-ignore docs/gameUI/ frontend/public/cards/` PASS - reference art + user art never committed.
