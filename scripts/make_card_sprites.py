#!/usr/bin/env python3
"""Build the 2D movement strips for every card, for both team views.

The strips are cut from the per-team card art built by
`scripts/make_card_art.py` (the Clash Royale wiki renders):

    frontend/public/cardart/<card>-front.png   red team  (front view)
    frontend/public/cardart/<card>-back.png    blue team (back view)

Every card gets a real 6 frame animation, not one static picture:

    0-1 idle    breathing (slight bob / stretch)
    2-5 walk    the body sways over the legs while the unit bobs
    6   attack  the unit lunges forward and grows
    7   death   the unit topples over and fades out

The walk is a smooth warp of the artwork: the lower body is displaced
sideways row by row (so the legs swing while the torso stays put), the torso
bobs up and down and the whole figure leans into the step. The result reads as
a walk cycle at arena size and never tears the artwork apart.

Outputs (gitignored user art, same as the old strips):
    frontend/public/sprites/legacy/<card>-front.png
    frontend/public/sprites/legacy/<card>-back.png
    frontend/public/sprites/legacy/manifest.json

These are the FALLBACK strips: the real animation sheets
(`scripts/make_card_sprites_from_sheet.py`) write the 10 frame strips to
`frontend/public/sprites/`, and the loader only falls back to these old
warped strips when a card has no sheet.

Run from the repo root:
    python scripts/make_card_sprites.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
FRAME = 96
FRAMES = 8
MARGIN = 3
ART_DIR = ROOT / "frontend" / "public" / "cardart"
OUT_DIR = ROOT / "frontend" / "public" / "sprites" / "legacy"

VIEWS = ("front", "back")


def fit(art: Image.Image) -> Image.Image:
    """Scale the art into a FRAME x FRAME cell, feet on the ground."""
    art = art.convert("RGBA")
    inner = FRAME - 2 * MARGIN
    scale = inner / max(art.size)
    width = max(1, int(round(art.width * scale)))
    height = max(1, int(round(art.height * scale)))
    resized = art.resize((width, height), Image.LANCZOS)
    canvas = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((FRAME - width) // 2, FRAME - height - MARGIN))
    return canvas


def silhouette_widths(image: Image.Image) -> np.ndarray:
    alpha = np.asarray(image.getchannel("A"))
    return (alpha > 24).sum(axis=1).astype(np.float32)


def hip_row(image: Image.Image) -> int:
    """The row where the legs start (the narrowest row of the lower body)."""
    widths = silhouette_widths(image)
    height = len(widths)
    low = int(height * 0.45)
    high = int(height * 0.92)
    window = widths[low:high]
    if window.size == 0:
        return int(height * 0.55)
    return low + int(np.argmin(window))


def sway(arr: np.ndarray, amount: float, hip: int) -> np.ndarray:
    """Displace the lower body sideways, row by row (smooth, no tearing)."""
    height, width = arr.shape[:2]
    out = arr.copy()
    if abs(amount) < 0.05:
        return out
    for y in range(hip, height):
        t = (y - hip) / max(1, height - 1 - hip)
        shift = int(round(amount * (t**1.5)))
        if shift == 0:
            continue
        row = out[y]
        if shift > 0:
            moved = np.concatenate([row[:shift], row[:-shift]], axis=0)
        else:
            moved = np.concatenate([row[shift:], row[-shift:]], axis=0)
        out[y] = moved
    return out


def rotate_about(image: Image.Image, angle: float, pivot: tuple[float, float]) -> Image.Image:
    if not angle:
        return image
    return image.rotate(angle, resample=Image.BICUBIC, center=pivot)


def scale_about(image: Image.Image, factor: float, pivot: tuple[float, float]) -> Image.Image:
    if abs(factor - 1.0) < 0.001:
        return image
    width, height = image.size
    scaled = image.resize((max(1, int(round(width * factor))), max(1, int(round(height * factor)))), Image.LANCZOS)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, (int(round(pivot[0] - pivot[0] * factor)), int(round(pivot[1] - pivot[1] * factor))))
    return canvas


def vignette(image: Image.Image) -> Image.Image:
    """Soft feathered edge so the unit blends into the arena."""
    yy, xx = np.mgrid[0:FRAME, 0:FRAME]
    center = (FRAME - 1) / 2
    radius = np.sqrt((xx - center) ** 2 + (yy - center) ** 2) / (FRAME / 2)
    feather = np.clip((1 - (radius - 0.86) / 0.24), 0, 1) * 255
    alpha = ImageChops.multiply(image.getchannel("A"), Image.fromarray(feather.astype("uint8")))
    out = image.copy()
    out.putalpha(alpha)
    return out


def recenter(image: Image.Image) -> Image.Image:
    """Put the artwork back in the middle / on the ground after a transform."""
    bbox = image.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    if bbox is None:
        return image
    cropped = image.crop(bbox)
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    width, height = cropped.size
    if width > FRAME:
        return image
    canvas.alpha_composite(cropped, ((FRAME - width) // 2, FRAME - height - MARGIN))
    return canvas


def fallen(base: Image.Image) -> Image.Image:
    """The unit lying on the ground (the death frame)."""
    pad = FRAME + 96
    canvas = Image.new("RGBA", (pad + FRAME, pad + FRAME), (0, 0, 0, 0))
    canvas.alpha_composite(base, (pad // 2, pad // 2))
    pivot = (pad / 2 + FRAME / 2, pad / 2 + FRAME * 0.86)
    rotated = canvas.rotate(-90, resample=Image.BICUBIC, center=pivot)
    bbox = rotated.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    if bbox is None:
        return base
    cropped = rotated.crop(bbox)
    limit = FRAME - 2 * MARGIN
    scale = limit / max(cropped.size)
    if scale > 1:
        cropped = cropped.resize(
            (max(1, int(cropped.width * scale)), max(1, int(cropped.height * scale))),
            Image.LANCZOS,
        )
    out = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    out.alpha_composite(cropped, ((FRAME - cropped.width) // 2, FRAME - cropped.height - MARGIN))
    channel = out.getchannel("A").point(lambda v: int(v * 160 / 255))
    out.putalpha(channel)
    return vignette(out)


def build_frames(art: Image.Image) -> list[Image.Image]:
    base = fit(art)
    arr = np.asarray(base).copy()
    hip = hip_row(base)
    pivot = (FRAME / 2, FRAME * 0.86)  # the feet

    def frame(
        sway_amount: float,
        dy: float,
        dx: float,
        scale: float,
        angle: float,
    ) -> Image.Image:
        warped = sway(arr, sway_amount, hip)
        image = Image.fromarray(warped, mode="RGBA")
        image = rotate_about(image, angle, pivot)
        image = scale_about(image, scale, pivot)
        if dx or dy:
            shifted = Image.new("RGBA", image.size, (0, 0, 0, 0))
            shifted.alpha_composite(image, (int(round(dx)), int(round(dy))))
            image = shifted
        return vignette(image)

    return [
        frame(0.0, dy=1.0, dx=0.0, scale=1.0, angle=0.0),
        frame(0.0, dy=-1.0, dx=0.0, scale=1.015, angle=0.0),
        frame(7.0, dy=-2.0, dx=-2.0, scale=0.99, angle=-4.0),
        frame(3.0, dy=0.0, dx=-1.0, scale=1.0, angle=-1.5),
        frame(-7.0, dy=2.0, dx=2.0, scale=0.99, angle=4.0),
        frame(-3.0, dy=0.0, dx=1.0, scale=1.0, angle=1.5),
        frame(1.6, dy=-2.0, dx=3.0, scale=1.08, angle=-5.0),
        fallen(base),
    ]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "frameWidth": FRAME,
        "frameHeight": FRAME,
        "frames": FRAMES,
        "states": {"idle": [0, 1], "walk": [2, 3, 4, 5], "attack": [6], "death": [7]},
        "cards": {},
    }
    missing: list[str] = []
    count = 0
    for art_path in sorted(ART_DIR.glob("*-front.png")):
        card_id = art_path.name[: -len("-front.png")]
        for view in VIEWS:
            source = ART_DIR / f"{card_id}-{view}.png"
            if not source.exists():
                continue
            with Image.open(source) as raw:
                frames = build_frames(raw)
            strip = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
            for index, one in enumerate(frames):
                strip.alpha_composite(one, (index * FRAME, 0))
            strip.save(OUT_DIR / f"{card_id}-{view}.png", optimize=True)
            count += 1
        manifest["cards"][card_id] = {
            "views": {view: f"{card_id}-{view}.png" for view in VIEWS},
        }
        if card_id not in manifest["cards"]:
            missing.append(card_id)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"generated {count} strips for {len(manifest['cards'])} cards in {OUT_DIR}")
    if missing:
        print(f"missing card art ({len(missing)}): {', '.join(missing)}")


if __name__ == "__main__":
    main()
