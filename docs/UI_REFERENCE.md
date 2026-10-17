# UI_REFERENCE - Exact Clash Royale Look (Source of Truth for Frontend)

> Per MEMORY#18 (user 2026-10-17: "exact ui as real clash royale, pick screenshot from web"). All frontend must match this pixel-close with ORIGINAL code only (no ripped Supercell assets). Inspired by, not copied.

## 1. Reference screenshots (open FIRST before coding)
1. Wikipedia 1v1 + 2v2 battle: https://en.wikipedia.org/wiki/Clash_Royale - portrait arena, towers, elixir bar, 4-card hand, timer 3:00, crowns.
2. Official: https://supercell.com/en/games/clashroyale/ - arena green/checker, gold/blue buttons, card rarity colors (common grey / rare orange / epic purple / legendary rainbow).
3. Arenas: https://clashroyale.fandom.com/wiki/Arenas - river/bridges, tower positions, Goblin Stadium → Legendary Arena variants (we implement base grass + river).
4. Elixir: https://clashroyale.fandom.com/wiki/Elixir - purple bar bottom, 10 pips, number left, fills 1/2.8s (1/1.4s double), shakes when full, 5 start cap 10.
5. 2026 update: https://royaleapi.com/blog/2026-q2-update-may-2026-preview-2?lang=en - event banners, social tab (ignore for Phase 5, note for Phase 7).

## 2. Global layout (portrait-first, 390x844 mobile + 1280x720 desktop centered column max-w-[420px])
- Background: sky-blue gradient top → grass arena center → dark brown bottom dock. Rounded arena with wooden border.
- Font: bold cartoon (use system `font-extrabold` + yellow stroke via CSS `text-shadow`). Buttons: gold gradient, blue gradient (primary), red (leave), rounded-xl, border-b-4 darker shade for 3D.
- Top bar (h-12): enemy name + trophies 🏆 left, timer ⏱️ center (3:00 → overtime ⚡), player right, emote 💬 button, mute 🔊.

## 3. Arena (Canvas 18x32 tiles, portrait, 60fps)
- Tiles: grass alternating #7ec850 / #8fd45a checker, river y15-16 blue #4aa3ff with banks, 2 bridges x3-4 / x13-14 brown planks.
- Deploy zones: own half highlight blue tint on card select; enemy half red tint on hover invalid; pocket 4 tiles dotted line; river red X for invalid.
- Towers: Princess 🏰 1400HP (left x2.5 / right x15.5, y5 red top / y26 blue bottom), King 👑 2400HP center (y3.5 / y28). HP bar above (blue/red fill, white text), crown 👑 popup on destroy, explosion particles (CSS/Canvas circles), king activation eyes open.
- Units: circles with emoji (Knight ⚔️, Archers 🏹, Giant 🗿, Skeletons 💀, Musketeer 🔫, Baby Dragon 🐲, Mini P.E.K.K.A 🔪, Cannon 🏯) + HP bar + team ring (blue/red), walk bob, hit flash, death poof. Spells: Fireball 🔥 expanding ring, Arrows ➶ rain lines, Zap ⚡ flash.
- Damage numbers: floating white/yellow text, -HP on hit.

## 4. Bottom dock (exact CR)
- Elixir bar: full-width purple #c93cff → #8a2be2 gradient, 10 diamond pips, number left (e.g. `7`), fill animates per tick, shake + glow when 10.
- Card hand: 4 slots (rounded, rarity border: grey/orange/purple/rainbow), cost badge top-left purple circle, art emoji center, name bottom, greyed + cost red when insufficient, selected gold glow, Next card mini preview left of hand with `Next:` label.
- Tap-to-deploy: tap card (select) → tap arena (deploy via `card:play {handIndex,x,y}`); invalid (red shake + error sound stub). Desktop: click same.

## 5. Overlays
- Match start: `Battle!` banner + vs names. End: `Victory!` / `Defeat!` / `Draw` with crowns ⭐⭐⭐, towers destroyed, elixir leaked (spectator number right of bar per wiki), buttons Play Again / Deck / Menu.
- Queue: searching spinner with cancel. Disconnect: reconnecting banner + `match:sync`.

## 6. Menu/Lobby/Deck reskin (Phase 5 must retrofit Phase 4 shell)
- Menu: CR blue sky + arena thumbnail, big gold `BATTLE` button, Deck / Shop(skeleton) / Clan(skeleton) row, trophies + gold + gems top bar.
- Lobby: vs card with player/opponent, deck preview 8 mini cards, gold Join Queue, red Leave.
- Deck: 8 slots grid with rarity borders, avg elixir ⚡, valid green check / invalid red, Starter/Clear, tap to swap from collection row (12 cards).

## 7. Implementation rules (original code only)
- Canvas 2D only (no image assets): draw tiles/towers/units with rects/circles/emoji text. Colors from §3-4 hexes above.
- Tailwind for chrome (bars/buttons/overlays), Canvas for arena. 60fps `requestAnimationFrame` interp between 10Hz `state:update` (lerp positions, serverTimeMs clock).
- SFX via WebAudio oscillator stub (deploy pop, hit thud, win fanfare arpeggio); mute toggle persisted.
- Responsive: Canvas scales to column width, touch + mouse both; 390x844 primary, 1280x720 centered.
- Do NOT commit any downloaded PNG/MP3; placeholders only. Note in PR: "recreated UI, no Supercell assets".

## 8. Verification (MEMORY#17 + #18)
- Playwright Chromium must screenshot `/`, `/deck`, `/lobby`, `/battle` at 390x844 + 1280x720 to `docs/screenshots/phase-5-*.png` and compare checklist: portrait arena, river/bridges, 3+3 towers HP bars, timer, elixir 10 pips, 4-card hand + Next, deploy works, win overlay crowns.
- Reviewers file ISS-UI-*** for deviations (color, pips, landscape, missing bars).
