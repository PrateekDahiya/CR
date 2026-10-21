"""Fetch the CC0 3D character kit used to build the card sprite sheets.

The card sprite sheets are rendered from real 3D models so that every frame
of a card shows the *same* character with a *real* walk and attack motion
(the old pipeline warped one still image, so the legs never articulated).

Source: the KayKit character packs by Kay Lousberg (https://kaylousberg.com) -
"Character Pack: Adventurers" and "Character Pack: Skeletons".
Licence: **CC0 1.0 Universal** (public domain, commercial use, no attribution
required). The packs ship rigged characters with 75+ animations each
(walking, running, melee, ranged, spellcasting, death, ...).

Everything is downloaded into the local asset cache (never committed):

    <TEMP>/cr-assets/card-models/kaykit-adventures/...
    <TEMP>/cr-assets/card-models/kaykit-skeletons/...

Run:  python scripts/fetch_card_models.py
"""

from __future__ import annotations

import shutil
import urllib.request
import zipfile
from pathlib import Path

CACHE = Path.home() / "AppData" / "Local" / "Temp" / "cr-assets" / "card-models"

PACKS = {
    "kaykit-adventures": "https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/archive/refs/heads/main.zip",
    "kaykit-skeletons": "https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/archive/refs/heads/main.zip",
}

USER_AGENT = "Mozilla/5.0 (card-art fetch)"


def fetch(name: str, url: str) -> Path:
    target = CACHE / name
    if target.exists():
        return target
    CACHE.mkdir(parents=True, exist_ok=True)
    archive = CACHE / f"{name}.zip"
    if not archive.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=300) as response:
            archive.write_bytes(response.read())
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(CACHE / f"{name}-raw")
    root = next((p for p in (CACHE / f"{name}-raw").iterdir() if p.is_dir()), None)
    if root is None:
        raise RuntimeError(f"{name}: unexpected archive layout")
    shutil.move(str(root), str(target))
    shutil.rmtree(CACHE / f"{name}-raw", ignore_errors=True)
    archive.unlink(missing_ok=True)
    return target


def main() -> None:
    for name, url in PACKS.items():
        target = fetch(name, url)
        print(f"{name}: {target}")


if __name__ == "__main__":
    main()
