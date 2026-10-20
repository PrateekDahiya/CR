"""Install the hand-edited tower art into frontend/public/towers/.

The edited captures in docs/tower-art/edited-tower-art/ are used AS IS (no
retouching): the script only trims the transparent margin and scales the art
to a canonical height so the arena can draw it inside the 3x3 tile footprint.

Red captures are the front view (enemy side), blue captures the back view
(player's own side) - exactly like Clash Royale.

Run:  python scripts/prepare_edited_tower_art.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "docs" / "tower-art" / "edited-tower-art"
OUT = REPO / "frontend" / "public" / "towers"

# edited file -> output stem (the arena loads princess-<troop>-<team>.png)
FILES: dict[str, str] = {
    "princess-blue.png": "princess-blue",
    "connonneer-red.png": "princess-cannoneer-red",
    "connonneer-blue.png": "princess-cannoneer-blue",
    "dagger-dutches.png": "princess-duchess-red",
    "dagger-dutches-blue.png": "princess-duchess-blue",
    "royale-chef-red.png": "princess-chef-red",
    "royale-chef-blue.png": "princess-chef-blue",
}

# Canonical output height (px). The canvas scales the art into the 3x3 tile
# footprint, so a taller source keeps the tower crisp when zoomed.
CANONICAL_H = 420


def trim_and_scale(bgr: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    ys, xs = np.where(alpha > 16)
    if len(ys) == 0:
        return bgr, alpha
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    # Small transparent margin so the art never touches the frame.
    pad = 4
    y0 = max(0, y0 - pad)
    x0 = max(0, x0 - pad)
    y1 = min(bgr.shape[0] - 1, y1 + pad)
    x1 = min(bgr.shape[1] - 1, x1 + pad)
    crop_bgr = bgr[y0 : y1 + 1, x0 : x1 + 1]
    crop_a = alpha[y0 : y1 + 1, x0 : x1 + 1]

    height, width = crop_bgr.shape[:2]
    scale = CANONICAL_H / height
    new_w = max(1, int(round(width * scale)))
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    out_bgr = cv2.resize(crop_bgr, (new_w, CANONICAL_H), interpolation=interp)
    out_a = cv2.resize(crop_a, (new_w, CANONICAL_H), interpolation=interp)
    return out_bgr, out_a


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    for name, stem in FILES.items():
        path = SRC / name
        if not path.exists():
            print(f"  MISSING {name}")
            continue
        image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
        if image is None:
            print(f"  UNREADABLE {name}")
            continue
        if image.shape[2] == 3:
            alpha = np.full(image.shape[:2], 255, np.uint8)
            bgr = image
        else:
            alpha = image[:, :, 3]
            bgr = image[:, :, :3].copy()

        bgr, alpha = trim_and_scale(bgr, alpha)
        rgba = np.dstack([bgr, alpha])
        target = OUT / f"{stem}.png"
        cv2.imwrite(str(target), rgba)
        print(f"{name} -> {target.name} {rgba.shape[1]}x{rgba.shape[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
