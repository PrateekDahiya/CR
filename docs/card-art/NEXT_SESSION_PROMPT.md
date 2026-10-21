# Next session prompt - real movement and attack animations for all 108 cards

> Copy the block below into the next session. It is self-contained: it names
> the goal, the files, the format, the tools, the rules and the verification.

---

## Task

Replace the warped single-render strips with **real movement and attack
animations** for every card of the 108-card catalogue.

Today the walk cycle is a per-row *warp* of one still image (the legs swing
because the pixels are displaced sideways), and the "attack" is a single
lunging frame. We want genuine per-frame animation, generated as a **4x5
sprite sheet per card**:

```
row 1 (5 frames)  RED team  - walk,  character seen from the FRONT  (towards the camera)
row 2 (5 frames)  RED team  - attack (casting the fire spell), FRONT view
row 3 (5 frames)  BLUE team - walk,  character seen from the BACK   (away from the camera)
row 4 (5 frames)  BLUE team - attack (casting the ice spell), BACK view
```

The engine already plays two views per card (red = front, blue = back, like
the king/princess towers), so the sheet gives us both teams at once.

### The image-generation prompt (the user's, verbatim - use it as the template)

```
A 4x5 grid sprite sheet showing a Clash Royale style wizard character on a pure white background. The sheet is strictly ordered into four distinct rows:
Row 1: Red team wizard movement cycle moving directly towards the camera showing straight front views only.
Row 2: Red team wizard attack animation frames casting fire spells directly towards the camera showing straight front views only.
Row 3: Blue team wizard movement cycle moving directly away from the camera showing straight back views only.
Row 4: Blue team wizard attack animation frames casting ice spells directly away from the camera showing straight back views only.
No side views or 3/4 angled views, clean character silhouettes, 3D rendered mobile game style, isolated on solid white background.
```

Per card, replace "wizard" with the card's unit type (knight, archer, giant,
barbarian, bomber, wizard, goblin, dragon, ...) and keep the team colours:
**red/orange** magic for the red rows, **blue/ice** magic for the blue rows.
Add to the prompt when the card needs it: the unit's weapon, the card's
element, the exact number of units in a squad (a squad card shows one unit
per frame, the arena spawns copies).

### Where the art comes from (free, and how to get a consistent character)

Read `docs/card-art/SOURCES_AND_TOOLS.md` first - it lists the free sprite
packs, the free AI generators and the licence traps.

Short version:
- **3D route (most consistent, licence clean):** a CC0 3D model
  (Quaternius https://quaternius.com/, KayKit, Kenney) -> walk/attack clips
  (Mixamo, free) -> render front + back ortho sheets with
  https://extensions.blender.org/add-ons/sprite-sheet-generator/ or
  https://pixor.art/ -> pack into the 4x5 grid. Every frame is the same
  character by construction.
- **2D route:** one front render per card -> animated sheet with
  https://ludo.ai/tools/sprite-animation (30 free credits, no card),
  https://www.spritesheets.ai/ or https://genioplus.com/en , then a
  "New Direction" pass for the back view.
- **AI route:** local ComfyUI/Krita AI Diffusion (free, private, you own the
  output) with ControlNet/OpenPose + IP-Adapter/LoRA for consistency, or
  Gemini "Nano Banana" / Ideogram in reference-image mode (the best hosted
  character consistency; check the free-tier terms first - Recraft, Freepik,
  Leonardo, Playground, Tensor.Art and Mage.Space are NOT safe for shipped art
  on their free tiers).
- Never commit ripped Supercell binaries. The existing wiki-derived *static*
  art stays as it is (an approved exception); the new animation sheets must
  be original art (AI or CC0/licence-clean).

### The target format the engine loads

Today: `frontend/public/sprites/<card>-<view>.png` = **8 frames x 96px**
(`0-1 idle, 2-5 walk, 6 attack, 7 death`), read by
`frontend/lib/battle/spriteAnim.ts`.

New proposal (decide and implement, keep the old strips working as a
fallback):

```
frontend/public/sprites/<card>-front.png   10 frames x 96px: 5 walk + 5 attack
frontend/public/sprites/<card>-back.png    10 frames x 96px: 5 walk + 5 attack
```

Mapping in the loader: `idle -> walk[0]`, `walk -> 0..4`,
`attack -> 5..9`, `death -> the static per-team art with the existing fade`
(the sheet has no death row - either keep the old warped death frame or drop
the death animation).

The sheet -> strip conversion is a new script:
`scripts/make_card_sprites_from_sheet.py`
- input: `docs/card-art/sheets/<card>.png` (the 4x5 sheet, 480x384)
- output: the two strips above + `frontend/public/sprites/manifest.json`
- it must cut the rows (walk = row 1, attack = row 2 for the front view;
  rows 4 and 3 for the back view), scale each cell to 96x96 with the feet on
  the ground, and keep the transparency (the AI gives a white background:
  remove it - the current script already does white-keying for the static art).

### Files to touch

```
scripts/make_card_sprites_from_sheet.py     NEW - slice a 4x5 sheet into the strips
scripts/make_card_sprites.py                keep (the fallback / legacy warped strips)
frontend/lib/battle/spriteAnim.ts           the frame layout + the 10-frame support
frontend/public/sprites/                    gitignored output (the same as today)
docs/card-art/sheets/<card>.png             NEW - the committed source sheets
docs/card-art/SHEET_SOURCES.json            NEW - per card: model, prompt, tool, date, licence
docs/card-art/README.md                     update the pipeline section
docs/CONTEXT.md, frontend/CONTEXT.md       keep the context files current
SUGGESTIONS.md                              log the task (date + status) and mark it implemented
```

### How to work through 108 cards

1. Start with **10-15 iconic cards** (knight, archer, giant, bomber, wizard,
   valkyrie, golem, mini-pekka, barbarian, goblin, skeleton, baby-dragon,
   musketeer, inferno-dragon) and get the pipeline end-to-end.
2. Look at the result in the app: `/animations` shows every card with its
   frames; the live battle is in `/battle`.
3. Screenshot into `docs/screenshots/` (`animations-*.png`, `battle-anim-*.png`).
4. Only then scale to the rest - and keep the quality gate: a card whose sheet
   is inconsistent (the character changes between frames) must be regenerated,
   not shipped.

### Rules

- MEMORY.md is the source of truth; read it plus `docs/CONTEXT.md` and
  `frontend/CONTEXT.md` first.
- No ripped Supercell binaries, ever. The new sheets are original art.
- Record the provenance of every sheet (model, prompt, reference, tool + tier,
  date) in `docs/card-art/SHEET_SOURCES.json` and add the CC-BY credits to
  `docs/card-art/CREDITS.md`.
- Keep the fallback chain intact: a missing strip must never break a match
  (team strip -> old neutral strip -> `/cardart/<card>-<view>.png` ->
  `/cards/<card>.png` -> emoji glyph).
- Keep the preview servers alive: frontend :3000, backend :4000, ai :8000
  (start scripts: `%TEMP%\cr-local\start-frontend.ps1` /
  `start-backend.ps1`). Before a production build: stop the frontend dev
  server and delete `frontend/.next`.
- Never commit secrets, never commit the test accounts (clean them with
  `backend/scripts/cleanup-test-accounts.ts`, then restart the backend; keep
  only `dahiya27`, `dahiya`, `p482128`).

### Verification before reporting back

- `frontend`: `npx tsc --noEmit` + `npm run build` (stop the dev server, delete
  `frontend/.next` first) + the Playwright suite (`npx playwright test`).
- `backend`: `npx tsc --noEmit` + `npm test` (the card matrix must stay green).
- `python scripts/audit_card_mechanics.py --strict` must stay PASS.
- Screenshots of the changed UI into `docs/screenshots/`.
- Clean the test accounts and restart the backend.
- Commit phase-wise and push (branch -> `main` with `--no-ff`).
