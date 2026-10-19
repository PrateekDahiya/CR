#!/usr/bin/env python3
"""Generate the normative card table for every catalog card (backend + frontend).

Why
---
The catalog lists 108 cards. Every catalog row gets a CardDef (hp, damage,
hitSpeed, range, targets, ...) from one generator, so the backend and frontend
can never drift. Mechanics are loaded separately from MySQL; this file owns
numeric catalog facts only.

The numeric values are deterministic tuning values derived from catalog facts
(type, elixir cost, rarity) plus an archetype table. Same input produces the
same output; runtime behavior is stored in MySQL card_mechanics.

Usage
-----
    python scripts/generate_card_table.py                 # reads localhost:4000
    python scripts/generate_card_table.py --catalog x.json # offline input

Outputs
-------
    backend/src/game/cards.generated.ts
    frontend/lib/cards.generated.ts
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- archetypes (name keyword -> combat profile) -------------------------------
ARCHETYPES = [
    # (keywords,                      role)
    (("golem", "giant", "hog", "ram", "p.e.k.k.a", "pekka", "lavahound", "lava-hound", "elephant", "golemite"), "tank"),
    (("barbarian", "minion", "goblin", "spear", "skeleton", "bomber", "wall-breaker", "wall-breakers"), "swarm"),
    (("wizard", "witch", "musketeer", "archer", "firecracker", "archers", "executioner", "axe", "dark-prince", "duchess", "chef", "monk", "ram-rider"), "support"),
    (("inferno", "fiend", "inferno-dragon", "electro", "electro-giant", "balloon", "dragon", "lavahound", "cannoneer"), "highdps"),
    (("cannon", "tower", "hut", "tesla", "barracks", "trap", "tombstone", "furnace", "spawner", "cage", "machine", "demolisher"), "building"),
    (("flying", "baby-dragon", "bats", "minion-horde", "horde"), "air"),
]

RARITY_HP = {"common": 1.0, "rare": 1.06, "epic": 1.12, "legendary": 1.2, "champion": 1.28}
RARITY_DMG = {"common": 1.0, "rare": 1.05, "epic": 1.1, "legendary": 1.18, "champion": 1.25}

SPELL_RADIUS = {
    "arrows": 4.0,
    "zap": 2.5,
    "fireball": 3.0,
    "firecracker": 2.5,
    "rocket": 3.5,
    "giant-wasp": 2.0,
    "poison": 3.5,
    "graveyard": 4.0,
    "earthquake": 3.0,
    "tornado": 3.0,
    "rage": 3.5,
    "clone": 0.0,
    "royal-delivery": 2.0,
    "lightning": 3.0,
}

FLYING = {"baby-dragon", "bats", "minions", "minion-horde", "balloon", "lava-hound", "lavahound",
          "inferno-dragon", "electro-dragon", "electro-giant", "flying-machine", "three-musketeers",
          "giant-wasp", "night-witch", "bat", "drone", "golemite"}


def role_for(name: str, card_type: str) -> str:
    if card_type == "spell":
        return "spell"
    if card_type == "building":
        return "building"
    low = name.lower()
    for keys, role in ARCHETYPES:
        if any(k in low for k in keys):
            return role
    return "troop"


def stats_for(name: str, card_type: str, cost: int, rarity: str) -> dict:
    c = max(1, min(8, cost))
    hp_m = RARITY_HP.get(rarity, 1.0)
    dmg_m = RARITY_DMG.get(rarity, 1.0)
    role = role_for(name, card_type)

    if role == "spell":
        damage = int(round(115 * (c ** 1.55) * dmg_m))
        radius = SPELL_RADIUS.get(name, 2.5 if c <= 3 else 3.0)
        return dict(hp=0, damage=damage, hitSpeed=0.0, speed=0.0, range=0.0, count=0, radius=radius)

    if role == "building":
        hp = int(round(620 * (c ** 1.25) * hp_m))
        damage = int(round(120 * (c ** 1.3) * dmg_m))
        return dict(hp=hp, damage=damage, hitSpeed=1.2, speed=0.0, range=5.5, count=1, radius=0.0)

    if role == "tank":
        hp = int(round(1500 * (c ** 1.15) * hp_m))
        damage = int(round(130 * (c ** 1.15) * dmg_m))
        return dict(hp=hp, damage=damage, hitSpeed=1.5, speed=0.75 if c >= 5 else 1.0, range=1.2, count=1, radius=0.0)

    if role == "swarm":
        count = 4 if c <= 2 else 3
        hp = int(round(240 * (c ** 1.1) * hp_m))
        damage = int(round(95 * (c ** 1.15) * dmg_m))
        return dict(hp=hp, damage=damage, hitSpeed=1.0, speed=1.45, range=0.8, count=count, radius=0.0)

    if role == "highdps":
        hp = int(round(820 * (c ** 1.2) * hp_m))
        damage = int(round(210 * (c ** 1.35) * dmg_m))
        return dict(hp=hp, damage=damage, hitSpeed=1.4, speed=1.0, range=3.5, count=1, radius=0.0)

    if role == "support":
        hp = int(round(560 * (c ** 1.2) * hp_m))
        damage = int(round(145 * (c ** 1.3) * dmg_m))
        return dict(hp=hp, damage=damage, hitSpeed=1.2, speed=1.0, range=5.5, count=1, radius=0.0)

    # default troop / air
    hp = int(round(760 * (c ** 1.22) * hp_m))
    damage = int(round(135 * (c ** 1.28) * dmg_m))
    speed = 1.0
    hit = 1.2
    rng = 3.0
    count = 1
    radius = 0.0
    if role == "air":
        speed = 1.3
        hit = 1.4
        rng = 4.0
    return dict(hp=hp, damage=damage, hitSpeed=hit, speed=speed, range=rng, count=count, radius=radius)


def build(catalog: list[dict]) -> list[dict]:
    rows = []
    for entry in sorted(catalog, key=lambda e: e["name"]):
        name = entry["name"]
        card_type = entry["cardType"] if entry["cardType"] in ("troop", "spell", "building", "tower") else "troop"
        rarity = entry.get("rarity") or "common"
        catalog_cost = int(entry.get("elixir") or 0)
        stat_cost = 4 if card_type == "tower" and catalog_cost <= 0 else max(catalog_cost, 1)
        st = stats_for(name, "troop" if card_type == "tower" else card_type, stat_cost, rarity)
        cost = catalog_cost if card_type == "tower" else stat_cost
        targets = "all" if card_type == "spell" else ("air+ground" if card_type == "tower" else ("buildings" if role_for(name, card_type) == "building" else "ground"))
        if name in FLYING:
            targets = "air+ground"
        rows.append({
            "id": name,
            "name": name,
            "type": card_type,
            "cost": cost,
            "rarity": rarity,
            "hp": st["hp"],
            "damage": st["damage"],
            "hitSpeed": st["hitSpeed"],
            "dps": round(st["damage"] / st["hitSpeed"], 2) if st["hitSpeed"] > 0 else 0.0,
            "speed": st["speed"],
            "range": st["range"],
            "sightRange": 5.5 if card_type != "spell" else 0.0,
            "targets": targets,
            "count": st["count"],
            "radius": st["radius"],
            "flying": name in FLYING,
            "towerDamage": round(st["damage"] * 0.4, 2) if card_type == "spell" else None,
            "durationMs": 30000 if name == "cannon" else None,
            "stunSec": 0.5 if name == "zap" else None,
        })
    return rows


HEADER = """/**
 * GENERATED FILE - do not edit by hand.
 * Source: {source}
 * Regenerate: python scripts/generate_card_table.py
 *
 * Every catalog card has full battle stats, so all of them are playable.
 * Numeric values are derived deterministically from catalog facts and an
 * archetype tuning profile. Runtime mechanics are loaded from MySQL.
 */
"""


def ts_rows(rows: list[dict]) -> str:
    out = []
    for r in rows:
        flying = "true" if r["flying"] else "false"
        parts = [
            f'  "{r["id"]}": {{',
            f'    id: "{r["id"]}",',
            f'    name: "{r["id"]}",',
            f'    type: "{r["type"]}",',
            f'    cost: {r["cost"]},',
            f'    rarity: "{r["rarity"]}",',
            f'    hp: {r["hp"]},',
            f'    damage: {r["damage"]},',
            f'    hitSpeed: {r["hitSpeed"]},',
            f'    dps: {r["dps"]},',
            f'    speed: {r["speed"]},',
            f'    range: {r["range"]},',
            f'    sightRange: {r["sightRange"]},',
            f'    targets: "{r["targets"]}",',
            f'    count: {r["count"]},',
            f'    radius: {r["radius"]},',
            f'    flying: {flying},',
        ]
        if r["towerDamage"] is not None:
            parts.append(f'    towerDamage: {r["towerDamage"]},')
        if r["durationMs"] is not None:
            parts.append(f'    durationMs: {r["durationMs"]},')
        if r["stunSec"] is not None:
            parts.append(f'    stunSec: {r["stunSec"]},')
        parts.append("  },")
        out.append("\n".join(parts))
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", help="path to a catalog JSON instead of the live API")
    ap.add_argument("--api", default="http://localhost:4000/content/catalog")
    ap.add_argument("--out", default=ROOT)
    args = ap.parse_args()

    if args.catalog:
        with open(args.catalog, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        source = os.path.basename(args.catalog)
    else:
        with urllib.request.urlopen(args.api, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        source = args.api

    catalog = payload.get("catalog") if isinstance(payload, dict) else payload
    if not catalog:
        print("empty catalog", file=sys.stderr)
        return 1
    rows = build(catalog)
    body = ts_rows(rows)

    backend = (
        HEADER.format(source=source)
        + "\nexport interface GeneratedCard {\n"
        + "  id: string;\n  name: string;\n  type: \"troop\" | \"spell\" | \"building\";\n"
        + "  cost: number;\n  rarity: string;\n  hp: number;\n  damage: number;\n"
        + "  hitSpeed: number;\n  dps: number;\n  speed: number;\n  range: number;\n"
        + "  sightRange: number;\n  targets: string;\n  count: number;\n  radius: number;\n"
        + "  flying: boolean;\n  towerDamage?: number;\n  durationMs?: number;\n  stunSec?: number;\n}\n\n"
        + "export const GENERATED_CARDS: Record<string, GeneratedCard> = {\n"
        + body
        + "\n};\n\n"
        + "/** O(1) membership test for deck + validation code paths. */\n"
        + "export function isGeneratedCard(id: string): boolean {\n"
        + "  return Object.prototype.hasOwnProperty.call(GENERATED_CARDS, id);\n}\n"
    )
    frontend = (
        HEADER.format(source=source)
            + "\nimport type { CardInfo } from \"./cards\";\n\n"
        + "/** Full catalog as client-side CardInfo records (same source as the server). */\n"
        + "export const GENERATED_CARD_LIST: CardInfo[] = [\n"
        + "\n".join(
            "  { id: \"%s\", name: \"%s\", type: \"%s\", cost: %d, rarity: \"%s\", hp: %d, damage: %d, dps: %s, hitSpeed: %s, speed: %s, range: %s, targets: \"%s\", count: %d, radius: %s%s },"
            % (
                r["id"], r["id"], r["type"], r["cost"], r["rarity"], r["hp"], r["damage"], r["dps"],
                r["hitSpeed"], r["speed"], r["range"], r["targets"], r["count"], r["radius"],
                (", towerDamage: %s" % r["towerDamage"]) if r["towerDamage"] is not None else "",
            )
            for r in rows
        )
        + "\n];\n"
    )

    files = {
        os.path.join(args.out, "backend", "src", "game", "cards.generated.ts"): backend,
        os.path.join(args.out, "frontend", "lib", "cards.generated.ts"): frontend,
    }
    for path, text in files.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        print("wrote", os.path.relpath(path, args.out), f"({len(rows)} cards)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
