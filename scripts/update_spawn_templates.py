#!/usr/bin/env python3
"""Update spawned-child templates from the captured wiki snapshot."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "infra" / "mysql" / "card_stats_source.json"
TEMPLATES = ROOT / "infra" / "mysql" / "spawn_templates.json"


def main() -> int:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))["cards"]
    templates = json.loads(TEMPLATES.read_text(encoding="utf-8"))

    def from_card(child: str, parent: str, speed: float | None = None, range_tiles: float | None = None) -> None:
        card = source[parent]
        template = templates.setdefault(child, {"version": 1})
        template.update(
            {
                "hp": int(card["level11"]["hp"] or 0),
                "damage": int(card["level11"]["damage"] or 0),
                "hitSpeedMs": int(round(card["hitSpeedSec"] * 1000)),
                "speed": speed if speed is not None else card["speedTilesPerSec"],
                "range": range_tiles if range_tiles is not None else card["rangeTiles"],
                "sightRange": 5.5,
                "targets": card["targets"],
                "count": 1,
                "flying": child in {"bat", "lava-pup"},
                "attack": "suicide" if child == "fire-spirit" else "single",
            }
        )

    from_card("barbarian", "barbarians")
    from_card("goblin", "goblins")
    from_card("spear-goblin", "spear-goblins")
    from_card("skeleton", "skeletons")
    from_card("bat", "bats", speed=2.0)
    from_card("fire-spirit", "fire-spirit", speed=2.0)
    from_card("royal-recruit", "royal-recruits")

    templates["goblinstein-monster"].update(
        {"hp": 2240, "damage": 128, "hitSpeedMs": 1500, "speed": 1.0, "range": 1.2, "targets": "buildings", "count": 1, "flying": False}
    )
    templates["goblin-brawler"].update(
        {"hp": 1080, "damage": 337, "hitSpeedMs": 1100, "speed": 1.5, "range": 0.8, "targets": "ground", "count": 1, "flying": False}
    )
    templates["guardienne"].update(
        {"hp": 1600, "damage": 217, "hitSpeedMs": 1200, "speed": 1.0, "range": 1.2, "targets": "ground", "count": 1, "flying": False}
    )
    templates["rascal-boy"].update(
        {"hp": 1868, "damage": 217, "hitSpeedMs": 1500, "speed": 1.0, "range": 0.8, "targets": "ground", "count": 1, "flying": False}
    )
    templates["rascal-girl"].update(
        {"hp": 261, "damage": 125, "hitSpeedMs": 1000, "speed": 1.0, "range": 5.0, "targets": "air+ground", "count": 1, "flying": False}
    )
    templates["phoenix-egg"].update(
        {"hp": 240, "damage": 0, "hitSpeedMs": 0, "speed": 0, "range": 0, "targets": "none", "count": 1, "flying": False, "attack": "none"}
    )
    templates["cursed-hog"].update(
        {"hp": 629, "damage": 53, "hitSpeedMs": 1200, "speed": 2.0, "range": 0.75, "targets": "buildings", "count": 1, "flying": False}
    )
    templates["lava-pup"].update(
        {"hp": 217, "damage": 81, "hitSpeedMs": 1700, "speed": 1.0, "range": 1.6, "targets": "air+ground", "count": 1, "flying": True}
    )
    templates["golemite"].update(
        {"hp": 1039, "damage": 84, "hitSpeedMs": 2500, "speed": 0.75, "range": 0.75, "targets": "buildings", "count": 1, "flying": False}
    )
    templates["elixir-golemite"].update(
        {"hp": 762, "damage": 128, "hitSpeedMs": 1100, "speed": 1.0, "range": 0.8, "targets": "buildings", "count": 1, "flying": False}
    )
    templates["elixir-blob"].update(
        {"hp": 360, "damage": 64, "hitSpeedMs": 1100, "speed": 1.0, "range": 0.8, "targets": "buildings", "count": 1, "flying": False}
    )
    templates["rage-field"].update({"onDeploy": [{"kind": "status", "status": "rage", "durationMs": 4500}]})

    TEMPLATES.write_text(json.dumps(templates, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"updated {TEMPLATES} ({len(templates)} templates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
