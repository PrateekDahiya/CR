#!/usr/bin/env python3
"""Reconcile card_mechanics.json with the captured Clash Royale wiki snapshot.

This does not invent new effect kinds. It corrects the data the engine already
understands: targeting, attack shape, radius, spell duration/interval, tower
multipliers, dash/charge/death/spawn damage, shields, and spawn cadence.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "infra" / "mysql" / "card_stats_source.json"
MECHANICS = ROOT / "infra" / "mysql" / "card_mechanics.json"

ATTACK_OVERRIDES = {
    "firecracker": "splash",
    "furnace": "single",
    "royal-ghost": "single",
    "witch": "splash",
}

SPELL_CONFIG = {
    "arrows": {"radius": 3.5, "volleyCount": 3, "intervalMs": 200, "durationMs": 600},
    "barbarian-barrel": {"radius": 2.6, "roll": True},
    "clone": {"radius": 3.0},
    "earthquake": {"radius": 3.5, "durationMs": 3000, "intervalMs": 1000, "buildingMultiplier": 3},
    "fireball": {"radius": 2.5},
    "freeze": {"radius": 3.0, "durationMs": 4000},
    "giant-snowball": {"radius": 2.5, "slowMs": 3000},
    "goblin-barrel": {"spawn": ("goblin", 3), "radius": 1.5},
    "goblin-curse": {"radius": 3.0, "durationMs": 6000, "intervalMs": 1000},
    "graveyard": {"radius": 4.0, "durationMs": 9000, "intervalMs": 500, "maxCount": 15},
    "lightning": {"radius": 3.5, "maxTargets": 3, "stunMs": 500},
    "poison": {"radius": 3.5, "durationMs": 8000, "intervalMs": 1000},
    "rage": {"radius": 3.0, "durationMs": 4500},
    "rocket": {"radius": 2.0, "delayMs": 1000},
    "royal-delivery": {"radius": 3.0, "delayMs": 3000},
    "the-log": {"radius": 3.9, "roll": True},
    "tornado": {"radius": 5.5, "durationMs": 1050, "intervalMs": 350},
    "void": {"radius": 2.5, "durationMs": 4000, "intervalMs": 1333},
    "zap": {"radius": 2.5, "stunMs": 500},
}

DEATH_RADIUS = {
    "balloon": 2.5,
    "bomb-tower": 1.5,
    "giant-skeleton": 3.0,
    "goblin-demolisher": 2.0,
    "golem": 2.0,
    "ice-golem": 2.0,
    "phoenix": 2.0,
    "skeleton-barrel": 2.0,
}

DASH_CARDS = {
    "bandit": "dashDamage",
    "battle-ram": "chargeDamage",
    "boss-bandit": "dashDamage",
    "dark-prince": "chargeDamage",
    "golden-knight": "dashDamage",
    "mega-knight": "spawnDamage",
    "prince": "chargeDamage",
    "ram-rider": "chargeDamage",
}

SPAWN_INTERVALS = {
    "barbarian-hut": 15000,
    "elixir-collector": 13000,
    "furnace": 7000,
    "goblin-drill": 3000,
    "goblin-hut": 2200,
    "tombstone": 4000,
    "witch": 7000,
}

NO_ATTACK = {
    "barbarian-hut",
    "elixir-collector",
    "goblin-cage",
    "goblin-drill",
    "goblin-hut",
    "skeleton-barrel",
    "tombstone",
}

NO_TARGET = {"barbarian-hut", "elixir-collector", "goblin-cage", "goblin-drill", "goblin-hut", "tombstone"}


def first(effects: list[dict], kind: str) -> dict | None:
    for effect in effects:
        if effect.get("kind") == kind:
            return effect
    return None


def main() -> int:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))["cards"]
    mechanics = json.loads(MECHANICS.read_text(encoding="utf-8"))

    for card_id, card in source.items():
        record = mechanics.setdefault(
            card_id,
            {
                "version": 1,
                "attack": "single",
                "targeting": card.get("targets", "all"),
                "movement": "flying" if card.get("type") == "troop" and card_id in {"bats", "minions", "minion-horde", "baby-dragon", "balloon", "lava-hound", "inferno-dragon", "electro-dragon", "flying-machine", "phoenix"} else ("ground" if card.get("type") in ("troop", "building") else None),
                "onDeploy": [],
                "onAttack": [],
                "onHit": [],
                "onDeath": [],
                "periodic": [],
                "ability": [],
            },
        )
        for key in ("onDeploy", "onAttack", "onHit", "onDeath", "periodic", "ability"):
            record.setdefault(key, [])
        card_type = card["type"]

        if card_id in NO_TARGET:
            record["targeting"] = "none"
        elif card_type != "spell":
            record["targeting"] = card["targets"]
        elif record.get("targeting") not in ("friendly", "enemy"):
            record["targeting"] = card["targets"]

        if card_id in NO_ATTACK:
            record["attack"] = "none"
            record["movement"] = "ground" if card_type == "building" else record.get("movement")
        elif card_id in ATTACK_OVERRIDES:
            record["attack"] = ATTACK_OVERRIDES[card_id]

        if card_type == "tower":
            record["towerTroop"] = True
            record["movement"] = None
        if card_type == "spell":
            record["movement"] = None

        radius = card.get("radiusTiles")
        attack = record.get("attack")
        if attack == "splash" and radius:
            for effect in record["onAttack"]:
                if effect.get("kind") == "areaDamage":
                    record["onAttack"].remove(effect)
                    break
            record["radius"] = radius

        if card_type == "spell":
            config = SPELL_CONFIG.get(card_id, {})
            for effect in record["onDeploy"] + record["onAttack"]:
                if not isinstance(effect, dict):
                    continue
                if effect.get("kind") in ("areaDamage", "clone", "status", "chain") and radius:
                    effect["radius"] = radius
                if effect.get("kind") == "areaDamage":
                    if "durationMs" in config:
                        effect["durationMs"] = config["durationMs"]
                    if "intervalMs" in config:
                        effect["intervalMs"] = config["intervalMs"]
                    if "delayMs" in config:
                        effect["delayMs"] = config["delayMs"]
                    if "volleyCount" in config:
                        effect["volleyCount"] = config["volleyCount"]
                    if "buildingMultiplier" in config:
                        effect["buildingMultiplier"] = config["buildingMultiplier"]
                    damage = card["level11"].get("damage")
                    tower = card["level11"].get("towerDamage")
                    if damage and tower:
                        effect["towerMultiplier"] = round(tower / damage, 4)
                if effect.get("kind") == "status" and config.get("stunMs"):
                    effect["durationMs"] = config["stunMs"]
                if effect.get("kind") == "status" and config.get("slowMs"):
                    effect["durationMs"] = config["slowMs"]
                if effect.get("kind") == "chain" and config.get("maxTargets"):
                    effect["maxTargets"] = config["maxTargets"]
            if card_id == "goblin-barrel":
                spawn = first(record["onDeploy"], "spawn")
                if spawn is not None:
                    spawn["count"] = 3
                    spawn["childId"] = "goblin"
            if card_id == "royal-delivery":
                spawn = first(record["onDeploy"], "spawn")
                if spawn is not None:
                    spawn["count"] = 1
                    spawn["childId"] = "royal-recruit"
            if card_id == "graveyard":
                spawn = first(record["onDeploy"], "spawn")
                if spawn is not None:
                    spawn["durationMs"] = 9000
                    spawn["intervalMs"] = 500
                    spawn["maxCount"] = 15
            if card_id in ("rage", "clone"):
                status = first(record["onDeploy"], "status") or first(record["onDeploy"], "clone")
                if status is not None and card_id == "rage":
                    status["durationMs"] = 4500

        if card_id in ("inferno-tower", "inferno-dragon", "mighty-miner"):
            stage_values = []
            for key, value in card["level11"]["columns"]:
                if "stage damage" in key.lower():
                    number = value.replace(",", "").split()[0]
                    try:
                        stage_values.append(float(number))
                    except ValueError:
                        pass
            if stage_values:
                base = card["level11"].get("damage") or stage_values[0]
                multipliers = [round(value / base, 3) for value in stage_values]
                for effect in record["onAttack"]:
                    if effect.get("kind") == "ramp":
                        effect["multipliers"] = multipliers

        if card_id == "mortar":
            for effect in record["onAttack"]:
                if effect.get("kind") == "damage":
                    effect["minimumRange"] = 3.5

        dash_damage = card.get("special", {}).get("dashDamage")
        charge_damage = card.get("special", {}).get("chargeDamage")
        base_damage = card["level11"].get("damage") or 0
        for effect in record["onAttack"]:
            if effect.get("kind") == "dash":
                amount = dash_damage if dash_damage is not None else charge_damage
                if amount and base_damage:
                    multiplier = amount / base_damage
                    nearest = round(multiplier)
                    effect["multiplier"] = nearest if abs(multiplier - nearest) < 0.03 else round(multiplier, 2)
                effect["radius"] = effect.get("radius", 1.5)
        if card_id in DASH_CARDS and dash_damage is None and charge_damage is None:
            spawn_damage = card.get("special", {}).get("spawnDamage")
            if card_id == "mega-knight" and spawn_damage:
                record["onDeploy"] = record.get("onDeploy", [])
                if first(record["onDeploy"], "areaDamage") is None:
                    record["onDeploy"].append({"kind": "areaDamage", "radius": 1.5, "amount": spawn_damage})

        death_damage = card.get("special", {}).get("deathDamage")
        if death_damage:
            effect = first(record["onDeath"], "areaDamage")
            if effect is None:
                effect = {"kind": "areaDamage"}
                record["onDeath"].insert(0, effect)
            effect["amount"] = death_damage
            effect["radius"] = DEATH_RADIUS.get(card_id, 2.0)

        spawn_damage = card.get("special", {}).get("spawnDamage")
        if spawn_damage and card_id not in ("mega-knight",):
            effect = first(record["onDeploy"], "areaDamage")
            if effect is None:
                effect = {"kind": "areaDamage", "radius": 2.5}
                record["onDeploy"].append(effect)
            effect["amount"] = spawn_damage

        shield = card.get("special", {}).get("shieldHitpoints")
        if shield:
            for effect in record["onDeploy"]:
                if effect.get("kind") == "status" and effect.get("status") == "shield":
                    effect["amount"] = shield

        interval = SPAWN_INTERVALS.get(card_id)
        if interval is not None:
            periodic = record["periodic"]
            if not periodic:
                child = {
                    "barbarian-hut": ("barbarian", 3),
                    "elixir-collector": (None, 1),
                    "furnace": ("fire-spirit", 1),
                    "goblin-drill": ("goblin", 1),
                    "goblin-hut": ("spear-goblin", 1),
                    "tombstone": ("skeleton", 2),
                    "witch": ("skeleton", 3),
                }[card_id]
                if child[0] is None:
                    periodic.append({"kind": "elixir", "amount": 1, "intervalMs": interval})
                else:
                    periodic.append({"kind": "spawn", "childId": child[0], "count": child[1], "intervalMs": interval})
            else:
                for effect in periodic:
                    if effect.get("kind") in ("spawn", "elixir"):
                        effect["intervalMs"] = interval
                        break

    mechanics["ram-rider"]["onDeploy"] = []
    for hut in ("barbarian-hut", "goblin-hut"):
        mechanics[hut]["onDeath"] = []
    for effect in mechanics["witch"]["periodic"]:
        if effect.get("kind") == "spawn":
            effect["count"] = 3

    MECHANICS.write_text(json.dumps(mechanics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"updated {MECHANICS} ({len(mechanics)} cards)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
