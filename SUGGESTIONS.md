# SUGGESTIONS - Parking Lot (Do Not Implement Immediately)

> Rule from MEMORY.md #6: whenever user provides any suggestion mid-stream, append here with date + status, and implement only when working on related features.
> Format: `## YYYY-MM-DD - <title>` + `Status: pending|scheduled:<phase>|implemented` + `Source: user verbatim` + `Notes`.

## Pending

### 2026-10-21 - Real movement and attack animations for all 108 cards
Status: pending (next session - the handover prompt is in `docs/card-art/NEXT_SESSION_PROMPT.md`)
Source: "i want to make the cards movement and attack animation even better can
you find a free website from where we can pick sprites and use them or a free
ai image generator which can help us? provide me prompt to provide in new
session to continue this"
Notes: The next session replaces the warped single-render strips with real
animation: one **4x5 sprite sheet per card** (row 1 red walk front, row 2 red
attack front, row 3 blue walk back, row 4 blue attack back, 96x96 cells). The
user's image prompt (wizard, red fire / blue ice, strict front/back views) is
the template - see `docs/card-art/NEXT_SESSION_PROMPT.md`, which also carries
the worktree instructions (work in `D:\Documents\Projects\CR\.worktrees\
card-mechanics` on the branch `card-mechanics`, because the preview servers
run from there; merge into `main` with `--no-ff` from the main worktree).
Sources researched and documented in `docs/card-art/SOURCES_AND_TOOLS.md`:
free sprite packs (Quaternius/Kenney/a_klingon CC0, OpenGameArt CC0, Pixel
Frog, KayKit), 3D -> sheet renderers (Pixor, Blender Sprite Sheet Generator,
Mixamo), still -> sheet tools (Ludo.ai, Spritesheets.ai, GenioPlus) and the
free AI generators (local ComfyUI/Krita AI Diffusion = the only unlimited,
private, scriptable and licence-clean option; Pollinations for a free
scripted API; Gemini Nano Banana / Ideogram for the best character
consistency). Licence traps recorded: Recraft, Freepik, Leonardo, Playground,
Tensor.Art and Mage.Space are NOT safe for shipped art on their free tiers,
and the wiki card renders remain the one legal risk in the repo.
Planned format: `frontend/public/sprites/<card>-<view>.png` becomes 10 frames
(5 walk + 5 attack), sliced by a new `scripts/make_card_sprites_from_sheet.py`
from `docs/card-art/sheets/<card>.png`, with the current 8-frame strips kept
as the fallback.

### 2026-10-21 - Battle log polish (battles/tournaments tabs, Practice/Watch, deck rows)
Status: implemented
Source: "the remaining battle-log polish (battles/tournaments tabs, Practice/Watch
buttons, deck rows per battle like the Clash Royale reference screenshot)"
Notes: The Battle Log sheet now follows the Clash Royale reference layout:
- **BATTLES / TOURNAMENTS tabs** under the header. The battles tab shows one
  card per battle: result banner (`VICTORY`/`DEFEAT`/`DRAW`), the crown score
  (`👑 3 - 0 👑`), my name + trophies on the left, the crossed swords in the
  middle, the opponent name + trophies on the right, **the deck of BOTH
  sides** (2 rows of 4 card tiles each, my deck with the per-team FRONT art,
  the opponent's with the BACK art) and a footer with the trophy delta, the
  time ago and the **PRACTICE** + **WATCH** buttons.
- **PRACTICE** starts a real practice match against the AI with the deck the
  opponent actually played (`/battle?foeDeck=...` -> `match:practice` accepts
  the opponent deck).
- **WATCH** opens the new `/replay?matchId=...` viewer: the server samples the
  authoritative match state every 400 ms (`backend/src/replays.ts`) and the
  client plays the frames back on the real arena canvas (scrubber, play/pause,
  1x/2x/4x). The button is greyed out when the replay expired.
- **TOURNAMENTS tab**: create a tournament, join one, press PLAY. The server
  pairs the two ready players into a real authoritative match
  (`tournament:ready` -> `tournament:match`), the result is written back into
  the bracket (single elimination, champion) and into the battle log, where it
  shows up in the TOURNAMENTS tab with both decks.
- Backend: `backend/src/tournaments.ts` (registry + MySQL `tournament` table,
  O(p) per case, p <= 8), `backend/src/replays.ts` (bounded replay store),
  `GET /tournaments`, `GET /tournaments/:id`, `POST /tournaments`,
  `POST /tournaments/:id/join`, `GET /replay/:matchId`; the battle-log payload
  now carries `playerName`, `tournamentId`, `tournamentName`, `watchable` and
  always the deck of BOTH players.
- Verification: `docs/screenshots/battle-log-battles-tab.png`,
  `battle-log-tournaments-tab.png`, `battle-log-watch-replay.png`;
  `frontend/tests/battle-log.spec.ts` (5 tests) + `frontend/tests/tournament.spec.ts`
  (create/join/play + the result in the TOURNAMENTS tab), backend
  `tests/tournaments.test.ts` + `tests/replays.test.ts` (168 backend tests),
  frontend + backend `tsc`, the full 107-test Playwright suite and `next build`
  all pass.

### 2026-10-20 - Princess/side tower art like the king towers
Status: implemented (see notes for the part that still needs the artist)
Source: "i think you should find similar images for side towers that you got for king towers it is much better"
Notes: The side towers now use the real Princess Tower art (blue/red variants of
the wiki art) instead of drawn stone plates, drawn bottom-aligned in the 3x3
footprint with the source aspect ratio preserved. Every crown-tower troop
(cannoneer / dagger duchess / royal chef) gets its own picture, so no icon
badge floats above the tower any more. The wiki has no per-troop side-tower
renders, so the per-troop variants are composites for now: the full source set
plus a contact sheet live in `docs/tower-art/`, and
`docs/tower-art/README.md` lists the exact files to drop into
`frontend/public/towers/` when the art is edited by hand.

### 2026-10-20 - Fix blue King Tower active orientation
Status: implemented
Source: "the active image of blue king is wrong make it inverted as it is facing wrong side"
Notes: The blue King Tower now uses the authentic wiki "King Tower Blue" art -
the player's own tower is seen from BEHIND in Clash Royale, so the blue tower
shows the back of the king while the red tower shows his face. The blue side
towers are the mirrored blue variants of the red art for the same reason.
(Rotating the recoloured red art 180 degrees was tried and looked wrong.)

### 2026-10-20 - Blue king art in Deck -> Towers tab
Status: implemented
Source: "also update the king tower image in deck->towers tab with blue king"
Notes: The King Tower row in Decks > Towers now renders
`/towers/king-blue-active.png` instead of the crown glyph.

### 2026-10-20 - Better card movement / walk animation
Status: implemented (folded into the card asset task below)
Source: "make the game cards movement , movement animation better search web for better animations add to suggestions"
Notes: Folded into the per-team card asset task: the strips are now cut from
the real wiki character renders (instead of the small card tiles) and the walk
is a 4 frame cycle (was 2), so the movement is smooth enough to read at arena
size. See the card asset task below.

### 2026-10-20 - Card assets for both teams (front + back views, with movement)
Status: implemented
Source: "i want to start a new session and make it continue with the pending
task in suggestions and updade the task inside suggestion to search for each
card asset online front-view and back-view both for red side and blue side
respectively with moving animation for both red and blue just like we did for
towers"
Notes: Done for all 108 catalogue cards:
- `scripts/fetch_card_art.py` downloads the online sources from the Clash
  Royale wiki (the high resolution character render of every card plus the
  in-game `Preview.gif` clip of 59 cards) into `docs/card-art/sources/`,
  writes `docs/card-art/sources.json` and builds two contact sheets.
- `scripts/make_card_art.py` builds the two team views into
  `frontend/public/cardart/<card>-front.png` (red, character seen from the
  front) and `<card>-back.png` (blue, seen from behind). The wiki publishes no
  back view for troops, so the blue view is derived like the princess tower
  was: mirrored + the red team hue rotated to the blue team hue.
- `scripts/make_card_sprites.py` cuts a real 8 frame 2D strip per card AND
  per view (idle, idle, walk x4, attack, death) into
  `frontend/public/sprites/<card>-<view>.png`. The walk is a smooth per-row
  warp of the artwork (the legs swing, the torso stays), so the art is never
  torn apart.
- `frontend/lib/battle/spriteAnim.ts` loads the strip of the unit's team
  (red -> front, blue -> back) and flips it with the unit's facing.
  `frontend/components/battle/ArenaCanvas.tsx` passes the team and uses the
  per-team static art as the fallback. The fallback chain is
  team strip -> old neutral strip -> `/cardart/<card>-<view>.png` ->
  `/cards/<card>.png` -> emoji glyph, so a missing asset never breaks a match.
- `/animations` now shows every card with the red front view on the top row
  and the blue back view below it.
- `docs/card-art/README.md` lists the files that still need hand editing (13
  cards whose blue view is a recoloured mirror, 5 cards whose source is a
  card tile instead of a render, and the 19 spells), and
  `scripts/prepare_edited_card_art.py` installs hand edited art.
Verification: `docs/screenshots/card-art-arena.png`,
`card-art-red-side.png`, `card-art-blue-side.png`,
`card-art-same-card.png` and `card-art-animations.png`;
`frontend/tests/card-art.spec.ts` (3 tests) plus the existing suite, `tsc`
for frontend and backend, the backend tests and `next build` all pass.

### 2026-10-20 - Verify the elixir pump + elixir-gain animation
Status: implemented
Source: "check if exilier pump is working correctly is it increasing the exiler as it should , if yes skip else fix it also add animation when the exlier is getting add"
Notes: There is no "elixir pump" card in this catalogue; the elixir-granting
cards are the Elixir Collector (pumps 1 elixir to its owner every 13s) and the
Elixir Golem chain (pays the opponent on death). Both were verified against
the engine and are correct, so no fix was needed. The missing feedback was
added: the client detects a discrete gain (snapshot elixir minus the expected
passive regen) and shows a floating "+N" on the elixir bar.

### 2026-10-20 - Battle Log from the top bar
Status: implemented
Source: "add a battle log just like this , add button for it inside the toaster in topbar"
Notes: New top-bar icon opens a Battle Log sheet (Battles list): result banner,
crown score, both decks, trophy delta, mode and time ago, with a Practice
button. Backed by the new per-player battle history
(`backend/src/battleLog.ts`, `GET /battle-log/:playerId`, `battle_log` table).
The coin/gem top-bar icons were redrawn as inline SVG because the emoji
glyphs rendered broken.

## Scheduled

### 2026-10-20 - Add 2x Elixir and Takedown modes
Status: implemented
Source: "new game modes- > 1. 2x elixer, 2. takedown mode -> taking one tower wins the game just like overtime but from starting uses same timings as normal game 1x -> 2x -> 3x (in overtime)"
Notes: Both are registry entries in `backend/src/game/modes.ts`: 2x Elixir uses a
fixed 2x rate for the whole match; Takedown uses the normal elixir timings and
ends the match on the first tower destroyed.

### 2026-10-20 - Start elixir 8 for every mode
Status: implemented
Source: "make start elixir for all gamemodes as 8"
Notes: Overrides the earlier Infinite Elixir start-at-10 request: every mode
registry entry now starts at 8 elixir.

## Implemented

### 2026-10-20 - Remove the red circular unit container
Status: implemented (local worktree; commit not requested)
Source: "the troops and building are inside this red circular div, i don't like that , can we make it better?"
Notes: Removed the hard red/blue team ring and body disc from deployed units and
buildings. The strip frames now bake in a soft feathered vignette so the art
blends into the arena; team identity comes from a low-alpha ground glow, the
team-coloured HP bar, and the level badge. Hit flashes are drawn as a temporary
white overlay. The static-art fallback keeps a circular clip so it never shows
a square. Verification: battle screenshots reviewed, `/animations` refreshed,
8 targeted Playwright tests and `next build` pass.

### 2026-10-20 - Full battle sprite animations (all 6 phases)
Status: implemented (local worktree; commit not requested)
Source: "add animations for cards in game, get 2d strips from web and make
building, cards, placable moving toward troops, attacking, spell animations,
spell effects, everything. building must be placable we can see them attacking
(bullets, fireballs, arrows, etc) and this to suggestions, divide it into
phases do one by one"
Notes: Implemented all phases at once per follow-up request:
- Phase 1: generated a 6-frame strip for every card (`idle`, `walk`, `attack`,
  `death`), lazy strip loader with static-art fallback, deploy pop/ring, facing.
- Phase 2: server now exposes `targetId`; troops lunge, slash, fire, show hit
  flashes, death ghosts, and spawn animations.
- Phase 3: buildings use the same combat animation and fire visible arrows,
  cannonballs, shells, axes, daggers, bolts, boulders, and energy orbs; crown
  towers also fire on cadence.
- Phase 4: card-specific spell VFX for every spell id (arrows, fireball, zap,
  lightning, rocket, poison, freeze, rage, tornado, earthquake, log, barrels,
  graveyard, clone, curse, void, snowball, royal delivery).
- Phase 5: card-specific beams for inferno/electro/tesla/zappies, charge tilt,
  cannon/tower variants, projectile trails and impact sparks.
- Phase 6: caps for projectiles/slashes/ghosts/spells, reduced-motion handling,
  debug data attributes, and a 108-card `/animations` gallery.
2D strips: no complete licensed public strip set covers all 108 current cards
(the APK sprite rips predate most of them), so `scripts/generate_sprite_strips.py`
derives uniform 6-frame strips from the web-sourced card art already in the
project. Run it after replacing card art. Generated strips stay gitignored with
the rest of the user-supplied art; the canvas falls back to static art if absent.
Verification: 108 per-card screenshots + contact sheets saved under
`docs/screenshots/animations/`; `/animations` Playwright test; live practice
screenshots confirmed sprite motion, projectiles, spell rings, building fire,
and tower fire; 94 frontend Playwright tests, 141 backend tests, `tsc`, and
`next build` all pass.


### 2026-10-20 - Better in-deck card effect
Status: implemented (local worktree; commit not requested)
Source: "make better effect for the cards in deck instead of tick mark"
Notes: Replaced the green circular tick with an emerald veil, breathing ring
and a small "DECK" corner pill. `data-in-deck` and the existing
`card-tile-in-deck-<name>` test id are preserved. Reduced-motion disables the
pulse.
Verification: `npx tsc --noEmit`; 19 Playwright shell tests passed; collection
screenshot reviewed.

### 2026-10-20 - Fix crown-tower icons
Status: implemented (local worktree; commit not requested)
Source: "fix the tower icons, the level covering whole icon, i can't see the image in shop and towers tab in deck tab"
Notes: Tower tiles now hide the redundant level bar (the level is already shown
next to the tile), so the art is fully visible in Shop and Decks > Towers.
`CardArt` also uses a single-line `Lv N` strip to prevent wrapping on small
cards.
Verification: Shop and Decks > Towers screenshots reviewed; 19 shell tests.

### 2026-10-20 - Win-condition icon on home deck card
Status: implemented (local worktree; commit not requested)
Source: "show the icon of win condition on this instead of just text"
Notes: Home deck summary now renders the win-condition card art beside the
label, with the existing `home-win-condition` test id retained.
Verification: Home screenshot reviewed; 19 Playwright shell tests passed.

### 2026-10-21 - Real movement and attack animations for all 108 cards
Status: implemented (branch card-mechanics)
Source: "Replace the warped single-render strips with REAL movement and attack
animations for all 108 catalogue cards" - one 4x5 sprite sheet per card (red
walk / red attack / blue walk / blue attack, 480x384, 96x96 cells).
Notes: the sheets are rendered from the CC0 KayKit 3D models (real walk and
attack clips, so the character cannot drift between frames) and cut into the
10 frame strips the engine loads (0-4 walk, 5-9 attack). The per-card recipe
lives in `scripts/card-sheets/spec.py` and was checked card by card against
the original card renders with `scripts/card-sheets/compare_sheets.py`.
Verification: `/animations` + `/battle` screenshots, the card-art Playwright
spec (10 frame layout, real animation, fallback chain) and the audit script.

### 2026-10-21 - The Miner could not be deployed on the opponent's half
Status: implemented (branch card-mechanics)
Source: "i am not able to deploy minor on opponent side, check what is the
issue"
Notes: the net layer (`net/validation.ts` `validatePosition`) knew only the
"own half" rule and rejected the drop with `BAD_POSITION: position outside
your deploy zone` BEFORE the engine (which allows burrowers anywhere) saw the
play. The placement class now lives in ONE place - `game/cards.ts`
`placementClassOf` ("spell" | "anywhere" | "own-half") - and both the net
layer and the engine read it. The Goblin Drill (burrow) and the Mortar / X-Bow
(siege) were broken the same way.
Verification: 6 new regression tests in `backend/tests/validation.test.ts`,
460/460 backend tests, 112/112 Playwright tests, a live browser run that drops
the Miner on the enemy half (`docs/screenshots/miner-deploy.png`).


---
### How to add
1. Copy user message verbatim under `Source`.
2. Set `Status: pending`.
3. When phase planning touches related area, move to `Scheduled` with target phase.
4. After implementation + test, move to `Implemented` with commit hash link.
