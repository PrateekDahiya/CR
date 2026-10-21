# Credits - the card sprite sheets

The 4x5 sprite sheets in `docs/card-art/sheets/` are **original art**: they are
rendered from **CC0 3D models** that we download, rig and render ourselves, so
no Supercell / Clash Royale binary is committed with them.

## The models

### KayKit - Character Pack: Adventurers + Character Pack: Skeletons

* Author: **Kay Lousberg** (https://kaylousberg.com, https://kaylousberg.itch.io/kaykit-adventurers)
* Source: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
  and https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
* Licence: **CC0 1.0 Universal** (public domain - commercial use, no
  attribution required, modifications allowed)
* What we use: the rigged characters (Knight, Barbarian, Mage, Rogue, Rogue
  Hooded, Skeleton Warrior / Mage / Rogue / Minion), their modular parts
  (helmets, capes, swords, axes, staves, wands, crossbows, shields, bows) and
  their 75+ animations (walking, running, melee, ranged, spellcasting, death).

The models are **not** committed to this repository. `scripts/fetch_card_models.py`
downloads them into the local asset cache
(`%LOCALAPPDATA%\Temp\cr-assets\card-models`).

## The rendering

* **Blender 4.5 LTS** (https://www.blender.org) - the renderer, EEVEE.
* The sheets are produced by `scripts/blender/render_card_sheet.py` (driven by
  `scripts/make_card_sheets.py`).
* The extra geometry of some units (wings, bellies, cannons, balloons, wings
  of a dragon) is built from Blender primitives - that part is **ours**.

## The images we did NOT use for the new sheets

* The Clash Royale **wiki renders** in `docs/card-art/sources/` are kept as the
  *static* card art only (an approved exception in MEMORY.md). They are the
  **reference** we checked every recipe against
  (`scripts/card-sheets/compare_sheets.py`), they are not part of the new
  animation sheets.
* Nothing from Recraft, Freepik / Magnific, Leonardo, Playground, Tensor.Art or
  Mage.Space (their free tiers are personal-use only) is used.
* No ripped Supercell binary is committed with the sheets.

## The per-card provenance

`docs/card-art/SHEET_SOURCES.json` records, for every card: the model, the
gear, the weapon, the walk / attack animation, the tool and the date.
