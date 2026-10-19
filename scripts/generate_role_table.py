#!/usr/bin/env python3
"""Extract the canonical role map out of `frontend/lib/cardRoles.ts`.

`frontend/lib/cardRoles.ts` is the single authored source for card roles. The
backend needs the same table for AI deck generation, so it is exported to
`shared/card-roles.json` and imported by both sides — one source of truth, no
hand-maintained duplicate, no new dependency.

Run after editing the ROLE_MAP block:
    python scripts/generate_role_table.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "frontend" / "lib" / "cardRoles.ts"
TARGET = ROOT / "shared" / "card-roles.json"

ROLES_DECL = re.compile(r"const AUTHORED_CARD_ROLES = \[(.*?)\] as const;", re.S)
ROLE_MAP_DECL = re.compile(r"const AUTHORED_ROLE_MAP[^=]*=\s*\{(.*?)\n\};", re.S)
ENTRY = re.compile(r'^\s*(?:"([a-z0-9\-]+)"|([a-z][a-z0-9\-]*)):\s*\[([^\]]*)\],\s*$', re.M)
STRING = re.compile(r'"([^"]*)"')


def main() -> int:
    text = SOURCE.read_text(encoding="utf-8")

    roles_block = ROLES_DECL.search(text)
    if roles_block is None:
        print("could not find CARD_ROLES in cardRoles.ts", file=sys.stderr)
        return 1
    roles = [m.group(1) for m in STRING.finditer(roles_block.group(1))]

    role_map_block = ROLE_MAP_DECL.search(text)
    if role_map_block is None:
        print("could not find ROLE_MAP in cardRoles.ts", file=sys.stderr)
        return 1

    mapping: dict[str, list[str]] = {}
    for line in role_map_block.group(1).splitlines():
        entry = ENTRY.match(line)
        if entry is None:
            continue
        card_id = entry.group(1) or entry.group(2)
        tags = [m.group(1) for m in STRING.finditer(entry.group(3))]
        if not card_id or not tags:
            continue
        mapping[card_id] = tags

    if not mapping:
        print("ROLE_MAP parsed as empty — refusing to write an empty table", file=sys.stderr)
        return 1

    payload = {"roles": roles, "cardRoles": dict(sorted(mapping.items()))}
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")

    # Fail loudly if a tag is used but not declared.
    unknown = sorted({tag for tags in mapping.values() for tag in tags} - set(roles))
    if unknown:
        print(f"undeclared tags in ROLE_MAP: {unknown}", file=sys.stderr)
        return 1

    print(f"wrote {TARGET.relative_to(ROOT)}: {len(roles)} roles, {len(mapping)} cards")
    return 0


if __name__ == "__main__":
    sys.exit(main())