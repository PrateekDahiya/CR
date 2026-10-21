#!/usr/bin/env python3
"""Import real Clash Royale card facts from the Clash Royale Wiki (Fandom).

Source pages: https://clashroyale.fandom.com/wiki/<Card>
The wiki renders the authoritative in-game card tables (attributes + per-level
stats). We snapshot those tables so the game data can be regenerated offline.

Output:
    infra/mysql/card_stats_source.json  (checked in)
    <temp>/cr-card-pages/<slug>.json    (HTML cache, not checked in)

Usage:
    python scripts/import_clash_royale_stats.py [--refresh]
"""

from __future__ import annotations

import argparse
import ast
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "infra" / "mysql" / "seed_catalog.py"
OUT_PATH = ROOT / "infra" / "mysql" / "card_stats_source.json"
CACHE_DIR = Path(tempfile.gettempdir()) / "cr-card-pages"
API = "https://clashroyale.fandom.com/api.php"

TITLE_OVERRIDES = {
    "archer-queen": "Archer Queen",
    "boss-bandit": "Boss Bandit",
    "cannon": "Cannon",
    "cannoneer": "Cannoneer",
    "dagger-duchess": "Dagger Duchess",
    "electro-dragon": "Electro Dragon",
    "electro-wizard": "Electro Wizard",
    "fire-spirit": "Fire Spirit",
    "giant-snowball": "Giant Snowball",
    "goblin-curse": "Goblin Curse",
    "goblin-demolisher": "Goblin Demolisher",
    "goblinstein": "Goblinstein",
    "golden-knight": "Golden Knight",
    "ice-spirit": "Ice Spirit",
    "little-prince": "Little Prince",
    "mighty-miner": "Mighty Miner",
    "mini-pekka": "Mini P.E.K.K.A",
    "pekka": "P.E.K.K.A",
    "royal-chef": "Royal Chef",
    "royal-hogs": "Royal Hogs",
    "skeleton-king": "Skeleton King",
    "the-log": "The Log",
    "tower-princess": "Tower Princess",
    "x-bow": "X-Bow",
}

# Cards whose statistics table has more than one unit; keep the deployable
# primary unit's HP/Damage columns.
PRIMARY_HP = {
    "battle-ram": "Battle Ram Hitpoints",
    "goblin-cage": "Goblin Cage Hitpoints",
    "goblin-drill": "Goblin Drill Hitpoints",
    "goblinstein": "Doctor Hitpoints",
    "little-prince": "Little Prince Hitpoints",
    "phoenix": "Hitpoints",
    "rascals": "Rascal Boy Hitpoints",
    "skeleton-barrel": "Skeleton Barrel Hitpoints",
    "skeleton-king": "Skeleton King Hitpoints",
}
PRIMARY_DAMAGE = {
    "battle-ram": "Battle Ram Damage",
    "goblinstein": "Doctor Damage",
    "little-prince": "Little Prince Damage",
    "phoenix": "Damage",
    "rascals": "Rascal Boy Damage",
    "skeleton-barrel": "Skeleton Barrel Death Damage",
    "skeleton-king": "Skeleton King Damage",
}


def load_catalog() -> list[dict]:
    tree = ast.parse(CATALOG_PATH.read_text(encoding="utf-8"))
    for node in tree.body:
        is_catalog = False
        if isinstance(node, ast.Assign):
            is_catalog = any(
                isinstance(target, ast.Name) and target.id == "CATALOG" for target in node.targets
            )
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            is_catalog = node.target.id == "CATALOG"
        if is_catalog:
            rows = ast.literal_eval(node.value)
            return [
                {
                    "id": row[0],
                    "type": row[1],
                    "cost": row[2],
                    "rarity": row[3],
                    "playable": bool(row[4]),
                    "note": row[5],
                }
                for row in rows
            ]
    raise RuntimeError("CATALOG not found")


def title_for(card_id: str) -> str:
    if card_id in TITLE_OVERRIDES:
        return TITLE_OVERRIDES[card_id]
    return " ".join(word.capitalize() for word in card_id.split("-"))


def norm_header(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("\u200e", " ").replace("\u200f", " ")
    value = re.sub(r"\[[^\]]*\]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", norm_header(value).lower()).strip()


def text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).replace("\u200e", "").replace("\u200f", "").strip()


def strip_quotes(value: str) -> str:
    return value.strip().strip("\u201c\u201d\"'")


def parse_number(value: str) -> float | None:
    match = re.search(r"-?\d[\d,]*(?:\.\d+)?", value.replace(",", ""))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_seconds(value: str) -> float | None:
    low = value.lower()
    if "min" in low:
        minutes = re.search(r"(\d+(?:\.\d+)?)\s*min", low)
        seconds = re.search(r"(\d+(?:\.\d+)?)\s*sec", low)
        total = (float(minutes.group(1)) * 60 if minutes else 0) + (float(seconds.group(1)) if seconds else 0)
        return total if minutes or seconds else None
    number = parse_number(value)
    if number is None:
        return None
    if "ms" in low:
        return number / 1000
    return number


def parse_range(value: str) -> float | None:
    if not value:
        return None
    low = value.lower()
    numbers = re.findall(r"\d+(?:\.\d+)?", value.replace(",", ""))
    if len(numbers) >= 2 and "-" in value:
        return float(numbers[-1])
    if "melee" in low:
        number = parse_number(value)
        return number if number is not None else 1.2
    return parse_number(value)


def parse_speed(value: str) -> tuple[float, str]:
    low = value.lower()
    internal = parse_number(value)
    if internal is not None and "(" in value:
        # Wiki writes the in-game internal speed in parentheses.
        internal = parse_number(value[value.find("(") + 1 :])
    else:
        internal = None
    if internal is None:
        internal = {"slow": 45, "medium": 60, "fast": 90, "very fast": 120}.get(
            next((label for label in ("very fast", "fast", "medium", "slow") if label in low), ""),
            60,
        )
    tiles = round(internal / 60, 2)
    label = next((label.title() for label in ("very fast", "fast", "medium", "slow") if label in low), "Medium")
    return tiles, label


def target_mask(value: str, card_type: str) -> str:
    low = value.lower()
    if card_type == "spell":
        return "ground" if "ground" in low and "air" not in low else "all"
    if "building" in low and "air" not in low:
        return "buildings"
    if "air" in low and "ground" in low:
        return "air+ground"
    if "air" in low:
        return "air+ground"
    return "ground"


def table_rows(soup: BeautifulSoup, table_id: str) -> list[list[str]]:
    table = soup.find("table", id=table_id)
    if table is None:
        return []
    rows: list[list[str]] = []
    for row in table.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if cells:
            rows.append([text(cell) for cell in cells])
    return rows


def table_dict(soup: BeautifulSoup, table_id: str) -> dict[str, str]:
    rows = table_rows(soup, table_id)
    if not rows:
        return {}
    headers = rows[0]
    result: dict[str, str] = {}
    for row in rows[1:]:
        for index, header in enumerate(headers):
            if index < len(row) and norm_key(header) not in result:
                result[norm_key(header)] = row[index]
    return result


def fetch_page(title: str, refresh: bool) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    cache = CACHE_DIR / f"{safe}.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    params = {
        "action": "parse",
        "page": title,
        "prop": "text",
        "format": "json",
        "formatversion": "2",
        "redirects": "1",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "CR-Clone-Research/1.0"})
    payload = json.load(urllib.request.urlopen(request, timeout=90))
    if "error" in payload:
        raise RuntimeError(payload["error"].get("info", "parse error"))
    cache.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


COUNT_OVERRIDES = {
    "goblin-gang": 6,
    "rascals": 3,
    "skeleton-army": 15,
    "minion-horde": 6,
    "royal-recruits": 6,
    "royal-hogs": 4,
    "three-musketeers": 3,
}

# Cards where the rendered table does not expose a normal hit speed.
HIT_SPEED_OVERRIDES = {
    "battle-ram": 1.5,
    "skeleton-barrel": 0.0,
    "fire-spirit": 0.0,
    "ice-spirit": 0.0,
}

DAMAGE_OVERRIDES = {
    "arrows": 122,
    "barbarian-barrel": 215,
    "earthquake": 84,
    "fireball": 688,
    "freeze": 115,
    "giant-snowball": 179,
    "goblin-barrel": 0,
    "goblin-curse": 35,
    "graveyard": 0,
    "lightning": 1057,
    "poison": 92,
    "rage": 0,
    "clone": 0,
    "rocket": 1484,
    "royal-delivery": 437,
    "skeleton-barrel": 0,
    "the-log": 268,
    "tornado": 84,
    "void": 696,
    "zap": 192,
    "elixir-collector": 0,
    "barbarian-hut": 0,
    "goblin-hut": 0,
    "tombstone": 0,
    "goblin-cage": 0,
    "goblin-drill": 0,
}

RADIUS_OVERRIDES = {
    "the-log": 3.9,
    "barbarian-barrel": 2.6,
    "lightning": 3.5,
    "poison": 3.5,
    "zap": 2.5,
    "tornado": 5.5,
}

# These cards have no regular attack; their table rows describe spawned units.
SPAWN_ONLY = {
    "barbarian-hut",
    "goblin-hut",
    "tombstone",
    "goblin-cage",
    "goblin-drill",
    "elixir-collector",
    "skeleton-barrel",
}


def parse_card(entry: dict, payload: dict) -> dict:
    card_id = entry["id"]
    parsed = payload.get("parse", {})
    title = parsed.get("title", title_for(card_id))
    soup = BeautifulSoup(parsed.get("text", ""), "html.parser")

    quote = soup.select_one("div.quote-block")
    description = strip_quotes(text(quote)) if quote is not None else ""

    attrs = table_dict(soup, "unit-attributes-table")

    stat_rows = table_rows(soup, "unit-statistics-table")
    headers = stat_rows[0] if stat_rows else []
    keyed_headers = [norm_key(header) for header in headers]
    level_rows: dict[int, list[str]] = {}
    for row in stat_rows[1:]:
        level = parse_number(row[0]) if row else None
        if level is not None and level.is_integer():
            level_rows[int(level)] = row
    level11_row = level_rows.get(11) or (level_rows[min(level_rows)] if level_rows else [])

    def columns(row: list[str]) -> list[tuple[str, str, str]]:
        return [
            (norm_key(headers[i]), headers[i], row[i])
            for i in range(min(len(headers), len(row)))
        ]

    def pick_hp(cols: list[tuple[str, str, str]]) -> tuple[str, str]:
        preferred_hp = norm_key(PRIMARY_HP.get(card_id, ""))
        if preferred_hp:
            for key, header, value in cols:
                if key == preferred_hp:
                    return header, value
        prefix = norm_key(title)
        for key, header, value in cols:
            if key.startswith(prefix) and "hitpoints" in key and "lost" not in key:
                return header, value
        for key, header, value in cols:
            if key == "hitpoints" and "lost" not in key:
                return header, value
        for key, header, value in cols:
            if "hitpoints" in key and "lost" not in key:
                return header, value
        return "", ""

    def pick_damage(cols: list[tuple[str, str, str]]) -> tuple[str, str]:
        preferred_damage = norm_key(PRIMARY_DAMAGE.get(card_id, ""))
        if preferred_damage:
            for key, header, value in cols:
                if key == preferred_damage:
                    return header, value
        prefix = norm_key(title)
        blocked = ("per second", "dps", "crown", "death", "lightning", "spawn", "dash", "charge", "lost", "stage")
        for key, header, value in cols:
            if key.startswith(prefix) and "damage" in key and not any(item in key for item in blocked):
                return header, value
        for key, header, value in cols:
            if key == "damage" and not any(item in key for item in blocked):
                return header, value
        for key, header, value in cols:
            if "stage damage" in key:
                return header, value
        for key, header, value in cols:
            if "damage" in key and not any(item in key for item in blocked):
                return header, value
        return "", ""

    def pick_tower(cols: list[tuple[str, str, str]]) -> tuple[str, str]:
        for key, header, value in cols:
            if "crown tower damage" in key:
                return header, value
        return "", ""

    raw_type = attrs.get("type", entry["type"])
    if "spell" in raw_type.lower():
        card_type = "spell"
    elif "tower" in raw_type.lower():
        card_type = "tower"
    elif "building" in raw_type.lower():
        card_type = "building"
    elif "troop" in raw_type.lower():
        card_type = "troop"
    else:
        card_type = entry["type"]

    cols11 = columns(level11_row)
    hp_header, hp_raw = pick_hp(cols11)
    damage_header, damage_raw = pick_damage(cols11)
    tower_header, tower_raw = pick_tower(cols11)

    if card_type == "spell":
        spell_cols = [(key, header, value) for key, header, value in cols11 if "damage" in key and "per second" not in key]
        preferred = ["area damage", "single target damage", "royal delivery area damage", "barbarian barrel area damage"]
        chosen = next(((header, value) for key, header, value in cols11 if key in preferred), None)
        if chosen is None and spell_cols:
            chosen = (spell_cols[0][1], spell_cols[0][2])
        if chosen is not None:
            damage_header, damage_raw = chosen
        tower_header, tower_raw = pick_tower(cols11)

    override_damage = DAMAGE_OVERRIDES.get(card_id)
    damage = float(override_damage) if override_damage is not None else (parse_number(damage_raw) if damage_raw else None)
    hp = parse_number(hp_raw) if hp_raw else None
    tower_damage = parse_number(tower_raw) if tower_raw else None

    hit_speed = HIT_SPEED_OVERRIDES.get(card_id)
    if hit_speed is None:
        hit_speed = parse_seconds(attrs.get("hit speed", ""))
    if hit_speed is None:
        hit_speed = parse_seconds(attrs.get("attack period", ""))
    if hit_speed is None:
        for key, value in attrs.items():
            if key.startswith("hit speed stage 1"):
                hit_speed = parse_seconds(value)
                break
    if card_id in SPAWN_ONLY:
        hit_speed = 0.0
    if hit_speed is None or hit_speed <= 0:
        hit_speed = 0.0
    if card_id == "little-prince":
        hit_speed = parse_seconds(attrs.get("hit speed stage 1", "1.2 sec")) or 1.2

    speed_tiles, speed_label = parse_speed(attrs.get("speed", ""))
    if card_type in ("spell", "building") and "speed" not in attrs:
        speed_tiles, speed_label = 0.0, "Static"

    range_value = parse_range(attrs.get("range", ""))
    if card_type == "spell":
        range_value = 0.0

    count_value = attrs.get("count", "")
    count = int(parse_number(count_value) or 0) if count_value else 0
    count = COUNT_OVERRIDES.get(card_id, count)
    if card_type == "troop" and count == 0:
        count = 1
    if card_type == "building" and count == 0:
        count = 1

    radius = RADIUS_OVERRIDES.get(card_id)
    if radius is None:
        radius = parse_number(attrs.get("splash radius", "")) or parse_number(attrs.get("radius", ""))
    if radius is None and attrs.get("width"):
        radius = parse_number(attrs["width"])
    if card_type in ("spell", "tower"):
        count = 1
    if card_type == "spell":
        hp = 0
        count = 0
        if not damage:
            tower_damage = None
    if card_type == "building" and card_id in SPAWN_ONLY:
        targets = "none"
    else:
        targets = target_mask(attrs.get("target", ""), card_type)

    deploy = parse_seconds(attrs.get("deploy time", ""))
    lifetime = parse_seconds(attrs.get("lifetime", ""))
    spawn_interval = parse_seconds(attrs.get("spawn speed", ""))
    duration = parse_seconds(attrs.get("duration", ""))
    freeze_duration = parse_seconds(attrs.get("freeze duration", ""))
    slow_duration = parse_seconds(attrs.get("slow duration", ""))

    def first_special(*needles: str) -> float | None:
        for needle in needles:
            for key, _header, value in cols11:
                if needle in key:
                    number = parse_number(value)
                    if number is not None:
                        return number
        return None

    levels: dict[str, dict[str, float | None]] = {}
    hp_index = keyed_headers.index(norm_key(hp_header)) if hp_header and norm_key(hp_header) in keyed_headers else None
    damage_index = keyed_headers.index(norm_key(damage_header)) if damage_header and norm_key(damage_header) in keyed_headers else None
    tower_index = keyed_headers.index(norm_key(tower_header)) if tower_header and norm_key(tower_header) in keyed_headers else None
    for level, row in sorted(level_rows.items()):
        levels[str(level)] = {
            "hp": parse_number(row[hp_index]) if hp_index is not None and hp_index < len(row) else None,
            "damage": parse_number(row[damage_index]) if damage_index is not None and damage_index < len(row) else None,
            "towerDamage": parse_number(row[tower_index]) if tower_index is not None and tower_index < len(row) else None,
        }
    if DAMAGE_OVERRIDES.get(card_id) == 0:
        for level in levels:
            levels[level]["damage"] = 0

    facts = {
        "id": card_id,
        "title": title,
        "source": f"https://clashroyale.fandom.com/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
        "description": description,
        "type": card_type,
        "rarity": entry["rarity"],
        "cost": int(parse_number(attrs.get("cost", "")) or entry["cost"]),
        "targets": targets,
        "rollDistanceTiles": parse_number(attrs.get("range", "")) if card_type == "spell" else None,
        "speedTilesPerSec": speed_tiles,
        "speedLabel": speed_label,
        "rangeTiles": range_value or 0.0,
        "count": count,
        "radiusTiles": radius,
        "hitSpeedSec": hit_speed,
        "deployTimeSec": deploy,
        "lifetimeSec": lifetime,
        "spawnIntervalSec": spawn_interval,
        "durationSec": duration or freeze_duration,
        "slowDurationSec": slow_duration,
        "level11": {
            "hp": hp,
            "hpHeader": hp_header,
            "damage": damage,
            "damageHeader": damage_header,
            "towerDamage": tower_damage,
            "columns": [[header, value] for _key, header, value in cols11],
        },
        "levels": levels,
        "attributes": attrs,
        "special": {
            "deathDamage": first_special("death damage"),
            "dashDamage": first_special("dash damage", "dashing dash damage"),
            "chargeDamage": first_special("charge damage"),
            "spawnDamage": first_special("spawn damage"),
            "shieldHitpoints": first_special("shield hitpoints"),
            "explosiveEscapeDamage": first_special("explosive escape damage"),
        },
    }
    return facts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="ignore the HTML cache")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    catalog = load_catalog()
    results: dict[str, dict] = {}
    failures: list[tuple[str, str]] = []

    def work(entry: dict) -> tuple[str, dict | None, str | None]:
        title = title_for(entry["id"])
        try:
            payload = fetch_page(title, args.refresh)
            return entry["id"], parse_card(entry, payload), None
        except Exception as error:  # noqa: BLE001 - report per-card failures
            return entry["id"], None, str(error)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(work, entry) for entry in catalog]
        for future in as_completed(futures):
            card_id, facts, error = future.result()
            if facts is None:
                failures.append((card_id, error or "unknown"))
            else:
                results[card_id] = facts
            print(f"{'OK ' if facts else 'ERR'} {card_id}")

    OUT_PATH.write_text(
        json.dumps({"generatedAt": time.strftime("%Y-%m-%d"), "cards": results}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    print(f"\nwrote {OUT_PATH} ({len(results)}/{len(catalog)} cards)")
    if failures:
        print("FAILURES:")
        for card_id, error in failures:
            print(f"  {card_id}: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
