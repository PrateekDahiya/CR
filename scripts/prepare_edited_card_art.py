"""Install the hand-edited card art into frontend/public/cardart/.

The edited captures in `docs/card-art/edited-card-art/` are used AS IS (no
retouching): the script only trims the transparent margin and scales the art to
the canonical height so the arena can draw it inside the unit footprint.

File naming:
    <card>-front.png   red team  (character seen from the front)
    <card>-back.png    blue team (character seen from behind)

Anything you drop in that folder replaces the generated art. Run
`python scripts/make_card_sprites.py` afterwards to rebuild the animation
strips from the edited art.

Run:  python scripts/prepare_edited_card_art.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "docs" / "card-art" / "edited-card-art"
OUT = REPO / "frontend" / "public" / "cardart"

# Canonical output height (px). The arena scales the art into the unit
# footprint, so a taller source keeps the art crisp when zoomed.
CANONICAL_H = 256
MAX_W = 320


def trim_and_scale(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
    if bbox is None:
        return image
    cropped = image.crop(bbox)
    width, height = cropped.size
    scale = CANONICAL_H / height
    if width * scale > MAX_W:
        scale = MAX_W / width
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    return cropped.resize((new_w, new_h), Image.LANCZOS)


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}")
        print("Put your edited PNGs there as <card>-front.png / <card>-back.png.")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(SRC.glob("*.png")):
        stem = path.stem
        if not (stem.endswith("-front") or stem.endswith("-back")):
            print(f"  SKIP {path.name} (expected <card>-front.png or <card>-back.png)")
            continue
        with Image.open(path) as raw:
            image = raw.convert("RGBA")
        target = OUT / f"{stem}.png"
        trim_and_scale(image).save(target)
        count += 1
        print(f"{path.name} -> {target.name}")
    print(f"installed {count} edited card art files")
    if count:
        print("now run: python scripts/make_card_sprites.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
