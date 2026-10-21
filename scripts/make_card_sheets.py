"""Build the 4x5 sprite sheet for every card of the catalogue.

The sheets are rendered from real 3D models (KayKit, CC0) so that every one
of the 20 cells shows **the same character** with a **real** walk and attack
motion - the old pipeline warped a single still image, so the legs never
articulated.

For every card the sheet is 480x384 (96x96 cells, 5 columns x 4 rows):

    row 1  red  - walk   (front view)
    row 2  red  - attack (front view, the red / fire magic)
    row 3  blue - walk   (back view)
    row 4  blue - attack (back view, the blue / ice magic)

Pipeline:

    1. `scripts/fetch_card_models.py` downloads the CC0 model kit (cached).
    2. Blender renders the 20 frames of a card
       (`scripts/blender/render_card_sheet.py`).
    3. This script packs the frames into `docs/card-art/sheets/<card>.png`
       (480x384, white background) and records the provenance in
       `docs/card-art/SHEET_SOURCES.json`.

Run from the repo root:

    python scripts/make_card_sheets.py                 # every card
    python scripts/make_card_sheets.py knight wizard   # only some cards
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC_FILE = ROOT / "scripts" / "card-sheets" / "spec.py"
SHEET_DIR = ROOT / "docs" / "card-art" / "sheets"
SOURCES_FILE = ROOT / "docs" / "card-art" / "SHEET_SOURCES.json"
FRAMES_DIR = Path.home() / "AppData" / "Local" / "Temp" / "cr-assets" / "card-frames"
MODEL_CACHE = Path.home() / "AppData" / "Local" / "Temp" / "cr-assets" / "card-models"
BLENDER = Path.home() / "AppData" / "Local" / "Temp" / "cr-assets" / "blender" / "blender-4.5.14-windows-x64" / "blender.exe"
RENDERER = ROOT / "scripts" / "blender" / "render_card_sheet.py"

CELL = 96
COLS = 5
ROWS = 4

CHARACTERS = {
    "knight": ("kaykit-adventures", "addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb"),
    "barbarian": ("kaykit-adventures", "addons/kaykit_character_pack_adventures/Characters/gltf/Barbarian.glb"),
    "mage": ("kaykit-adventures", "addons/kaykit_character_pack_adventures/Characters/gltf/Mage.glb"),
    "rogue": ("kaykit-adventures", "addons/kaykit_character_pack_adventures/Characters/gltf/Rogue.glb"),
    "rogue_hooded": ("kaykit-adventures", "addons/kaykit_character_pack_adventures/Characters/gltf/Rogue_Hooded.glb"),
    "skeleton_warrior": ("kaykit-skeletons", "addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Warrior.glb"),
    "skeleton_mage": ("kaykit-skeletons", "addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Mage.glb"),
    "skeleton_rogue": ("kaykit-skeletons", "addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Rogue.glb"),
    "skeleton_minion": ("kaykit-skeletons", "addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Minion.glb"),
}

ASSET_DIRS = {
    "kaykit-adventures": "addons/kaykit_character_pack_adventures/Assets/gltf",
    "kaykit-skeletons": "addons/kaykit_character_pack_skeletons/Assets/gltf",
}


def model_path(name: str) -> str:
    pack, rel = CHARACTERS[name]
    return str(MODEL_CACHE / pack / rel)


def asset_path(pack: str, asset: str) -> str:
    return str(MODEL_CACHE / pack / ASSET_DIRS[pack] / f"{asset}.gltf")


def find_blender() -> str | None:
    if BLENDER.exists():
        return str(BLENDER)
    found = shutil.which("blender")
    if found:
        return found
    for base in (Path.home() / "AppData" / "Local" / "Temp" / "cr-assets" / "blender",):
        if base.exists():
            for exe in base.rglob("blender.exe"):
                return str(exe)
    return None


def build_job(spec: dict, only: list[str]) -> list[dict]:
    job: list[dict] = []
    for card_id, card in spec.items():
        if only and card_id not in only:
            continue
        entry = dict(card)
        entry["id"] = card_id
        entry["out"] = str(FRAMES_DIR)
        if entry.get("model"):
            entry["model"] = model_path(entry["model"])
        weapon = entry.get("weapon")
        if weapon:
            pack = weapon.pop("pack", "kaykit-adventures")
            weapon["file"] = asset_path(pack, weapon["asset"])
            weapon.setdefault("mesh", weapon["asset"])
        job.append(entry)
    return job


def run_blender(job: list[dict], blender: str) -> set[str]:
    """Render the cards, returns the ids that failed."""
    job_file = FRAMES_DIR / "job.json"
    job_file.parent.mkdir(parents=True, exist_ok=True)
    job_file.write_text(json.dumps(job, indent=1), encoding="utf-8")
    command = [
        blender,
        "--background",
        "--factory-startup",
        "--python",
        str(RENDERER),
        "--",
        str(job_file),
        str(FRAMES_DIR),
    ]
    print(f"[sheets] rendering {len(job)} cards with Blender ...", flush=True)
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    failed: set[str] = set()
    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip()
        if line.startswith("[sheet]"):
            print(" ", line, flush=True)
            if "FAILED" in line:
                failed.add(line.split()[1].rstrip(":"))
    if process.wait() != 0:
        raise SystemExit(f"blender failed with code {process.returncode}")
    return failed


def pack_sheet(card_id: str) -> tuple[Path, dict]:
    """Pack the 20 rendered frames into one 480x384 sheet + a quality report."""
    sys.path.insert(0, str(ROOT / "scripts"))
    from make_card_sprites_from_sheet import background_mask

    src = FRAMES_DIR / card_id
    sheet = Image.new("RGB", (COLS * CELL, ROWS * CELL), (255, 255, 255))
    report = {"empty": [], "unstable": []}
    heights: list[list[int]] = []
    for row in range(ROWS):
        row_heights = []
        for col in range(COLS):
            frame_path = src / f"r{row}c{col}.png"
            if not frame_path.exists():
                report["empty"].append(f"r{row}c{col}")
                row_heights.append(0)
                continue
            with Image.open(frame_path) as raw:
                frame = raw.convert("RGB").resize((CELL, CELL), Image.LANCZOS)
            sheet.paste(frame, (col * CELL, row * CELL))
            pixels = np.asarray(frame)
            mask = ~background_mask(pixels[:, :, :3])
            rows = np.nonzero(mask.any(axis=1))[0]
            if rows.size == 0:
                report["empty"].append(f"r{row}c{col}")
                row_heights.append(0)
            else:
                row_heights.append(int(rows[-1] - rows[0]))
        heights.append(row_heights)
    for row in range(ROWS):
        values = [h for h in heights[row] if h > 0]
        if len(values) >= 3 and max(values) / max(1, min(values)) > 2.4:
            report["unstable"].append(f"row{row + 1}")
    out = SHEET_DIR / f"{card_id}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)
    return out, report


def load_spec() -> dict:
    """The per-card recipe lives in `scripts/card-sheets/spec.py`."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("card_sheet_spec", SPEC_FILE)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load {SPEC_FILE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SPEC


def main() -> None:
    args = sys.argv[1:]
    pack_only = "--pack-only" in args
    only = [a for a in args if not a.startswith("--")]
    spec = load_spec()
    blender = find_blender()
    if not blender and not pack_only:
        raise SystemExit(
            "Blender not found. Download a portable Blender 4.5 into "
            "%LOCALAPPDATA%\\Temp\\cr-assets\\blender or install it on PATH."
        )
    if not pack_only:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "fetch_card_models.py")], check=True)

    job = build_job(spec, only)
    if not job:
        raise SystemExit("no cards selected")
    failed: set[str] = set()
    if not pack_only:
        # a stale frame must never end up in a sheet
        for entry in job:
            shutil.rmtree(FRAMES_DIR / entry["id"], ignore_errors=True)
        failed = run_blender(job, blender)

    sources: dict = {}
    if SOURCES_FILE.exists():
        sources = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    sources.setdefault("cards", {})

    failures = 0
    for entry in job:
        card_id = entry["id"]
        if card_id in failed:
            print(f"[sheet] {card_id}: RENDER FAILED")
            failures += 1
            continue
        out, report = pack_sheet(card_id)
        card_spec = spec[card_id]
        sources["cards"][card_id] = {
            "sheet": f"docs/card-art/sheets/{card_id}.png",
            "size": [COLS * CELL, ROWS * CELL],
            "source": "kaykit-cc0-3d-render" if card_spec.get("model") else "procedural-3d-primitives",
            "model": card_spec.get("model"),
            "gear": card_spec.get("gear", []),
            "weapon": card_spec.get("weapon", {}).get("asset"),
            "walk": card_spec.get("walk"),
            "attack": card_spec.get("attack"),
            "licence": "CC0-1.0 (KayKit character packs) / original procedural geometry",
            "tool": "Blender 4.5 LTS (EEVEE)",
            "date": "2026-10-21",
            "quality": report,
        }
        status = "ok"
        if report["empty"]:
            status = f"EMPTY {report['empty']}"
            failures += 1
        elif report["unstable"]:
            status = f"UNSTABLE {report['unstable']}"
        print(f"[sheet] {card_id}: {status}")
    sources["generated"] = "2026-10-21"
    SOURCES_FILE.write_text(json.dumps(sources, indent=1), encoding="utf-8")
    print(f"[sheets] {len(job)} sheets written to {SHEET_DIR} ({failures} with empty cells)")


if __name__ == "__main__":
    main()
