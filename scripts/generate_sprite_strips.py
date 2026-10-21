#!/usr/bin/env python3
"""Generate 2D animation strips for every card from the local card art.

Why derived strips: there is no complete, licensed public strip set covering all
108 cards in this catalogue (the 2017 APK rips stop long before modern cards).
This script turns the card art already used by the app into a uniform 6-frame
strip so battle can animate every card with one O(1) drawImage path:

    0-1 idle, 2-3 walk, 4 attack, 5 death

Outputs (gitignored user art):
    frontend/public/sprites/<card>.png
    frontend/public/sprites/manifest.json

Run from the repo root:
    python scripts/generate_sprite_strips.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageChops
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FRAME = 96
FRAMES = 6
ART_DIR = ROOT / "frontend" / "public" / "cards"
OUT_DIR = ROOT / "frontend" / "public" / "sprites"


def crop_inner(im: Image.Image) -> Image.Image:
    """Remove the card frame/crown tab and centre the character square."""
    im = im.convert("RGBA")
    w, h = im.size
    left, right = int(w * 0.085), int(w * 0.915)
    top, bottom = int(h * 0.215), int(h * 0.865)
    c = im.crop((left, top, right, bottom))
    side = min(c.size)
    x = (c.width - side) // 2
    y = (c.height - side) // 2
    return c.crop((x, y, x + side, y + side)).resize((FRAME, FRAME), Image.LANCZOS)


def frame(
    base: Image.Image,
    scale: float = 1.0,
    angle: float = 0.0,
    dx: int = 0,
    dy: int = 0,
    alpha: int = 255,
) -> Image.Image:
    canvas = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    size = max(1, int(FRAME * scale))
    img = base.resize((size, size), Image.LANCZOS)
    if alpha < 255:
        img.putalpha(img.getchannel("A").point(lambda v: int(v * alpha / 255)))
    if angle:
        img = img.rotate(angle, resample=Image.BICUBIC, expand=True)
    canvas.alpha_composite(img, ((FRAME - img.width) // 2 + dx, (FRAME - img.height) // 2 + dy))
    # Soft vignette so battle units blend into the arena instead of sitting in
    # a hard circular/rectangular container. No team ring is drawn at runtime.
    yy, xx = np.mgrid[0:FRAME, 0:FRAME]
    center = (FRAME - 1) / 2
    radius = np.sqrt((xx - center) ** 2 + (yy - center) ** 2) / (FRAME / 2)
    feather = np.clip((1 - (radius - 0.78) / 0.22), 0, 1) * 255
    alpha = ImageChops.multiply(canvas.getchannel("A"), Image.fromarray(feather.astype("uint8")))
    canvas.putalpha(alpha)
    return canvas


def main() -> None:
    cards_ts = (ROOT / "frontend" / "lib" / "cards.generated.ts").read_text(encoding="utf-8")
    entries = dict(
        re.findall(r'\{ id: "([^"]+)", name: "[^"]+", type: "([^"]+)"', cards_ts)
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "frameWidth": FRAME,
        "frameHeight": FRAME,
        "frames": FRAMES,
        "states": {"idle": [0, 1], "walk": [2, 3], "attack": [4], "death": [5]},
        "cards": {},
    }
    missing: list[str] = []
    for card_id, card_type in sorted(entries.items()):
        src = ART_DIR / f"{card_id}.png"
        if not src.exists():
            missing.append(card_id)
            continue
        base = crop_inner(Image.open(src))
        frames = [
            frame(base),
            frame(base, scale=1.035, dy=-1),
            frame(base, scale=0.97, angle=-5, dx=-2, dy=-1),
            frame(base, scale=0.99, angle=5, dx=2, dy=0),
            frame(base, scale=1.09, angle=-7, dx=5, dy=-2),
            frame(base, scale=0.82, angle=22, dx=4, dy=7, alpha=150),
        ]
        strip = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            strip.alpha_composite(f, (i * FRAME, 0))
        strip.save(OUT_DIR / f"{card_id}.png", optimize=True)
        manifest["cards"][card_id] = {"type": card_type, "strip": f"{card_id}.png"}

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"generated {len(manifest['cards'])} strips in {OUT_DIR}")
    if missing:
        print(f"missing card art ({len(missing)}): {', '.join(missing)}")


if __name__ == "__main__":
    main()
