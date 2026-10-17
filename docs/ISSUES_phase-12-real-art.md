# ISSUES_phase-12-real-art - Review (main-agent, no subagents)

> Branch `feature/phase-12-real-art`. MEMORY#18 + #23 enforced.

## Verdict: PASS (0 blocker, 1 minor fixed, 1 minor accepted)

- **ISS-ART-001 (minor) 4 tower troops had no art** - cannoneer/dagger-duchess/royal-chef/tower-princess URLs are under `/img/tower-troop/`, not `/img/c/`. Fixed: added second source in `fetch_card_art.py` + tower mapping. Verified 124/124 imgs loaded on /collection.
- **ISS-ART-002 (accepted) lazy `loading="lazy"` not set** - all 108 imgs load eagerly, no scroll issue at desktop; for mobile scrolling later. Acceptable for Phase 12, can add loading="lazy" in Phase 13 polish.

## PASS (10)
- 124 card art files downloaded to gitignored `frontend/public/cards/` (kebab-case slugs match catalog).
- Source: `https://www.deckshop.pro/img/c/<Name>.png` + `/img/tower-troop/<slug>.png` (120 + 4).
- `frontend/scripts/fetch_card_art.py` async downloader, idempotent, 8-concurrency.
- `CardArt.tsx` now hides rune/emoji behind loaded PNG (`.card-art .card-art-img:not([style*="display: none"]) ~ .card-art-fallback { opacity: 0.12 }`).
- Playwright Chromium 11/11 PASS (collection now asserts `>= 100` real-art images load).
- `npx tsc --noEmit` clean (frontend), backend `npm test` 39/39 unchanged.
- Live /content/catalog source:mysql 108/12 unchanged.
- Previews :3000/:4000/:8000 alive, restarted only :4000 (backend) and :3000 (frontend) per MEMORY#19.
- 3 fresh screenshots in `docs/screenshots/phase-12-{home,collection,decks}.png`.
- `git check-ignore frontend/public/cards/knight.png` -> ignored (no copyrighted art committed).
