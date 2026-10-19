"""Load versioned card mechanics into MySQL.

Mechanic definitions are data in ``card_mechanics.json``. The backend only
validates and interprets the generic effect schema; it does not contain a
per-card behavior map.

Usage: python infra/mysql/seed_card_mechanics.py
"""

import json
import os
import sys

import pymysql

BASE = os.path.join(os.path.dirname(__file__), "..", ".env")
DATA = os.path.join(os.path.dirname(__file__), "card_mechanics.json")


def load_dotenv(path: str) -> None:
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())
    except FileNotFoundError:
        pass


def main() -> int:
    load_dotenv(BASE)
    with open(DATA, encoding="utf-8") as f:
        cards = json.load(f)

    conn = pymysql.connect(
        host=os.environ["DB_HOST"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASS"],
        database=os.environ.get("DB_NAME", "cr"),
        port=int(os.environ.get("DB_PORT", "27884")),
        ssl={"ssl": True} if os.environ.get("DB_SSL", "true").lower() == "true" else None,
        connect_timeout=20,
    )
    try:
        with conn.cursor() as cur:
            for card_id, spec in cards.items():
                cur.execute(
                    """INSERT INTO card_mechanics
                    (card_id,version,attack_pattern,targeting,movement,tower_troop,
                     on_deploy,on_attack,on_hit,on_death,periodic,ability)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                      version=VALUES(version), attack_pattern=VALUES(attack_pattern),
                      targeting=VALUES(targeting), movement=VALUES(movement),
                      tower_troop=VALUES(tower_troop), on_deploy=VALUES(on_deploy),
                      on_attack=VALUES(on_attack), on_hit=VALUES(on_hit),
                      on_death=VALUES(on_death), periodic=VALUES(periodic),
                      ability=VALUES(ability)""",
                    (
                        card_id,
                        int(spec.get("version", 1)),
                        spec.get("attack"),
                        spec.get("targeting", "all"),
                        spec.get("movement"),
                        int(bool(spec.get("towerTroop", False))),
                        json.dumps(spec.get("onDeploy", []), separators=(",", ":")),
                        json.dumps(spec.get("onAttack", []), separators=(",", ":")),
                        json.dumps(spec.get("onHit", []), separators=(",", ":")),
                        json.dumps(spec.get("onDeath", []), separators=(",", ":")),
                        json.dumps(spec.get("periodic", []), separators=(",", ":")),
                        json.dumps(spec.get("ability", []), separators=(",", ":")),
                    ),
                )
        conn.commit()
        print(f"MECHANICS_OK cards={len(cards)}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
