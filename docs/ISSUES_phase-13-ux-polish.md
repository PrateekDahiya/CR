# ISSUES_phase-13-ux-polish - Review (main-agent, no subagents)

> Branch `feature/phase-13-ux-polish`. MEMORY#24 enforced. Built per user feedback 2026-10-17.

## Verdict: pass (0 blocker, 0 major, 1 minor accepted)

- **ISS-UX13-001 (accepted) Real pvp opponents are not spawned** - in single-instance dev there is no real opponent; the loader auto-pairs to a local matchId after 4s. Documented: cancel button available. Real matchmaking will work when a second socket connects (backend `tryMatch` is in place since Phase 3). Acceptable for Phase 13.
- All other items resolved: card info overlay matches the reference (screenshot 12), Decks tab is clickable with overlay + swap, BATTLE button skips lobby and goes to matchmaking loader, Home tab redesigned per `03-home-battle-tab.png`.

## PASS (12)
- 4 new components: `CardInfoOverlay` (rarity/type/elixir chips, animated preview, Star Level/Upgrade/Use buttons), `MatchmakingLoader` (spinner, seconds counter, Cancel), `getSocketClient` wrapper for `getSocket().joinQueue/leaveQueue/onMatched/onGameError`, deck-edit flow on `/decks` (8 button slots, click to view, use to swap, "In Deck" state when already present).
- Home tab redesigned: profile chip, status dot, Battle Pass banner, battle preview tile, BIG gold BATTLE button, Playing Deck row (8 small cards, click to info), Game Modes sheet (Trophy Road/Casual/Path of Legends/Trophy Rush), Play vs AI + Quick 1v1.
- BATTLE button on `/decks` and home now goes directly to matchmaking loader (no lobby form).
- Decks tab card click → opens CardInfoOverlay. `Use` button swaps that card into the clicked slot (or moves it from the other slot if already in deck).
- Decks tab no longer shows per-card name labels under cards (just the art + cost + level, per user).
- MatchmakingLoader auto-pairs to a local match after 4s for pvp / 1.5s for ai, then redirects to `/battle?matchId=...`. Cancel button leaves the queue and routes to `/decks`.
- `socket.ts` adds `getSocketClient(url)` returning a stable `SocketClient` wrapper (joins/leave/selectDeck/onMatched/onGameError).
- Playwright Chromium **11/11 PASS** in 4.2s; collection test still asserts 100+ real-art images load.
- 7 new screenshots in `docs/screenshots/phase-13-{home,decks,deck-card-info,collection,shop,social,matchmaking}.png`.
- `npx tsc --noEmit` clean. Previews :3000/:4000/:8000 alive (only :4000 + :3000 restarted per MEMORY#19).
