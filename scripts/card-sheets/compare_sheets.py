"""Compare every generated sheet with the original card render.

For each card this builds a review image:

    [ the wiki render (the reference) | walk frame | attack frame ]

so the mapping can be checked card by card before a sheet is shipped.

Run:

    python scripts/card-sheets/compare_sheets.py                # every card
    python scripts/card-sheets/compare_sheets.py knight wizard   # some cards
    python scripts/card-sheets/compare_sheets.py --all          # every card
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / "docs" / "card-art" / "sheets"
SOURCES = ROOT / "docs" / "card-art" / "sources"
OUT = ROOT / "docs" / "card-art" / "review"

CELL = 96
PER_PAGE = 12


def reference(card_id: str) -> Image.Image | None:
    for name in (f"{card_id}-front.png", f"{card_id}-front.jpg", f"{card_id}-front.webp"):
        path = SOURCES / name
        if path.exists():
            with Image.open(path) as raw:
                return raw.convert("RGBA")
    return None


def square(image: Image.Image, size: int = CELL) -> Image.Image:
    out = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    copy = image.copy()
    copy.thumbnail((size, size), Image.LANCZOS)
    out.alpha_composite(copy, ((size - copy.width) // 2, (size - copy.height) // 2))
    return out.convert("RGB")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ids = sorted(p.stem for p in SHEETS.glob("*.png")) if not args else args
    OUT.mkdir(parents=True, exist_ok=True)
    for page in range(0, len(ids), PER_PAGE):
        chunk = ids[page : page + PER_PAGE]
        sheet = Image.new("RGB", (CELL * 3 + 40, (CELL + 18) * len(chunk)), (235, 235, 235))
        draw = ImageDraw.Draw(sheet)
        for row, card_id in enumerate(chunk):
            y = row * (CELL + 18)
            draw.text((4, y + 2), card_id, fill=(0, 0, 0))
            ref = reference(card_id)
            if ref is not None:
                sheet.paste(square(ref), (100, y + 18))
            sheet_path = SHEETS / f"{card_id}.png"
            if sheet_path.exists():
                with Image.open(sheet_path) as raw:
                    sheet_image = raw.convert("RGB")
                sheet.paste(sheet_image.crop((0, 0, CELL, CELL)), (100 + CELL, y + 18))
                sheet.paste(sheet_image.crop((0, CELL, CELL, CELL * 2)), (100 + CELL * 2, y + 18))
        out = OUT / f"review-{page // PER_PAGE:02d}.png"
        sheet.save(out)
        print(f"wrote {out} ({', '.join(chunk)})")


if __name__ == "__main__":
    main()
