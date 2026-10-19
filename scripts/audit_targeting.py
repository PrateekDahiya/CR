"""Audit declared targeting masks against Clash Royale's real behaviour.

Phase 15.6. Prints cards whose `targeting` contradicts a known CR fact, so a
building-seeker that attacks troops (Elixir Golemite/Blob) or an anti-air troop
that cannot hit air is caught instead of silently misbehaving in battle.

Expected sets are facts about the real game, not derived from the repository,
so the audit can disagree with the data on purpose.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MECHANICS = json.loads((ROOT / "infra" / "mysql" / "card_mechanics.json").read_text(encoding="utf-8"))
TEMPLATES = json.loads((ROOT / "infra" / "mysql" / "spawn_templates.json").read_text(encoding="utf-8"))

# Cards that ignore troops and go straight for buildings / towers.
BUILDINGS_ONLY = {
    "giant", "royal-giant", "hog-rider", "golem", "elixir-golem", "goblin-giant",
    "battle-ram", "ram-rider", "balloon", "lava-hound", "elixir-golemite",
    "elixir-blob",
}

# Seeks buildings AND troops (Miner can hit either).
BUILDINGS_AND_TROOPS = {"miner"}

# Never attacks: buildings that only spawn, and spells (which use area masks).
NON_ATTACKING = {"goblin-drill", "elixir-collector", "rage", "clone", "void", "goblin-curse"}

# Ground-only melee troops (cannot hit air).
GROUND_ONLY = {
    "giant", "royal-giant", "hog-rider", "golem", "elixir-golem", "goblin-giant",
    "battle-ram", "ram-rider", "knight", "mini-pekka", "pekka", "barbarians",
    "elite-barbarians", "goblins", "bomber", "prince", "dark-prince", "bandit",
}

# Must be able to target flying units.
AIR_CAPABLE = {
    "baby-dragon", "wizard", "valkyrie", "bowler", "electro-dragon", "musketeer",
    "archers", "dart-goblin", "firecracker", "zappies", "minions", "bats",
    "minion-horde", "flying-machine", "inferno-dragon", "sparky",
    "executioner", "magic-archer", "little-prince", "spear-goblins",
}

# Must self-destruct on impact.
SUICIDE = {"fire-spirit", "ice-spirit"}


def main() -> int:
    problems: list[str] = []
    checked = 0

    for card_id, record in sorted(MECHANICS.items()):
        targeting = record.get("targeting")
        attack = record.get("attack")
        checked += 1

        if card_id in BUILDINGS_ONLY and targeting != "buildings":
            problems.append(f"{card_id}: must target buildings only, declared '{targeting}'")
        if card_id in BUILDINGS_AND_TROOPS and targeting != "all":
            problems.append(f"{card_id}: must target buildings AND troops, declared '{targeting}'")
        if card_id in GROUND_ONLY and targeting == "air+ground":
            problems.append(f"{card_id}: ground-only troop declared 'air+ground'")
        if card_id in AIR_CAPABLE and targeting in ("ground", "buildings"):
            problems.append(f"{card_id}: must reach air, declared '{targeting}'")
        if card_id in NON_ATTACKING and attack not in (None, "none"):
            problems.append(f"{card_id}: non-attacking card declared attack '{attack}'")
        if card_id in SUICIDE and attack != "suicide":
            problems.append(f"{card_id}: must declare attack 'suicide', got '{attack}'")

    for child_id, template in sorted(TEMPLATES.items()):
        targets = template.get("targets")
        checked += 1
        if child_id in BUILDINGS_ONLY and targets != "buildings":
            problems.append(f"[template] {child_id}: must target buildings, declared '{targets}'")

    print(f"audited {checked} targeting records (cards + spawn templates)")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("VERDICT: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())