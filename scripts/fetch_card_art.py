"""Fetch the Clash Royale wiki card art sources for every catalogue card.

Mirror of `scripts/fetch_tower_art.py` for the 108-card catalogue: for every
card we download the best available ONLINE source into `docs/card-art/sources/`
and build a contact sheet so the art can be reviewed and hand-edited.

Per card we look for two things:

  * `<Card> card render.png`  - the high resolution character render. This is
    the FRONT view (the red team sees the character face on, exactly like the
    red king tower).
  * `<Card> Preview.gif`       - the short in-game battle clip the wiki ships
    for every card. It is the reference for the movement animation and the
    source a human would edit if the automatic strip is not good enough.

The wiki publishes no back views for troops (only the towers have a blue
"seen from behind" render), so the back view for the blue team is derived by
`scripts/make_card_art.py` exactly like the princess tower was.

Outputs:
    docs/card-art/sources/<card>-front.<ext>   character render (front view)
    docs/card-art/sources/<card>-preview.gif   in-game animation clip
    docs/card-art/sources.json                 manifest (url + local file)
    docs/card-art/contact-sheet.png            contact sheet of the front art
    docs/card-art/contact-sheet-preview.png    contact sheet of the clips

Run:  python scripts/fetch_card_art.py
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageSequence

API = "https://clashroyale.fandom.com/api.php"
REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "docs" / "card-art"
SRC = OUT / "sources"
CACHE = Path.home() / "AppData" / "Local" / "Temp" / "cr-assets" / "card-art"

USER_AGENT = "Mozilla/5.0"

# The checked-in sources are shrunk so the repository stays small; the full
# resolution originals stay in the local cache and can be fetched again from
# the URL stored in sources.json.
SOURCE_MAX_SIDE = 400
PREVIEW_MAX_W = 160
PREVIEW_STEP = 4

# Source file name candidates, best first. The wiki is not consistent: some
# cards use "Card Render", some "card_render", some only "Render", and the
# spell cards only ship the full card tile ("<Card>Card.png").
FRONT_CANDIDATES = (
    "{t} card render.png",
    "{t} Card Render.png",
    "{t}_card_render.png",
    "{t}_Card_Render.png",
    "{n} card render.png",
    "{n}_card_render.png",
    "{t} render.png",
    "{t} Render.png",
    "{t}_render.png",
    "{t}_Render.png",
    "{n}Card.png",
    "{n} Card.png",
    "{t}Card.png",
    "{t} Card.png",
    "{t}.png",
)
PREVIEW_CANDIDATES = (
    "{t} Preview.gif",
    "{t}_Preview.gif",
    "{t} preview.gif",
    "{n} Preview.gif",
)

# Loose matches are only accepted when the name clearly is the card art.
LOOSE_BLOCKLIST = (
    "modifier",
    "shard",
    "counter",
    "decoration",
    "trait",
    "preview",
    "evolut",
    "evo",
    "old",
    "card",
    "image",
    "stoplight",
    "wild",
    "logo",
)


def api(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:  # noqa: S310
        return json.load(response)


def page_images(title: str) -> list[str]:
    """Every image used on a wiki page (file titles, File: prefix)."""
    out: list[str] = []
    cont: dict = {}
    while True:
        params = {
            "action": "query",
            "titles": title,
            "prop": "images",
            "imlimit": "500",
            "format": "json",
        }
        params.update(cont)
        data = api(params)
        for page in data.get("query", {}).get("pages", {}).values():
            for image in page.get("images", []):
                out.append(image["title"])
        if "continue" not in data:
            break
        cont = data["continue"]
    return out


def image_url(file_title: str) -> str | None:
    data = api(
        {
            "action": "query",
            "titles": file_title,
            "prop": "imageinfo",
            "iiprop": "url|size",
            "format": "json",
        }
    )
    for page in data.get("query", {}).get("pages", {}).values():
        info = page.get("imageinfo")
        if info:
            return info[0]["url"]
    return None


def normalise(name: str) -> str:
    """`File:Foo_Bar.png` -> `foo_bar.png` (lower case, no File: prefix)."""
    return name.split(":", 1)[-1].strip().replace(" ", "_").lower()


def pick(candidates: tuple[str, ...], available: set[str], title: str) -> str | None:
    """First candidate that exists on the page (case/underscore tolerant)."""
    lookup = {normalise(a): a for a in available}
    values = {"t": title, "n": title.replace(" ", "")}
    for pattern in candidates:
        wanted = normalise(pattern.format(**values))
        if wanted in lookup:
            return lookup[wanted]
    return None


def pick_loose(available: set[str], title: str) -> str | None:
    """A file named after the card that is not a modifier/shard/etc."""
    stem = normalise(title)
    for name in sorted(available):
        key = normalise(name)
        if not key.startswith(stem):
            continue
        if not key.endswith((".png", ".jpg", ".jpeg")):
            continue
        if any(blocked in key for blocked in LOOSE_BLOCKLIST):
            continue
        return name
    return None


def download(url: str, target: Path) -> bool:
    """Download with retries - the wiki CDN rate-limits bursts with a 403."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / target.name
    if not cached.exists() or cached.stat().st_size == 0:
        last = ""
        for attempt in range(5):
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(request, timeout=180) as response:  # noqa: S310
                    cached.write_bytes(response.read())
                break
            except Exception as error:  # noqa: BLE001
                last = str(error)
                time.sleep(2.0 + attempt * 3.0)
        else:
            print(f"    MISS {url}: {last}")
            return False
        time.sleep(0.25)
    target.write_bytes(cached.read_bytes())
    return True


def shrink_image(path: Path, max_side: int) -> None:
    """Keep the checked-in source small enough for the repository.

    The full resolution original stays in the local cache, so nothing is lost:
    the URL in sources.json can always be fetched again.
    """
    try:
        with Image.open(path) as raw:
            image = raw.convert("RGBA")
            image.thumbnail((max_side, max_side), Image.LANCZOS)
            image.save(path, optimize=True)
    except Exception as error:  # noqa: BLE001
        print(f"    SHRINK FAIL {path.name}: {error}")


def shrink_gif(path: Path, max_width: int, step: int = PREVIEW_STEP) -> None:
    """Downscale the in-game clip so it can live in the repository.

    The clip is stored as an animated WebP (three times smaller than a GIF of
    the same size) - the full resolution original stays in the local cache.
    """
    try:
        with Image.open(path) as raw:
            frames = []
            for index, frame in enumerate(ImageSequence.Iterator(raw)):
                if index % step:
                    continue
                converted = frame.convert("RGBA")
                if converted.width > max_width:
                    height = max(1, int(converted.height * max_width / converted.width))
                    converted = converted.resize((max_width, height), Image.LANCZOS)
                frames.append(converted)
            if not frames:
                return
            frames[0].save(
                path.with_suffix(".webp"),
                save_all=True,
                append_images=frames[1:],
                duration=100,
                loop=0,
                quality=82,
                method=4,
            )
    except Exception as error:  # noqa: BLE001
        print(f"    SHRINK FAIL {path.name}: {error}")


def contact_sheet(files: list[tuple[str, Path]], target: Path, label: str) -> None:
    """One PNG with every source, labelled (same style as the tower sheet)."""
    if not files:
        return
    cell_w, cell_h = 200, 240
    cols = 6
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (24, 26, 32))
    draw = ImageDraw.Draw(sheet)
    for index, (name, path) in enumerate(files):
        try:
            with Image.open(path) as raw:
                image = raw.convert("RGBA")
                image.thumbnail((cell_w - 16, cell_h - 40), Image.LANCZOS)
                x = (index % cols) * cell_w + (cell_w - image.width) // 2
                y = (index // cols) * cell_h + 8
                checker = Image.new("RGBA", image.size, (60, 62, 70, 255))
                checker.alpha_composite(image)
                sheet.paste(checker.convert("RGB"), (x, y))
                draw.text(
                    ((index % cols) * cell_w + 6, (index // cols) * cell_h + cell_h - 26),
                    name[:30],
                    fill=(220, 220, 230),
                )
        except Exception as error:  # noqa: BLE001
            print(f"  SKIP {name}: {error}")
    sheet.save(target, optimize=True)
    print(f"{label}: {target}")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    source_json = json.loads((REPO / "infra" / "mysql" / "card_stats_source.json").read_text(encoding="utf-8"))
    cards = source_json["cards"]

    manifest: dict[str, dict] = {}
    front_files: list[tuple[str, Path]] = []
    preview_files: list[tuple[str, Path]] = []

    for card_id, info in sorted(cards.items()):
        title = info["title"]
        try:
            available = page_images(title)
        except Exception as error:  # noqa: BLE001
            print(f"  PAGE FAIL {card_id}: {error}")
            available = []

        entry: dict[str, object] = {"title": title, "front": None, "preview": None}

        front_title = pick(FRONT_CANDIDATES, set(available), title)
        if front_title is None:
            front_title = pick_loose(set(available), title)
        if front_title is not None:
            url = image_url(front_title)
            if url is not None:
                ext = Path(front_title).suffix.lower() or ".png"
                if ext == ".gif":
                    ext = ".png"
                target = SRC / f"{card_id}-front{ext}"
                if download(url, target):
                    shrink_image(target, SOURCE_MAX_SIDE)
                    entry["front"] = f"sources/{target.name}"
                    entry["frontWiki"] = front_title
                    entry["frontUrl"] = url
                    front_files.append((card_id, target))

        preview_title = pick(PREVIEW_CANDIDATES, set(available), title)
        if preview_title is not None and not preview_title.lower().endswith(".gif"):
            preview_title = None
        if preview_title is not None:
            url = image_url(preview_title)
            if url is not None:
                target = SRC / f"{card_id}-preview.gif"
                if download(url, target):
                    shrink_gif(target, PREVIEW_MAX_W)
                    target.with_suffix(".gif").unlink(missing_ok=True)
                    entry["preview"] = f"sources/{card_id}-preview.webp"
                    entry["previewWiki"] = preview_title
                    entry["previewUrl"] = url
                    preview_files.append((card_id, SRC / f"{card_id}-preview.webp"))

        manifest[card_id] = entry
        print(
            f"{card_id:20s} front={'yes' if entry['front'] else 'NO '} "
            f"preview={'yes' if entry['preview'] else 'NO '}",
            flush=True,
        )

    (OUT / "sources.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"front art: {len(front_files)}/{len(cards)}   preview clips: {len(preview_files)}/{len(cards)}")
    contact_sheet(front_files, OUT / "contact-sheet.png", "contact sheet (front art)")
    contact_sheet(preview_files, OUT / "contact-sheet-preview.png", "contact sheet (preview clips)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
