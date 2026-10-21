# Next session prompt - real movement and attack animations for all 108 cards

> Copy the block below into the next session. It is self-contained: it names
> the goal, the worktree, the files, the format, the tools, the rules and the
> verification.

---

## TASK

Replace the warped single-render strips with **real movement and attack
animations** for every card of the 108-card catalogue.

Today the walk cycle is a per-row *warp* of one still image (the legs swing
because the pixels are displaced sideways), and the "attack" is a single
lunging frame. We want genuine per-frame animation, generated as a **4x5
sprite sheet per card**:

```
+-------------------------+-------------------------+-------------------------+-------------------------+
| row 1: RED  - walk      | row 2: RED  - attack    | row 3: BLUE - walk     | row 4: BLUE - attack   |
| 5 frames, FRONT view    | 5 frames, FRONT view    | 5 frames, BACK view    | 5 frames, BACK view    |
| (towards the camera)    | (casting the fire spell)| (away from the camera) | (casting the ice spell)|
+-------------------------+-------------------------+-------------------------+-------------------------+
```

The engine already plays two views per card (red = front, blue = back, like
the king/princess towers), so one sheet gives us both teams at once.

### THE IMAGE PROMPT (the user's, verbatim - use it as the template)

```
A 4x5 grid sprite sheet showing a Clash Royale style wizard character on a pure white background. The sheet is strictly ordered into four distinct rows:
Row 1: Red team wizard movement cycle moving directly towards the camera showing straight front views only.
Row 2: Red team wizard attack animation frames casting fire spells directly towards the camera showing straight front views only.
Row 3: Blue team wizard movement cycle moving directly away from the camera showing straight back views only.
Row 4: Blue team wizard attack animation frames casting ice spells directly away from the camera showing straight back views only.
No side views or 3/4 angled views, clean character silhouettes, 3D rendered mobile game style, isolated on solid white background.
```

Per card: replace "wizard" with the card's unit (knight, archer, giant,
barbarian, bomber, wizard, goblin, dragon, ...), keep the team colours
(**red/orange** magic in the red rows, **blue/ice** magic in the blue rows) and
add the unit's weapon / the card's element. A squad card (5 archers) shows
**one** unit per frame - the arena spawns the copies.

## WHERE TO WORK (read this first)

This repo has **two worktrees** of the same repository:

```
D:\Documents\Projects\CR                             -> branch main          (integration branch)
D:\Documents\Projects\CR\.worktrees\card-mechanics   -> branch card-mechanics (do the work HERE)
```

- **Work in `D:\Documents\Projects\CR\.worktrees\card-mechanics`** on the
  branch `card-mechanics`. The preview servers are started from that folder,
  so the live app shows your changes.
- `main` is the integration branch: every phase is merged into it with
  `git merge --no-ff card-mechanics` **from the main worktree**
  (`D:\Documents\Projects\CR`) and then pushed.
- The servers: frontend **:3000**, backend **:4000**, ai **:8000**. They are
  already running from the card-mechanics worktree. Restart them after a
  backend change with `%TEMP%\cr-local\start-backend.ps1` (and
  `start-frontend.ps1`); the backend is `tsx watch`, so it reloads by itself.
- Before a production build: **stop the frontend dev server and delete
  `frontend/.next`**, then `npm run build`, then restart the dev server.

## BEFORE YOU START

1. `cd D:\Documents\Projects\CR\.worktrees\card-mechanics` and
   `git status` (it must be clean) and `git log --oneline -3`.
2. Read `MEMORY.md` (the source of truth), then `docs/CONTEXT.md`,
   `frontend/CONTEXT.md` and `backend/CONTEXT.md`.
3. Read `docs/card-art/README.md` (the current pipeline) and
   `docs/card-art/SOURCES_AND_TOOLS.md` (the free sources, the free AI
   generators and the licence matrix).
4. Check the servers: `http://localhost:3000` (app), `http://localhost:4000/health`,
   `http://localhost:8000/health`.

## WHERE THE ART COMES FROM (free)

- **3D route (most consistent, licence clean):** a CC0 3D model
  (Quaternius https://quaternius.com/, KayKit, Kenney) -> walk/attack clips
  (Mixamo, free) -> front + back ortho renders with
  https://extensions.blender.org/add-ons/sprite-sheet-generator/ or
  https://pixor.art/ -> pack into the 4x5 grid. Every frame is the same
  character *by construction*.
- **2D route:** one front render per card -> animated sheet with
  https://ludo.ai/tools/sprite-animation (30 free credits, no card),
  https://www.spritesheets.ai/ or https://genioplus.com/en , then a
  "New Direction" pass for the back view.
- **AI route:** local ComfyUI / Krita AI Diffusion (free, private, you own the
  output) with ControlNet/OpenPose + IP-Adapter/LoRA for consistency, or
  Gemini "Nano Banana" / Ideogram in reference-image mode (the best hosted
  character consistency). Pollinations (`https://gen.pollinations.ai`) is the
  free scripted API.
- **Do NOT ship art from** Recraft, Freepik/Magnific, Leonardo, Playground,
  Tensor.Art or Mage.Space free tiers (personal-use only, public, or the
  vendor keeps the rights). **Never commit ripped Supercell binaries** - the
  existing wiki-derived *static* art stays as it is (an approved exception in
  MEMORY.md), but the new animation sheets must be original art (AI, CC0 or
  licence-clean). Record the provenance of every sheet and add the CC-BY
  credits to `docs/card-art/CREDITS.md`.

## THE TARGET FORMAT THE ENGINE LOADS

Today: `frontend/public/sprites/<card>-<view>.png` = **8 frames x 96px**
(`0-1 idle, 2-5 walk, 6 attack, 7 death`), read by
`frontend/lib/battle/spriteAnim.ts`.

New proposal (implement this, keep the old strips working as a fallback):

```
frontend/public/sprites/<card>-front.png   10 frames x 96px: 5 walk + 5 attack
frontend/public/sprites/<card>-back.png    10 frames x 96px: 5 walk + 5 attack
```

Loader mapping: `idle -> walk[0]`, `walk -> 0..4`, `attack -> 5..9`,
`death -> the static per-team art with the existing fade` (the sheet has no
death row: either keep the old warped death frame or drop the death
animation).

The sheet -> strip conversion is a new script:
`scripts/make_card_sprites_from_sheet.py`
- input: `docs/card-art/sheets/<card>.png` (the 4x5 sheet, 480x384)
- output: the two strips above + `frontend/public/sprites/manifest.json`
- it cuts the rows (front view = walk row 1 + attack row 2, back view = walk
  row 3 + attack row 4), scales each cell to 96x96 with the feet on the
  ground and removes the white background (the AI draws on white; the current
  script already does white-keying for the static art).

## FILES TO TOUCH

```
scripts/make_card_sprites_from_sheet.py     NEW - slice a 4x5 sheet into the strips
scripts/make_card_sprites.py                keep (the legacy warped strips = the fallback)
frontend/lib/battle/spriteAnim.ts           the frame layout + the 10-frame support
frontend/public/sprites/                    gitignored output (the same as today)
docs/card-art/sheets/<card>.png             NEW - the committed source sheets
docs/card-art/SHEET_SOURCES.json            NEW - per card: model, prompt, tool, date, licence
docs/card-art/CREDITS.md                    NEW - the CC-BY credits of everything used
docs/card-art/README.md                     update the pipeline section
docs/CONTEXT.md, frontend/CONTEXT.md       keep the context files current
SUGGESTIONS.md                              log the task (date + status) and mark it implemented
```

## HOW TO WORK THROUGH 108 CARDS

1. Start with **10-15 iconic cards** (knight, archer, giant, bomber, wizard,
   valkyrie, golem, mini-pekka, barbarian, goblin, skeleton, baby-dragon,
   musketeer, inferno-dragon) and get the pipeline end-to-end.
2. Look at the result in the app: `/animations` shows every card with its
   frames, the live battle is in `/battle`.
3. Screenshot into `docs/screenshots/` (`animations-*.png`, `battle-anim-*.png`).
4. Only then scale to the rest - and keep the quality gate: a sheet whose
   character changes between frames (or whose rows do not line up) must be
   regenerated, not shipped.

## RULES

- MEMORY.md is the source of truth; read it plus `docs/CONTEXT.md` and
  `frontend/CONTEXT.md` first.
- No ripped Supercell binaries, ever. The new sheets are original art.
- Record the provenance of every sheet (model, prompt, reference, tool +
  tier, date) in `docs/card-art/SHEET_SOURCES.json`.
- Keep the fallback chain intact: a missing strip must never break a match
  (team strip -> old neutral strip -> `/cardart/<card>-<view>.png` ->
  `/cards/<card>.png` -> emoji glyph).
- Keep the preview servers alive (:3000 / :4000 / :8000).
- Never commit secrets; clean the test accounts
  (`backend/scripts/cleanup-test-accounts.ts`, then restart the backend; keep
  only `dahiya27`, `dahiya`, `p482128`).

## VERIFICATION BEFORE REPORTING BACK

- `frontend`: `npx tsc --noEmit` + `npm run build` (stop the dev server and
  delete `frontend/.next` first, then restart it) + `npx playwright test`.
- `backend`: `npx tsc --noEmit` + `npm test` (the card matrix must stay green).
- `python scripts/audit_card_mechanics.py --strict` must stay PASS.
- Screenshots of the changed UI into `docs/screenshots/`.
- Clean the test accounts and restart the backend.
- Commit phase-wise and push: push `card-mechanics`, then from the **main**
  worktree `git merge --no-ff card-mechanics` and `git push origin main`.
