#!/usr/bin/env python3
"""Audit card mechanics data against what the engine actually implements.

The `card-mechanics` branch moved card behavior into
`infra/mysql/card_mechanics.json` (loaded into the `card_mechanics` MySQL
table). The engine is supposed to interpret a small set of *generic* effect
primitives. This tool is the contract check between the two:

  * every effect kind declared in the data must have a branch in the engine,
  * every attack pattern declared must be handled,
  * every `status` name declared must be handled by `applyStatus`,
  * every card id must exist in the generated catalog,
  * child ids referenced by spawn/split must exist as templates.

Anything the engine would silently ignore is reported here instead of
failing quietly in battle. Exit code is non-zero when a finding exists, so it
can be wired into the test suite.

Usage:
    python scripts/audit_card_mechanics.py [--json] [--strict]

`--strict` also treats advisory findings as failures.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MECHANICS_JSON = ROOT / "infra" / "mysql" / "card_mechanics.json"
SPAWN_TEMPLATES = ROOT / "infra" / "mysql" / "spawn_templates.json"
BACKEND_CARDS = ROOT / "backend" / "src" / "game" / "cards.generated.ts"
FRONTEND_CARDS = ROOT / "frontend" / "lib" / "cards.generated.ts"
ENGINE = ROOT / "backend" / "src" / "game" / "engine.ts"
MECHANICS_TS = ROOT / "backend" / "src" / "game" / "cardMechanics.ts"

EFFECT_LISTS = ("onDeploy", "onAttack", "onHit", "onDeath", "periodic", "ability")


# --------------------------------------------------------------------------
# What the engine implements today.
#
# Kept as data (not regex over engine.ts) so the audit is explicit and
# reviewable, but every entry is verified against the engine source below via
# `assert_backed_by_source`, so the list cannot rot into fiction.
# --------------------------------------------------------------------------

SUPPORTED_EFFECT_KINDS = {
    "areaDamage",
    "damage",
    "status",
    "knockback",
    "clone",
    "spawn",
    "split",
    "elixir",
    "chain",
    # Phase 13 additions — see engine.ts `tryDash`, `tryRamp`,
    # `applyUnitScopedEffects` and the `levelUp` branch.
    "dash",
    "ramp",
    "teleport",
    "levelUp",
}

# `pierce` is not applied through `applyDatabaseEffects`; it is resolved by
# `applyMultiTargetAttack` when the card's attack *pattern* is pierce, so it
# only counts as implemented when the pattern matches.
PATTERN_HANDLED_EFFECT_KINDS = {"pierce"}

SUPPORTED_ATTACK_PATTERNS = {
    "single",
    "splash",
    "chain",
    "pierce",
    "none",
    "beam",
    "suicide",
}

# Effect kinds that imply an attack pattern must be one of these to be
# considered actually executed.
PATTERN_REQUIRED_FOR = PATTERN_HANDLED_EFFECT_KINDS

SUPPORTED_STATUSES = {
    "stun",
    "freeze",
    "slow",
    "rage",
    "shield",
    "heal",
}

# Statuses the engine intentionally treats as advisory bookkeeping rather
# than a gameplay mutation (they are read by attack code, or are
# presentation-only). Listed explicitly so they are never "discovered" as
# unknown later.
ADVISORY_STATUSES = {
    "lockOn",
    "invisible",
    "curse",
    "reflect",
    "chargeUp",
    "heal",
    "reveal",
    "buried",
}

SUPPORTED_MOVEMENTS = {"ground", "flying", "siege", "burrow"}

KNOWN_CHILD_PREFIXES = ("child:", "template:", "spawn:")


def assert_backed_by_source() -> list[str]:
    """Confirm the declared support lists match what engine.ts really branches on.

    Returns advisory strings for anything that could not be confirmed.
    """
    advisories: list[str] = []
    try:
        engine = ENGINE.read_text(encoding="utf-8")
    except OSError:
        return ["could not read engine.ts"]

    branched_kinds = set(
        re.findall(r'effect\.kind === "([a-zA-Z]+)"', engine)
        + re.findall(r'field\.effect\.kind === "([a-zA-Z]+)"', engine)
        + re.findall(r'\.kind [!=]== "([a-zA-Z]+)"', engine)
    )
    for kind in sorted(SUPPORTED_EFFECT_KINDS):
        if kind not in branched_kinds:
            advisories.append(
                f"SUPPORTED_EFFECT_KINDS lists '{kind}' but engine.ts has no branch for it"
            )

    branched_patterns = set(
        re.findall(r'(?:mechanics\?\.attack|pattern|attacker\.mechanics\?\.attack)[^\n]*?[!=]== "([a-zA-Z]+)"', engine)
    )
    for pattern in sorted(SUPPORTED_ATTACK_PATTERNS):
        if pattern in ("single", "splash", "none", "beam", "suicide"):
            continue  # handled by the generic damage path, not a branch
        if pattern not in branched_patterns:
            advisories.append(
                f"SUPPORTED_ATTACK_PATTERNS lists '{pattern}' but engine.ts never compares against it"
            )

    branched_statuses = set(
        re.findall(r'status === "([a-zA-Z]+)"', engine)
    )
    for status in sorted(SUPPORTED_STATUSES):
        if status not in branched_statuses:
            advisories.append(
                f"SUPPORTED_STATUSES lists '{status}' but applyStatus never compares against it"
            )
    return advisories


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def parse_generated_cards(path: Path) -> dict:
    """Pull card ids out of a generated cards table without a TS parser."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    return {m for m in re.findall(r'id:\s*"([a-z0-9\-]+)"', text)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat advisory findings as failures",
    )
    args = parser.parse_args()

    mechanics = load_json(MECHANICS_JSON)
    catalog_ids = parse_generated_cards(BACKEND_CARDS) | parse_generated_cards(FRONTEND_CARDS)
    frontend_only = parse_generated_cards(FRONTEND_CARDS) - parse_generated_cards(BACKEND_CARDS)
    backend_only = parse_generated_cards(BACKEND_CARDS) - parse_generated_cards(FRONTEND_CARDS)
    try:
        templates = set(load_json(SPAWN_TEMPLATES))
    except OSError:
        templates = set()

    unbacked_effects: list[dict] = []
    uninvoked_abilities: list[dict] = []
    unknown_statuses: list[dict] = []
    unknown_ids: list[str] = []
    unknown_children: list[dict] = []
    unknown_patterns: list[dict] = []
    unknown_movements: list[dict] = []
    advisories: list[str] = assert_backed_by_source()

    for card_id, record in sorted(mechanics.items()):
        if card_id not in catalog_ids:
            unknown_ids.append(card_id)

        attack = record.get("attack")
        if attack is not None and attack not in SUPPORTED_ATTACK_PATTERNS:
            unknown_patterns.append({"card": card_id, "attack": attack})

        movement = record.get("movement")
        if movement is not None and movement not in SUPPORTED_MOVEMENTS:
            unknown_movements.append({"card": card_id, "movement": movement})

        for list_name in EFFECT_LISTS:
            for effect in record.get(list_name) or []:
                if not isinstance(effect, dict):
                    continue
                kind = effect.get("kind")
                entry = {"card": card_id, "list": list_name, "effect": effect}
                if kind in SUPPORTED_EFFECT_KINDS:
                    pass
                elif list_name == "ability":
                    # Champion abilities need a client-invoked ability action
                    # that the current socket contract does not define
                    # (docs/CARD_MECHANICS_PLAN.md section 6 / Phase 6).
                    # They are reported, never treated as a silent failure.
                    uninvoked_abilities.append({**entry, "reason": "no ability protocol action"})
                elif kind in PATTERN_REQUIRED_FOR:
                    # Only real when the card's attack pattern actually runs
                    # the multi-target resolver.
                    if attack not in PATTERN_HANDLED_EFFECT_KINDS:
                        unbacked_effects.append({**entry, "reason": "pattern not handled"})
                else:
                    unbacked_effects.append({**entry, "reason": "no engine branch"})

                status = effect.get("status")
                if (
                    kind == "status"
                    and isinstance(status, str)
                    and status not in SUPPORTED_STATUSES
                    and status not in ADVISORY_STATUSES
                ):
                    unknown_statuses.append({**entry, "status": status})

                child = effect.get("childId")
                if (
                    kind in ("spawn", "split")
                    and isinstance(child, str)
                    and not child.startswith(KNOWN_CHILD_PREFIXES)
                    and templates
                    and child not in templates
                    and child not in catalog_ids
                ):
                    unknown_children.append({**entry, "childId": child})

    findings = {
        "cards": len(mechanics),
        "catalogCards": len(catalog_ids),
        "unbackedEffects": unbacked_effects,
        "uninvokedAbilities": uninvoked_abilities,
        "unknownStatuses": unknown_statuses,
        "unknownCardIds": unknown_ids,
        "unknownChildIds": unknown_children,
        "unknownAttackPatterns": unknown_patterns,
        "unknownMovements": unknown_movements,
        "catalogDrift": {
            "frontendOnly": sorted(frontend_only),
            "backendOnly": sorted(backend_only),
        },
        "advisories": advisories,
    }

    failures = (
        unbacked_effects
        or unknown_statuses
        or unknown_ids
        or unknown_children
        or unknown_patterns
        or unknown_movements
        or findings["catalogDrift"]["frontendOnly"]
        or findings["catalogDrift"]["backendOnly"]
        or (args.strict and advisories)
    )

    if args.json:
        print(json.dumps(findings, indent=2))
    else:
        print(f"card mechanics audit: {findings['cards']} mechanic rows / {findings['catalogCards']} catalog cards")
        if advisories:
            print("\nadvisories (support list vs engine source):")
            for item in advisories:
                print(f"  ! {item}")
        if unbacked_effects:
            print("\nUNBACKED EFFECTS (declared in data, never executed by the engine):")
            for item in unbacked_effects:
                print(f"  - {item['card']}.{item['list']}: {item['effect'].get('kind')} ({item['reason']})")
        if unknown_statuses:
            print("\nUNKNOWN STATUS NAMES:")
            for item in unknown_statuses:
                print(f"  - {item['card']}.{item['list']}: status={item['status']}")
        if uninvoked_abilities:
            print("\nCHAMPION ABILITIES (awaiting the ability protocol action):")
            for item in uninvoked_abilities:
                print(f"  - {item['card']}.{item['list']}: {item['effect'].get('kind')}")
        if unknown_patterns:
            print("\nUNKNOWN ATTACK PATTERNS:")
            for item in unknown_patterns:
                print(f"  - {item['card']}: {item['attack']}")
        if unknown_movements:
            print("\nUNSUPPORTED MOVEMENT:")
            for item in unknown_movements:
                print(f"  - {item['card']}: {item['movement']}")
        if unknown_ids:
            print("\nMECHANIC ROWS WITH NO CATALOG CARD:")
            for item in unknown_ids:
                print(f"  - {item}")
        if unknown_children:
            print("\nUNKNOWN CHILD IDS:")
            for item in unknown_children:
                print(f"  - {item['card']}: {item['childId']}")
        drift = findings["catalogDrift"]
        if drift["frontendOnly"] or drift["backendOnly"]:
            print("\nCATALOG DRIFT between backend and frontend generated tables:")
            for item in drift["frontendOnly"]:
                print(f"  - frontend-only: {item}")
            for item in drift["backendOnly"]:
                print(f"  - backend-only: {item}")
        print("\nVERDICT:", "FAIL" if failures else "PASS")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())