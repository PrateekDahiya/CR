#!/usr/bin/env python3
"""Cut the 4x5 card sprite sheets into the strips the engine loads.

The sheets live in `docs/card-art/sheets/<card>.png` (480x384, 5 columns x 4
rows of 96x96 cells):

    row 1  red  - walk   (front view)
    row 2  red  - attack (front view)
    row 3  blue - walk   (back view)
    row 4  blue - attack (back view)

The engine loads one strip per team view:

    frontend/public/sprites/<card>-front.png   10 frames: 0-4 walk, 5-9 attack
    frontend/public/sprites/<card>-back.png    10 frames: 0-4 walk, 5-9 attack

Every cell is scaled to 96x96 with the feet on the ground and the white
background of the sheet is keyed out, so the unit can be dropped straight
into the arena.

Outputs (gitignored, like the rest of the generated art):
    frontend/public/sprites/<card>-front.png
    frontend/public/sprites/<card>-back.png
    frontend/public/sprites/manifest.json

Run from the repo root:
    python scripts/make_card_sprites_from_sheet.py
    python scripts/make_card_sprites_from_sheet.py knight wizard   # some cards
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHEET_DIR = ROOT / "docs" / "card-art" / "sheets"
OUT_DIR = ROOT / "frontend" / "public" / "sprites"

FRAME = 96
COLS = 5
ROWS = 4
MARGIN = 3

# the sheet rows -> the frames of a view
VIEWS = {
    "front": (0, 1),
    "back": (2, 3),
}


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """The white background of a cell.

    A plain "is this pixel white" test would delete the white parts of a
    white unit (the snowball, the zap). Instead the background is the
    *connected* white area that reaches the border of the cell - everything
    else (including the white inside a unit) stays opaque.
    """
    near = rgb.min(axis=2) > 250
    background = np.zeros(near.shape, dtype=bool)
    background[0, :] = near[0, :]
    background[-1, :] = near[-1, :]
    background[:, 0] = near[:, 0]
    background[:, -1] = near[:, -1]
    while True:
        grown = background.copy()
        grown[1:, :] |= background[:-1, :]
        grown[:-1, :] |= background[1:, :]
        grown[:, 1:] |= background[:, :-1]
        grown[:, :-1] |= background[:, 1:]
        grown &= near
        if grown.sum() == background.sum():
            return background
        background = grown


def key_out(image: Image.Image) -> Image.Image:
    """Turn the white background of the sheet into transparency."""
    rgba = image.convert("RGBA")
    data = np.asarray(rgba).astype(np.uint8)
    background = background_mask(data[:, :, :3])
    data[:, :, 3] = np.where(background, 0, 255).astype(np.uint8)
    return Image.fromarray(data, mode="RGBA")


def fit_cell(cell: Image.Image) -> Image.Image:
    """Key the white background out of the cell.

    The cells are already framed consistently (the camera does not move
    between the frames of a card), so the cell must NOT be re-centred or
    re-scaled here - that would make the unit pulse during the walk cycle.
    """
    return key_out(cell)


def cut(sheet: Image.Image, view: str) -> Image.Image:
    walk_row, attack_row = VIEWS[view]
    strip = Image.new("RGBA", (FRAME * COLS * 2, FRAME), (0, 0, 0, 0))
    index = 0
    for row in (walk_row, attack_row):
        for col in range(COLS):
            cell = sheet.crop((col * FRAME, row * FRAME, (col + 1) * FRAME, (row + 1) * FRAME))
            strip.alpha_composite(fit_cell(cell), (index * FRAME, 0))
            index += 1
    return strip


def main() -> None:
    only = sys.argv[1:]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "frameWidth": FRAME,
        "frameHeight": FRAME,
        "frames": 10,
        "states": {"idle": [0], "walk": [0, 1, 2, 3, 4], "attack": [5, 6, 7, 8, 9], "death": []},
        "cards": {},
    }
    count = 0
    for sheet_path in sorted(SHEET_DIR.glob("*.png")):
        card_id = sheet_path.stem
        if only and card_id not in only:
            continue
        with Image.open(sheet_path) as raw:
            sheet = raw.convert("RGB")
        if sheet.size != (COLS * FRAME, ROWS * FRAME):
            print(f"skip {card_id}: unexpected sheet size {sheet.size}")
            continue
        views = {}
        for view in VIEWS:
            strip = cut(sheet, view)
            strip.save(OUT_DIR / f"{card_id}-{view}.png", optimize=True)
            views[view] = f"{card_id}-{view}.png"
            count += 1
        manifest["cards"][card_id] = {"views": views, "frames": 10}
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"generated {count} strips for {len(manifest['cards'])} cards in {OUT_DIR}")


if __name__ == "__main__":
    main()
