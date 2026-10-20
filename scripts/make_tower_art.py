"""Build the CR Clone tower art set in frontend/public/towers.

Sources (Clash Royale wiki, fetched once into a temp cache):
  * King_Tower_Red_Active.png  -> king-red-active.png (red king tower, front view)
  * King_Tower_Blue_Active.png -> king-blue-active.png (blue king tower)
  * Princesstower.png           -> princess-red.png  (princess tower, front view)

The blue assets are hue-shifted copies of the red art: every red pixel
(hue 330..15, saturation >= 0.30) is rotated to blue (hue 212) while gold,
skin, wood and stone keep their colour. The result reads as the same tower
in the other team colour instead of a flat tint.

Run:  python scripts/make_tower_art.py [--cache-dir <dir>]
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = {
    # Authentic red-side art: the enemy towers are seen from the front.
    "king_red_active.png": "https://static.wikia.nocookie.net/clashroyale/images/7/75/King_Tower_Red_Active.png/revision/latest?cb=20210516052849",
    "king_red.png": "https://static.wikia.nocookie.net/clashroyale/images/1/15/King_Tower_Red.png/revision/latest?cb=20210516052835",
    # Authentic blue-side art: the player's own towers are seen from BEHIND
    # (the camera sits behind the player), so the wiki ships a back view.
    "king_blue_active.png": "https://static.wikia.nocookie.net/clashroyale/images/b/bd/King_Tower_Blue_Active.png/revision/latest?cb=20210516052912",
    "king_blue.png": "https://static.wikia.nocookie.net/clashroyale/images/d/df/King_Tower_Blue.png/revision/latest?cb=20210516052913",
    "princess_red.png": "https://static.wikia.nocookie.net/clashroyale/images/6/61/Princesstower.png/revision/latest?cb=20200730101418",
    # Blue King character render (used as the King Tower portrait in the UI).
    "king_blue_character.png": "https://static.wikia.nocookie.net/clashroyale/images/6/67/Blue_King_New.png/revision/latest?cb=20251223132327",
    # Tower troops (rendered characters) that stand on the side tower.
    "troop_cannoneer.png": "https://static.wikia.nocookie.net/clashroyale/images/8/86/Cannoneer_card_render.png/revision/latest?cb=20250111131450",
    "troop_duchess.png": "https://static.wikia.nocookie.net/clashroyale/images/b/b8/Dagger_Duchess_card_render.png/revision/latest?cb=20250111130757",
    "troop_chef.png": "https://static.wikia.nocookie.net/clashroyale/images/6/61/Royale_Chef_Card_Render.png/revision/latest?cb=20250111133726",
}

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "frontend" / "public" / "towers"

# Red -> blue rotation. Hue 330..15 covers the red cloth/armour; gold (~45),
# skin (~25) and wood stay untouched.
TARGET_HUE = 212.0
MIN_SAT = 0.30
MIN_VAL = 0.10

# Side tower: the wiki art is the Archer Princess on the stone tower. The
# tower troops are composited onto the same base (rows below the archer).
TOWER_BASE_TOP = 100  # first row of the stone wall
TOWER_BASE_H = 110  # height of the stone wall part
TOWER_TROOPS = {
    "cannoneer": "troop_cannoneer.png",
    "duchess": "troop_duchess.png",
    "chef": "troop_chef.png",
}


def fetch(name: str, cache: Path) -> Path:
    target = cache / name
    if target.exists():
        return target
    url = WIKI[name]
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (CR-Clone asset build)"})
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310 - fixed wiki hosts
        data = response.read()
    target.write_bytes(data)
    return target


def shift_red_to_blue(src: Path, dst: Path) -> None:
    from colorsys import hsv_to_rgb, rgb_to_hsv

    image = Image.open(src).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 8:
                continue
            hue, sat, val = rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            degrees = hue * 360.0
            if sat >= MIN_SAT and val >= MIN_VAL and (degrees >= 330.0 or degrees <= 13.0):
                nr, ng, nb = hsv_to_rgb(TARGET_HUE / 360.0, min(1.0, sat * 0.98), val)
                pixels[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    image.save(dst)


def trim_alpha(image: Image.Image) -> Image.Image:
    """Crop the transparent border of a character render."""
    mask = image.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    bbox = mask.getbbox()
    return image if bbox is None else image.crop(bbox)


def rotate_180(src: Path, dst: Path) -> None:
    """Rotate an asset 180 degrees (the blue side faces the opposite way)."""
    image = Image.open(src).convert("RGBA")
    image.transpose(Image.ROTATE_180).save(dst)


def mirror(src: Path, dst: Path) -> None:
    """Mirror an asset horizontally (the other side of the same model)."""
    image = Image.open(src).convert("RGBA")
    image.transpose(Image.FLIP_LEFT_RIGHT).save(dst)


def build_side_tower(tower_art: Image.Image, troop: Image.Image) -> Image.Image:
    """Stand a tower troop on the stone side tower (wiki art base).

    The wiki Princess tower art is the Archer Princess standing on the stone
    wall. The wall (rows below the archer) is reused as the base and the
    requested tower troop is composited behind it, so the troop appears to
    stand inside the tower like in Clash Royale.
    """
    width, height = tower_art.size
    base = tower_art.crop((0, TOWER_BASE_TOP, width, height))
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    troop = trim_alpha(troop)
    # Fit the troop into the open part of the tower (above the wall).
    target_h = TOWER_BASE_TOP + 34
    scale = target_h / troop.height
    troop = troop.resize((max(1, int(troop.width * scale)), target_h), Image.LANCZOS)
    canvas.paste(troop, ((width - troop.width) // 2, TOWER_BASE_TOP + 34 - troop.height), troop)
    # The wall is drawn last: it hides the troop's legs.
    canvas.paste(base, (0, TOWER_BASE_TOP), base)
    return canvas


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", default=os.path.join(tempfile.gettempdir(), "cr-assets"))
    args = parser.parse_args()
    cache = Path(args.cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    # Red art is used as-is.
    shutil.copyfile(fetch("king_red_active.png", cache), OUT / "king-red-active.png")
    shutil.copyfile(fetch("king_red.png", cache), OUT / "king-red.png")

    # Blue king tower: the authentic wiki art (the player's own tower is seen
    # from BEHIND, exactly like in Clash Royale).
    shutil.copyfile(fetch("king_blue_active.png", cache), OUT / "king-blue-active.png")
    shutil.copyfile(fetch("king_blue.png", cache), OUT / "king-blue.png")

    # Side towers: the Archer Princess art plus one variant per tower troop.
    # Red = front view; blue = the same tower mirrored (the player's own side).
    princess = Image.open(fetch("princess_red.png", cache)).convert("RGBA")
    princess.save(OUT / "princess-red.png")
    blue_princess = OUT / "_tmp-princess-blue.png"
    shift_red_to_blue(fetch("princess_red.png", cache), blue_princess)
    mirror(blue_princess, OUT / "princess-blue.png")
    blue_princess.unlink()
    for name, source in TOWER_TROOPS.items():
        troop = Image.open(fetch(source, cache)).convert("RGBA")
        build_side_tower(princess, troop).save(OUT / f"princess-{name}-red.png")
        tmp = OUT / f"_tmp-princess-{name}-blue.png"
        shift_red_to_blue(OUT / f"princess-{name}-red.png", tmp)
        mirror(tmp, OUT / f"princess-{name}-blue.png")
        tmp.unlink()

    for name in sorted(os.listdir(OUT)):
        path = OUT / name
        with Image.open(path) as img:
            print(f"{name}: {img.size} {path.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
