"""Build the per-team card art (front view / back view) for every catalogue card.

Input : the online sources fetched by `scripts/fetch_card_art.py`
        (docs/card-art/sources.json + docs/card-art/sources/*).
Output: frontend/public/cardart/<card>-front.png   red team  (character seen
        from the front - the same way the red king tower faces the player)
        frontend/public/cardart/<card>-back.png    blue team (the character
        seen from the other side, like the blue king tower is seen from
        behind).

The wiki only publishes one render per card, so the blue "back" view is
derived exactly the way the princess tower was: the front art is mirrored and
the red team colours are rotated to the blue team hue. Cards whose blue view
still needs a hand drawn back are listed in docs/card-art/README.md.

Run:  python scripts/make_card_art.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs" / "card-art"
OUT = REPO / "frontend" / "public" / "cardart"

# The full resolution downloads live in the local cache of the fetch script;
# the checked-in sources under docs/card-art/sources/ are shrunk copies.
CACHE = Path.home() / "AppData" / "Local" / "Temp" / "cr-assets" / "card-art"

# Canonical character height in pixels. The arena scales the art into the unit
# footprint, so a taller source stays crisp when the arena is zoomed.
CANONICAL_H = 256
MAX_W = 320

# Red -> blue rotation (same values as scripts/make_tower_art.py).
TARGET_HUE = 212.0
MIN_SAT = 0.30
MIN_VAL = 0.10

# The card tile layout (used when the wiki only ships the full card frame).
TILE_CROP = (0.085, 0.215, 0.915, 0.865)

# Wiki sources smaller than this are the spell hexagon badge, not card art.
SMALL_SOURCE = 400


def is_character_render(image: Image.Image) -> bool:
    """A render has a transparent background; a card tile is a solid block."""
    if image.mode not in ("RGBA", "LA"):
        return False
    alpha = np.asarray(image.convert("RGBA"))[:, :, 3]
    if alpha.min() == 255:
        return False
    return float((alpha < 250).mean()) > 0.02


def crop_card_tile(image: Image.Image) -> Image.Image:
    """Cut the character out of a full card tile."""
    width, height = image.size
    left = int(width * TILE_CROP[0])
    right = int(width * TILE_CROP[2])
    top = int(height * TILE_CROP[1])
    bottom = int(height * TILE_CROP[3])
    return image.crop((left, top, right, bottom))


def trim_alpha(image: Image.Image) -> Image.Image:
    mask = image.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    bbox = mask.getbbox()
    return image if bbox is None else image.crop(bbox)


def normalise(image: Image.Image) -> Image.Image:
    """Trim, then scale to the canonical height keeping the aspect ratio."""
    image = trim_alpha(image.convert("RGBA"))
    width, height = image.size
    if height == 0 or width == 0:
        return image
    scale = CANONICAL_H / height
    if width * scale > MAX_W:
        scale = MAX_W / width
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    return image.resize((new_w, new_h), Image.LANCZOS)


def shift_red_to_blue(image: Image.Image) -> Image.Image:
    """Rotate the red team colours of the art to the blue team hue."""
    hsv = np.asarray(image.convert("HSV")).copy()
    hue = hsv[:, :, 0]
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    degrees = hue.astype(np.float32) * (360.0 / 255.0)
    mask = (
        (sat >= MIN_SAT * 255)
        & (val >= MIN_VAL * 255)
        & ((degrees >= 330.0) | (degrees <= 13.0))
    )
    if mask.any():
        hue[mask] = int(round(TARGET_HUE * 255 / 360.0)) % 256
    shifted = Image.fromarray(hsv, mode="HSV").convert("RGBA")
    out = image.copy()
    out.paste(shifted, (0, 0), Image.fromarray((mask * 255).astype(np.uint8), mode="L"))
    return out


def build_back(front: Image.Image) -> Image.Image:
    """Blue team view: the character seen from the other side."""
    mirrored = front.transpose(Image.FLIP_LEFT_RIGHT)
    return shift_red_to_blue(mirrored)


def main() -> int:
    manifest_path = DOCS / "sources.json"
    if not manifest_path.exists():
        print(f"missing {manifest_path} - run scripts/fetch_card_art.py first")
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    report: dict[str, dict] = {}
    for card_id, entry in sorted(manifest.items()):
        front_path = DOCS / str(entry.get("front") or "")
        cached_path = CACHE / front_path.name
        if cached_path.exists() and cached_path.stat().st_size > front_path.stat().st_size:
            front_path = cached_path  # the full resolution original
        source = "none"
        image = None
        if front_path.exists():
            with Image.open(front_path) as raw:
                candidate = raw.convert("RGBA")
            # A small wiki source is the spell hexagon badge, not the card art:
            # the app already ships the real Supercell art for every card, so
            # that one is used instead.
            if max(candidate.size) < SMALL_SOURCE and (REPO / "frontend" / "public" / "cards" / f"{card_id}.png").exists():
                image = None
            else:
                image = candidate
        if image is None:
            legacy = REPO / "frontend" / "public" / "cards" / f"{card_id}.png"
            if legacy.exists():
                with Image.open(legacy) as raw:
                    image = crop_card_tile(raw.convert("RGBA"))
                source = "legacy-tile"
        if image is None:
            report[card_id] = {"status": "missing"}
            print(f"  MISSING {card_id}")
            continue
        if source == "none":
            if is_character_render(image):
                source = "render"
            else:
                image = crop_card_tile(image)
                source = "card-tile"
        front = normalise(image)

        front.save(OUT / f"{card_id}-front.png", optimize=True)
        build_back(front).save(OUT / f"{card_id}-back.png", optimize=True)
        report[card_id] = {"status": "ok", "source": source, "size": list(front.size)}
        print(f"{card_id:20s} {source:11s} {front.size}")

    (OUT / "manifest.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    ok = sum(1 for v in report.values() if v["status"] == "ok")
    print(f"built {ok}/{len(manifest)} card art pairs in {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
