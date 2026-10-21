"""Write the card reference: what every card is and how it is built.

Reads `scripts/card-sheets/spec.py` and writes `docs/card-art/CARDS.md`:

    | card | what it is | model | gear / weapon | walk | attack |

This is the sheet that was checked against the original card renders
(`docs/card-art/sources/<card>-front.png`).

Run:  python scripts/card-sheets/write_card_reference.py
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC_FILE = ROOT / "scripts" / "card-sheets" / "spec.py"
OUT = ROOT / "docs" / "card-art" / "CARDS.md"


def load_spec() -> dict:
    spec = importlib.util.spec_from_file_location("card_sheet_spec", SPEC_FILE)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load {SPEC_FILE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SPEC


def main() -> None:
    spec = load_spec()
    lines = [
        "# The card reference",
        "",
        "Every card of the catalogue, what it is (checked against the original",
        "card render in `docs/card-art/sources/`) and how its sprite sheet is",
        "built.",
        "",
        "The sheets are rendered from the CC0 KayKit 3D models with a real",
        "walk and attack clip - the character is the same model in all 20",
        "frames. The extra bits (wings, bellies, cannons, balloons) are",
        "primitive geometry we build ourselves.",
        "",
        "| card | what it is | model | gear / weapon | walk | attack |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for card_id, card in spec.items():
        gear = ", ".join(card.get("gear", []))
        weapon = card.get("weapon", {}).get("asset", "")
        extra = ", ".join(x for x in (gear, weapon) if x) or "-"
        attachments = card.get("attachments")
        if attachments:
            names = ", ".join(sorted({a.get("name", "?") for a in attachments}))
            extra = f"{extra} (+ {names})" if extra != "-" else f"+ {names}"
        model = card.get("model", "procedural")
        lines.append(
            f"| `{card_id}` | {card.get('desc', '')} | {model} | {extra} | "
            f"`{card.get('walk', '-')}` | `{card.get('attack', '-')}` |"
        )
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT} ({len(spec)} cards)")


if __name__ == "__main__":
    main()
