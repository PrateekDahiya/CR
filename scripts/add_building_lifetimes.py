"""Add building lifetimes to the generated card tables without touching stats.

`scripts/generate_card_table.py` re-derives every card's HP/damage from
rarity+elixir, which does NOT reproduce the values currently checked in (those
were hand-adjusted after generation). Re-running the generator would silently
rewrite balance data for all 108 cards, so lifetimes are applied surgically
here instead: insert `durationMs` into building entries only.

Safe to re-run: entries that already carry `durationMs` are left untouched.

    python scripts/add_building_lifetimes.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLES = [
    ROOT / "backend" / "src" / "game" / "cards.generated.ts",
    ROOT / "frontend" / "lib" / "cards.generated.ts",
]

# Clash Royale tournament-standard building lifetimes (ms).
LIFETIMES = {
    # spawners
    "barbarian-hut": 30000,
    "goblin-hut": 30000,
    "furnace": 30000,
    "tombstone": 30000,
    "goblin-drill": 30000,
    "elixir-collector": 30000,
    "goblin-cage": 30000,
    # defensive / siege
    "cannon": 30000,
    "mortar": 30000,
    "x-bow": 30000,
    "bomb-tower": 30000,
    "tesla": 40000,
    "inferno-tower": 40000,
}


def patch(text: str) -> tuple[str, int, int]:
    changed = 0
    existing = 0
    out_lines: list[str] = []
    current_id: str | None = None
    building = False

    for line in text.splitlines(keepends=True):
        id_match = re.search(r'id:\s*"([a-z0-9\-]+)"', line)
        if id_match:
            current_id = id_match.group(1)
            building = False
            out_lines.append(line)
            continue

        # `type` is on the line after `id` for every card entry.
        if 'type: "' in line:
            building = '"building"' in line

        if building and current_id in LIFETIMES:
            if "durationMs:" in line:
                existing += 1
                out_lines.append(line)
                building = False
                continue
            indent = line[: len(line) - len(line.lstrip())]
            # Card entries end with `  },` — insert the lifetime just before.
            if line.strip().startswith("},"):
                out_lines.append(f"{indent}durationMs: {LIFETIMES[current_id]},\n")
                changed += 1
                building = False
        out_lines.append(line)

    return "".join(out_lines), changed, existing


def main() -> int:
    total_added = 0
    for table in TABLES:
        text = table.read_text(encoding="utf-8")
        patched, added, existing = patch(text)
        if added or existing:
            table.write_text(patched, encoding="utf-8")
        total_added += added
        print(f"{table.relative_to(ROOT)}: +{added} lifetimes ({existing} already present)")
    if total_added == 0:
        print("nothing to add", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())