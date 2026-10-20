"""Download Clash Royale tower art sources and build a contact sheet.

The wiki has no per-troop side-tower renders, so this pulls every usable
source (authentic red/blue king towers, the princess tower, the neutral crown
tower base, the tower-troop renders and a set of crown tower skins) into
docs/tower-art/ so the art can be edited by hand and dropped back into
frontend/public/towers/.

Run:  python scripts/fetch_tower_art.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "docs" / "tower-art"
CACHE = Path(os.path.join(tempfile.gettempdir(), "cr-assets"))

SOURCES: dict[str, str] = {
    # Authentic king towers (red = front view, blue = back view).
    "king-red-active.png": "https://static.wikia.nocookie.net/clashroyale/images/7/75/King_Tower_Red_Active.png/revision/latest?cb=20210516052849",
    "king-red.png": "https://static.wikia.nocookie.net/clashroyale/images/1/15/King_Tower_Red.png/revision/latest?cb=20210516052835",
    "king-blue-active.png": "https://static.wikia.nocookie.net/clashroyale/images/b/bd/King_Tower_Blue_Active.png/revision/latest?cb=20210516052912",
    "king-blue.png": "https://static.wikia.nocookie.net/clashroyale/images/d/df/King_Tower_Blue.png/revision/latest?cb=20210516052913",
    # Side tower (Archer Princess on the red tower) + neutral tower bases.
    "princess-red.png": "https://static.wikia.nocookie.net/clashroyale/images/6/61/Princesstower.png/revision/latest?cb=20200730101418",
    "crown-tower.png": "https://static.wikia.nocookie.net/clashroyale/images/7/79/Crown_Tower.png/revision/latest?cb=20240319115408",
    "crown-tower-skin.png": "https://static.wikia.nocookie.net/clashroyale/images/0/0d/Crown_Tower_Skin.png/revision/latest?cb=20250305122414",
    # Tower troops (characters that stand on the side tower).
    "troop-tower-princess.png": "https://static.wikia.nocookie.net/clashroyale/images/c/c0/Tower_Princess_Card_Render.png/revision/latest?cb=20250111131321",
    "troop-cannoneer.png": "https://static.wikia.nocookie.net/clashroyale/images/8/86/Cannoneer_card_render.png/revision/latest?cb=20250111131450",
    "troop-dagger-duchess.png": "https://static.wikia.nocookie.net/clashroyale/images/b/b8/Dagger_Duchess_card_render.png/revision/latest?cb=20250111130757",
    "troop-royal-chef.png": "https://static.wikia.nocookie.net/clashroyale/images/6/61/Royale_Chef_Card_Render.png/revision/latest?cb=20250111133726",
    # The blue king character (portrait for the Decks > Towers tab).
    "king-blue-character.png": "https://static.wikia.nocookie.net/clashroyale/images/6/67/Blue_King_New.png/revision/latest?cb=20251223132327",
    # Crown tower skins - style references for the side towers.
    "skin-archer-queen.png": "https://static.wikia.nocookie.net/clashroyale/images/c/ce/Archer_Queen_Tower.png/revision/latest?cb=20240612083013",
    "skin-archer-tower.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/2/20/Archer_Tower.jpeg/revision/latest?cb=20230331091818",
    "skin-golden-knight.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/4/47/Golden_Knight_Tower.jpeg/revision/latest?cb=20220101142319",
    "skin-bandit.png": "https://static.wikia.nocookie.net/clashroyale/images/6/65/Bandit_Tower.png/revision/latest?cb=20250805153848",
    "skin-skeleton-king.jpg": "https://static.wikia.nocookie.net/clashroyale/images/2/24/Skeleton_King_Tower.jpg/revision/latest?cb=20211115085756",
    "skin-party-hut.png": "https://static.wikia.nocookie.net/clashroyale/images/4/4f/Party_Hut_Tower.png/revision/latest?cb=20200226202535",
    "skin-royal-arena.png": "https://static.wikia.nocookie.net/clashroyale/images/d/d0/Royal_Arena_Tower.png/revision/latest?cb=20240612084227",
    "skin-mighty-miner.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/5/54/Mighty_Miner_Tower.jpeg/revision/latest?cb=20220330013810",
    "skin-hog-head.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/d/d5/Hog_Head_Tower.jpeg/revision/latest?cb=20230504115230",
    "skin-sandcastle.png": "https://static.wikia.nocookie.net/clashroyale/images/3/34/Sandcastle_Tower.png/revision/latest?cb=20240404102010",
    "skin-tiki.png": "https://static.wikia.nocookie.net/clashroyale/images/d/d6/Tiki_Tower.png/revision/latest?cb=20240806185447",
    "skin-pancake.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/5/5a/Pancake_Tower.jpeg/revision/latest?cb=20220704142147",
    "skin-shark-tank.png": "https://static.wikia.nocookie.net/clashroyale/images/3/31/Shark_Tank_Tower.png/revision/latest?cb=20240404101958",
    "skin-western-sheriff.png": "https://static.wikia.nocookie.net/clashroyale/images/1/19/Western_Sheriff.png/revision/latest?cb=20241111210213",
    "skin-mega-knight.png": "https://static.wikia.nocookie.net/clashroyale/images/1/10/Mega_Knight_Tower.png/revision/latest?cb=20240612081629",
    "skin-pekka.png": "https://static.wikia.nocookie.net/clashroyale/images/8/86/PEKKA_Tower.png/revision/latest?cb=20240612082427",
    "skin-night-witch.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/7/75/Night_Witch_Tower.jpeg/revision/latest?cb=20221002040504",
    "skin-magic-archer.jpg": "https://static.wikia.nocookie.net/clashroyale/images/0/01/Magic_Archer_Tower.jpg/revision/latest?cb=20230219044604",
    "skin-ram-part.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/3/3b/Ram-part_Tower.jpeg/revision/latest?cb=20221105054422",
    "skin-monk-mantlet.jpeg": "https://static.wikia.nocookie.net/clashroyale/images/5/54/Monk%E2%80%99s_Mantlet_Tower.jpeg/revision/latest?cb=20211115085756",
}


def fetch(name: str, url: str) -> bool:
    target = OUT / name
    if target.exists() and target.stat().st_size > 0:
        return True
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / name
    if not cached.exists():
        request = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0 (CR-Clone asset fetch)"}
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310
                cached.write_bytes(response.read())
        except Exception as error:  # noqa: BLE001
            print(f"  MISS {name}: {error}")
            return False
    target.write_bytes(cached.read_bytes())
    return True


def build_contact_sheet() -> None:
    """One PNG with every downloaded source, labelled."""
    files = sorted(p for p in OUT.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"})
    if not files:
        return
    cell_w, cell_h = 200, 240
    cols = 6
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (24, 26, 32))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(files):
        try:
            with Image.open(path) as raw:
                image = raw.convert("RGBA")
                image.thumbnail((cell_w - 16, cell_h - 40), Image.LANCZOS)
                x = (index % cols) * cell_w + (cell_w - image.width) // 2
                y = (index // cols) * cell_h + 8
                checker = Image.new("RGBA", image.size, (60, 62, 70, 255))
                checker.alpha_composite(image)
                sheet.paste(checker.convert("RGB"), (x, y))
                draw.text(((index % cols) * cell_w + 6, (index // cols) * cell_h + cell_h - 26), path.name[:30], fill=(220, 220, 230))
        except Exception as error:  # noqa: BLE001
            print(f"  SKIP {path.name}: {error}")
    sheet.save(OUT / "contact-sheet.png")
    print(f"contact sheet: {OUT / 'contact-sheet.png'}")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    ok = 0
    for name, url in SOURCES.items():
        if fetch(name, url):
            ok += 1
        else:
            print(f"  FAILED {name}")
    print(f"downloaded {ok}/{len(SOURCES)} sources into {OUT}")
    build_contact_sheet()
    return 0


if __name__ == "__main__":
    sys.exit(main())
