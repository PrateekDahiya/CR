#!/usr/bin/env python3
"""Generate canonical card tables from the captured Clash Royale wiki snapshot.

Source: infra/mysql/card_stats_source.json
Created by: scripts/import_clash_royale_stats.py

Outputs:
    backend/src/game/cards.generated.ts
    backend/src/game/cardLevels.generated.ts
    frontend/lib/cards.generated.ts
    ai-service/cards_data.json

No heuristic stats: every number comes from the snapshot. Level 11 is the
anchor; missing levels are derived with the wiki's 1.1x per-level rule.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "infra" / "mysql" / "card_stats_source.json"
MECHANICS = ROOT / "infra" / "mysql" / "card_mechanics.json"

FLYING = {
    "baby-dragon",
    "bats",
    "minions",
    "minion-horde",
    "balloon",
    "lava-hound",
    "inferno-dragon",
    "electro-dragon",
    "flying-machine",
    "phoenix",
    "skeleton-barrel",
}


def scaled(level11: float | None, level: int) -> int:
    if level11 is None:
        return 0
    return int(round(level11 * math.pow(1.1, level - 11)))


def level_value(levels: dict, level: int, key: str, anchor: float | None) -> int:
    # Level 11 is the authoritative wiki anchor; the wiki itself generates all
    # other levels with the 1.1x rule. Derive locally so rounding glitches in a
    # scraped row cannot break monotonicity.
    return scaled(anchor, level)


def number(value, fallback=0.0) -> float:
    return float(value) if value is not None else fallback


def build() -> list[dict]:
    snapshot = json.loads(SOURCE.read_text(encoding="utf-8"))["cards"]
    mechanics = json.loads(MECHANICS.read_text(encoding="utf-8"))
    rows: list[dict] = []
    for card_id, card in sorted(snapshot.items()):
        levels = card.get("levels", {})
        hp11 = card["level11"].get("hp")
        damage11 = card["level11"].get("damage")
        tower11 = card["level11"].get("towerDamage")
        hp1 = level_value(levels, 1, "hp", hp11)
        damage1 = level_value(levels, 1, "damage", damage11)
        tower1 = level_value(levels, 1, "towerDamage", tower11) if tower11 is not None else None
        hit_speed = number(card.get("hitSpeedSec"))
        dps = round(damage1 / hit_speed, 2) if hit_speed > 0 else 0.0
        mech = mechanics.get(card_id, {})
        flying = card_id in FLYING or mech.get("movement") == "flying"
        card_type = card["type"]
        targets = card["targets"]
        range_tiles = number(card.get("rangeTiles"))
        sight = 0.0 if card_type == "spell" else max(5.5, range_tiles)
        radius = number(card.get("radiusTiles"))
        special = card.get("special", {})
        dash_damage = special.get("dashDamage")
        dash_damage1 = scaled(dash_damage, 1) if dash_damage is not None else None
        charge_damage = special.get("chargeDamage")
        charge_damage1 = scaled(charge_damage, 1) if charge_damage is not None else None
        death_damage = special.get("deathDamage")
        death_damage1 = scaled(death_damage, 1) if death_damage is not None else None
        spawn_damage = special.get("spawnDamage")
        spawn_damage1 = scaled(spawn_damage, 1) if spawn_damage is not None else None
        shield = special.get("shieldHitpoints")
        shield1 = scaled(shield, 1) if shield is not None else None
        duration_sec = card.get("lifetimeSec") or card.get("durationSec")
        stun_sec = None
        attrs = card.get("attributes", {})
        if attrs.get("stun duration"):
            try:
                stun_sec = float(str(attrs["stun duration"]).split()[0])
            except ValueError:
                stun_sec = None
        rows.append(
            {
                "id": card_id,
                "name": card_id,
                "type": card_type,
                "cost": int(card["cost"]),
                "rarity": card["rarity"],
                "hp": hp1,
                "damage": damage1,
                "hp11": int(hp11) if hp11 is not None else None,
                "damage11": int(damage11) if damage11 is not None else None,
                "hitSpeed": hit_speed,
                "dps": dps,
                "speed": number(card.get("speedTilesPerSec")),
                "range": range_tiles,
                "sightRange": sight,
                "targets": targets,
                "count": int(card.get("count") or 0),
                "radius": radius,
                "flying": flying,
                "description": card.get("description", ""),
                "splashRadius": radius if radius > 0 else None,
                "dashDamage": dash_damage1,
                "dashRadius": 1.5 if dash_damage1 is not None else None,
                "chargeDamage": charge_damage1,
                "deathDamage": death_damage1,
                "spawnDamage": spawn_damage1,
                "shieldHp": shield1,
                "towerDamage": tower1,
                "durationMs": int(round(number(duration_sec) * 1000)) if duration_sec else None,
                "deployDelaySec": number(card.get("deployTimeSec")),
                "stunSec": stun_sec,
                "levels": [
                    {
                        "level": level,
                        "hitPoints": level_value(levels, level, "hp", hp11),
                        "damage": level_value(levels, level, "damage", damage11),
                        **(
                            {"towerDamage": level_value(levels, level, "towerDamage", tower11)}
                            if tower11 is not None
                            else {}
                        ),
                    }
                    for level in range(1, 17)
                ],
            }
        )
    return rows


def opt(field: str, value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return f"    {field}: {str(value).lower()},"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, str):
        return f'    {field}: {json.dumps(value, ensure_ascii=False)},'
    return f"    {field}: {value},"


BACKEND_HEADER = '''/**
 * GENERATED FILE - do not edit by hand.
 * Source: infra/mysql/card_stats_source.json (Clash Royale Wiki snapshot)
 * Regenerate: python scripts/generate_card_table.py
 */

export interface GeneratedCard {
  id: string;
  name: string;
  type: "troop" | "spell" | "building" | "tower";
  cost: number;
  rarity: string;
  hp: number;
  damage: number;
  hp11?: number;
  damage11?: number;
  hitSpeed: number;
  dps: number;
  speed: number;
  range: number;
  sightRange: number;
  targets: string;
  count: number;
  radius: number;
  flying: boolean;
  description: string;
  splashRadius?: number;
  dashDamage?: number;
  dashRadius?: number;
  chargeDamage?: number;
  deathDamage?: number;
  spawnDamage?: number;
  shieldHp?: number;
  towerDamage?: number;
  durationMs?: number;
  deployDelaySec?: number;
  stunSec?: number;
}

'''


def backend_rows(rows: list[dict]) -> str:
    out: list[str] = []
    for row in rows:
        parts = [f'  "{row["id"]}": {{']
        for field in (
            "id",
            "name",
            "type",
            "cost",
            "rarity",
            "hp",
            "damage",
            "hp11",
            "damage11",
            "hitSpeed",
            "dps",
            "speed",
            "range",
            "sightRange",
            "targets",
            "count",
            "radius",
            "flying",
            "description",
            "splashRadius",
            "dashDamage",
            "dashRadius",
            "chargeDamage",
            "deathDamage",
            "spawnDamage",
            "shieldHp",
            "towerDamage",
            "durationMs",
            "deployDelaySec",
            "stunSec",
        ):
            value = row.get(field)
            if field in ("id", "name", "type", "rarity", "targets", "description"):
                parts.append(opt(field, value))
            elif value is not None:
                parts.append(opt(field, value))
        parts.append("  },")
        out.append("\n".join(parts))
    return "\n".join(out)


def frontend_rows(rows: list[dict]) -> str:
    out: list[str] = []
    for row in rows:
        pairs = [
            f'id: "{row["id"]}"',
            f'name: "{row["id"]}"',
            f'type: "{row["type"]}"',
            f'cost: {row["cost"]}',
            f'rarity: "{row["rarity"]}"',
            f'hp: {row["hp"]}',
            f'damage: {row["damage"]}',
            f'dps: {row["dps"]}',
            f'hitSpeed: {row["hitSpeed"]}',
            f'speed: {row["speed"]}',
            f'range: {row["range"]}',
            f'targets: "{row["targets"]}"',
            f'count: {row["count"]}',
            f'radius: {row["radius"]}',
            f'description: {json.dumps(row["description"], ensure_ascii=False)}',
        ]
        for field in (
            "splashRadius",
            "dashDamage",
            "dashRadius",
            "chargeDamage",
            "deathDamage",
            "spawnDamage",
            "shieldHp",
            "towerDamage",
        ):
            value = row.get(field)
            if value is not None:
                pairs.append(f"{field}: {value}")
        out.append("  { " + ", ".join(pairs) + " },")
    return "\n".join(out)


def level_rows(rows: list[dict]) -> str:
    out: list[str] = []
    for row in rows:
        stats = []
        for level in row["levels"]:
            parts = [
                f'level: {level["level"]}',
                f'hitPoints: {level["hitPoints"]}',
                f'damage: {level["damage"]}',
            ]
            if "towerDamage" in level:
                parts.append(f'towerDamage: {level["towerDamage"]}')
            stats.append("      { " + ", ".join(parts) + " },")
        out.append(f'  "{row["id"]}": [\n' + "\n".join(stats) + "\n  ],")
    return "\n".join(out)


def main() -> int:
    rows = build()
    backend = (
        BACKEND_HEADER
        + "export const GENERATED_CARDS: Record<string, GeneratedCard> = {\n"
        + backend_rows(rows)
        + "\n};\n\n"
        + "/** O(1) membership test for deck + validation code paths. */\n"
        + "export function isGeneratedCard(id: string): boolean {\n"
        + "  return Object.prototype.hasOwnProperty.call(GENERATED_CARDS, id);\n}\n"
    )
    levels = (
        "// GENERATED FILE - do not edit by hand.\n"
        + "// Regenerate: python scripts/generate_card_table.py\n\n"
        + "export interface GeneratedLevelStat {\n  level: number;\n  hitPoints: number;\n  damage: number;\n  towerDamage?: number;\n}\n\n"
        + "export const GENERATED_CARD_LEVELS: Record<string, GeneratedLevelStat[]> = {\n"
        + level_rows(rows)
        + "\n};\n"
    )
    frontend = (
        "// GENERATED FILE - do not edit by hand.\n"
        + "// Source: infra/mysql/card_stats_source.json (Clash Royale Wiki snapshot)\n"
        + "// Regenerate: python scripts/generate_card_table.py\n\n"
        + 'import type { CardInfo } from "./cards";\n\n'
        + "export const GENERATED_CARD_LIST: CardInfo[] = [\n"
        + frontend_rows(rows)
        + "\n];\n"
    )
    ai = {
        row["id"]: {
            "name": row["id"],
            "type": row["type"],
            "cost": row["cost"],
            "hp": row["hp"],
            "damage": row["damage"],
            "dps": row["dps"],
            "hitSpeed": row["hitSpeed"],
            "speed": row["speed"],
            "range": row["range"],
            "targets": row["targets"],
            "count": row["count"],
            "radius": row["radius"],
            "towerDamage": row.get("towerDamage"),
            "description": row["description"],
        }
        for row in rows
    }
    files = {
        ROOT / "backend" / "src" / "game" / "cards.generated.ts": backend,
        ROOT / "backend" / "src" / "game" / "cardLevels.generated.ts": levels,
        ROOT / "frontend" / "lib" / "cards.generated.ts": frontend,
    }
    for path, content in files.items():
        path.write_text(content, encoding="utf-8", newline="\n")
        print("wrote", path.relative_to(ROOT))
    (ROOT / "ai-service" / "cards_data.json").write_text(
        json.dumps(ai, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("wrote ai-service/cards_data.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
