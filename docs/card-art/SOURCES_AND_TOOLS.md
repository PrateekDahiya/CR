# Card Animation Sources And Tools (2026-10-21)

> Research notes for the next step of the card art work: **real movement and
> attack animations** for all 108 cards instead of the warped single render.
> The goal is a 4x5 sprite sheet per card (front walk, front attack, back
> walk, back attack) that the engine can play back.

## 1. What the pipeline looks like today

```
docs/card-art/sources/<card>-front.png        the wiki render (a single still)
        |
        |  scripts/make_card_sprites.py      (a per-row warp of the still)
        v
frontend/public/sprites/<card>-front.png     8 frames x 96px:
                                             0-1 idle, 2-5 walk, 6 attack, 7 death
frontend/public/sprites/<card>-back.png      the same for the blue (back) view
```

The loader (`frontend/lib/battle/spriteAnim.ts`) picks the strip by team
(red -> front, blue -> back) and falls back:
team strip -> old neutral strip -> `/cardart/<card>-<view>.png` -> `/cards/<card>.png` -> emoji glyph.

**What is missing:** a real *attack* animation and a real walk (the current
walk is a warp of one still, so the legs never articulate).

## 2. Free sprite / animation asset sources

| source | URL | license | what it gives |
| --- | --- | --- | --- |
| **Quaternius** (3D, CC0) | https://quaternius.com/ | CC0, commercial, no attribution | rigged characters + a 120+ animation library (walk/attack), Mixamo-compatible |
| **Kenney** | https://kenney.nl/assets | CC0, commercial, no attribution | 2D spritesheets, 3D characters, VFX, UI |
| **a_klingon "10 Animated RPG"** | https://aklingon.itch.io/10-animated-rpg-character-asset-pack | **CC0**, commercial, no attribution | 100x100 px frames, idle/run/**attack**/hit/death per character (incl. a caster and a witch) - the closest free match to our format |
| **OpenGameArt (CC0 filter)** | https://opengameart.org/art-search-advanced | CC0 / CC-BY / GPL per item | CC0 wizard/mage animations, spell VFX, tiles |
| **Pixel Frog** (Pixel Adventure, Kings and Pigs, Pirate Bomb) | https://pixelfrog-assets.itch.io/ | CC0 | animated characters + enemies |
| **KayKit** (3D, CC0) | https://kaylousberg.itch.io/ | CC0 | animated 3D characters incl. a Mage |
| **Poly Pizza / Poly Haven** | https://poly.pizza/ , https://polyhaven.com/ | CC0 / CC-BY | low-poly models, textures |
| **game-icons.net** | https://game-icons.net/ | CC BY 3.0 (credit required) | spell / weapon / potion icons (static) |
| **Mixamo** (Adobe, free) | https://www.mixamo.com/ | free, commercial, no attribution - but **no redistribution of the raw files** and no ML training | walk / attack / idle clips for any rig |
| **The Spriters Resource** | https://www.spriters-resource.com/ | **proprietary - do not use** | ripped commercial sprites |

### 3D -> sprite sheet (the cleanest way to get 108 consistent cards)
- **Pixor** - https://pixor.art/ - renders 3D models to sprite sheets (any
  camera angle, Aseprite tags, offline, free, no account).
- **Blender "Sprite Sheet Generator"** - https://extensions.blender.org/add-ons/sprite-sheet-generator/ -
  rotates the *armature* (so the lighting stays identical in every frame),
  smart frame interpolation, JSON metadata.
- **Sprite Forge** - https://thatindiesphinx.itch.io/sprite-forge - 8-direction
  sheets with locked framing and lighting.

Route: CC0 model -> Mixamo / Quaternius animations -> Blender or Pixor ->
front + back ortho renders -> pack into the 4x5 grid. The character is
pixel-identical in all 20 frames *by construction*.

### Still image -> animated sheet (2D route)
- **Ludo.ai Sprite Generator** - https://ludo.ai/tools/sprite-animation -
  image -> walk/attack sheet, transparent PNG + atlas, and a "New Direction"
  re-render for the back view. 30 free credits, no card.
- **Spritesheets.ai** - https://www.spritesheets.ai/ - upload one image ->
  walk cycle / attack sheet.
- **GenioPlus** - https://genioplus.com/en - image -> animated sheet
  (idle/walk/attack) with background removal in the browser.
- **Sorceress Auto-Sprite v2** - https://sorceress.games/ - video -> frames ->
  atlas (correct frame extraction via `requestVideoFrameCallback`).
- Local tools for packing/slicing: https://www.sprite-ai.art/tools ,
  https://toolsrift.com/images/sprite-sheet .

## 3. Free AI image generators (2026 state)

| tool | free allowance | commercial rights on the free tier | character consistency | scripting |
| --- | --- | --- | --- | --- |
| **ComfyUI / Fooocus / Forge (local)** | unlimited, no account, private | **you own it** (per model licence) | **best**: ControlNet/OpenPose, IP-Adapter, LoRA, AnimateDiff | HTTP + WS API, CLI |
| **Krita AI Diffusion** | unlimited, local | you own it | ControlNet + IP-Adapter | via ComfyUI |
| **Pollinations (keyed)** | free, key-based | per model licence - check it | model dependent | **free OpenAI-compatible API** (`https://gen.pollinations.ai/image/<prompt>`) |
| **Google AI Studio / Gemini (Nano Banana)** | modest free quota (image API is paid) | yes, but free-tier content improves their products | **best in class** (up to 14 references, 4 characters) | Batch API (image API paid) |
| **Ideogram** | 30 credits/week (only with Google/Apple/Microsoft sign-in) | **commercial use allowed**, no ownership claim | 1-5 reference images, saved Characters, Character API | paid API only |
| **Leonardo.ai** | 150 tokens/day | **NOT safe**: the free tier is public and ownership "vests in us" | Character Reference, Elements (LoRA), ControlNet | paid API |
| **SeaArt** | 130-150 stamina/day | user keeps the IP | LoRA training, in-browser ComfyUI | ComfyUI workflow |
| **Recraft / Freepik / Playground / Tensor.Art / Mage.Space** | various | **free tiers are personal-use only, public, or ownership is forfeited** - do not ship art from them | | |

## 4. Licensing notes (read before committing anything)

- **Supercell fan-content policy** (https://supercell.com/en/fan-content-policy/)
  forbids "new products or content based on Supercell Assets" and requires the
  fan-content disclaimer. The Clash Royale wiki's **card renders** are
  fair-use uploads that Fandom itself cannot license
  (https://support.fandom.com/hc/en-us/articles/360035075654-I-want-to-reuse-text-or-images-from-a-Fandom-wiki).
  The project keeps them as the *static* card art (an approved exception in
  MEMORY.md); the **new animation sheets should be original art** so the repo
  does not grow more Supercell-derived binaries.
- The wiki **text** (card names, stats, descriptions) is CC BY-SA and fine to
  use with attribution + a link back.
- Safe to commit: **CC0** (no action), **CC BY** (add a `CREDITS.md` line:
  author, title, URL, licence). Do **not** commit: CC-BY-NC / NC-ND, the
  Spriters Resource, or the free tiers of Recraft / Freepik / Leonardo /
  Playground / Tensor.Art / Mage.Space.
- Packs with "no redistribution of the source files" (CraftPix, GameDev
  Market, Tiny Swords) are fine to *use in the game* but the raw .zip must not
  be committed.
- Record the provenance of every generated sheet: model, version, prompt,
  reference image, tool + plan tier, date, source URL.

## 5. The recommended end-to-end pipeline

1. **Character identity** - one 96x96 front reference per card (108 of them).
   Keep them in a single style: one base LoRA / one character reference for the
   whole set, or one Quaternius/Kenney body per role with a recolour.
2. **Front + back render** - Gemini Nano Banana or Ideogram in reference mode
   gives the most consistent pair. Never generate the 20 frames independently:
   that is where the character drifts.
3. **Motion** - either the 3D route (Mixamo + Blender/Pixor, licence clean and
   perfectly consistent) or the 2D route (Ludo.ai / Spritesheets.ai on the
   front render, then a "New Direction" pass for the back view).
4. **Pack** - 4 rows x 5 cols of 96x96 cells = a 480x384 PNG per card, plus a
   TexturePacker JSON.
5. **Slice into the engine strips** - `scripts/make_card_sprites_from_sheet.py`
   cuts the sheet into the per-view strips the loader expects.
6. **Provenance** - `docs/card-art/SHEET_SOURCES.json` + a `CREDITS.md`.

## 6. Size budget

- One 480x384 RGBA PNG per card: ~120-250 KB -> 108 cards = **13-27 MB**.
- The current repo already carries ~50 MB of art, so a per-card PNG pipeline
  fits. Git stores PNGs without delta compression, so keep the count sane
  (and consider `git lfs` if it grows).
