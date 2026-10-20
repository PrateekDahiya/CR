# SUGGESTIONS - Parking Lot (Do Not Implement Immediately)

> Rule from MEMORY.md #6: whenever user provides any suggestion mid-stream, append here with date + status, and implement only when working on related features.
> Format: `## YYYY-MM-DD - <title>` + `Status: pending|scheduled:<phase>|implemented` + `Source: user verbatim` + `Notes`.

## Pending

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
Status: pending
Source: "make the game cards movement , movement animation better search web for better animations add to suggestions"
Notes: Research better 2D walk/movement animation sources for the deployed
troops (more frames, smoother cycles, per-card directionality) and swap them
into the strip pipeline. Keep the current fallbacks working so a missing strip
never breaks a match.

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


---
### How to add
1. Copy user message verbatim under `Source`.
2. Set `Status: pending`.
3. When phase planning touches related area, move to `Scheduled` with target phase.
4. After implementation + test, move to `Implemented` with commit hash link.
