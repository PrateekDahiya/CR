"""Load non-deck child unit templates used by database card mechanics."""

import json
import os
import sys

import pymysql

BASE = os.path.join(os.path.dirname(__file__), "..", ".env")
DATA = os.path.join(os.path.dirname(__file__), "spawn_templates.json")


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
        templates = json.load(f)
    conn = pymysql.connect(
        host=os.environ["DB_HOST"], user=os.environ["DB_USER"], password=os.environ["DB_PASS"],
        database=os.environ.get("DB_NAME", "cr"), port=int(os.environ.get("DB_PORT", "27884")),
        ssl={"ssl": True} if os.environ.get("DB_SSL", "true").lower() == "true" else None,
        connect_timeout=20,
    )
    try:
        with conn.cursor() as cur:
            for template_id, spec in templates.items():
                cur.execute(
                    """INSERT INTO card_spawn_templates
                    (template_id,version,hp,damage,hit_speed_ms,speed,range_tiles,sight_range,
                     targets,unit_count,flying,attack_pattern,on_deploy,on_attack,on_hit,on_death,periodic)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE version=VALUES(version),hp=VALUES(hp),damage=VALUES(damage),
                    hit_speed_ms=VALUES(hit_speed_ms),speed=VALUES(speed),range_tiles=VALUES(range_tiles),
                    sight_range=VALUES(sight_range),targets=VALUES(targets),unit_count=VALUES(unit_count),
                    flying=VALUES(flying),attack_pattern=VALUES(attack_pattern),on_deploy=VALUES(on_deploy),
                    on_attack=VALUES(on_attack),on_hit=VALUES(on_hit),on_death=VALUES(on_death),periodic=VALUES(periodic)""",
                    (
                        template_id, int(spec.get("version", 1)), int(spec["hp"]), int(spec["damage"]),
                        int(spec["hitSpeedMs"]), float(spec["speed"]), float(spec["range"]),
                        float(spec["sightRange"]), spec["targets"], int(spec.get("count", 1)),
                        int(bool(spec.get("flying", False))), spec.get("attack", "single"),
                        json.dumps(spec.get("onDeploy", []), separators=(",", ":")),
                        json.dumps(spec.get("onAttack", []), separators=(",", ":")),
                        json.dumps(spec.get("onHit", []), separators=(",", ":")),
                        json.dumps(spec.get("onDeath", []), separators=(",", ":")),
                        json.dumps(spec.get("periodic", []), separators=(",", ":")),
                    ),
                )
        conn.commit()
        print(f"SPAWN_TEMPLATES_OK templates={len(templates)}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
