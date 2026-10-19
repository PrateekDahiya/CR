"""Seed card_catalog: full CR roster facts (name/elixir/rarity/type).

Facts compiled 2026-10-17 from public card lists (royaleguild/noff/liquipedia/
clanmanager excerpts + fandom stat tables). Elixir/rarity/type are game facts.
Per-card level stats live in GAME_DESIGN.md (playable 12) - this table is the
Collection index (Found count, filters). Mirror/dual-cost specials excluded
(see notes). Idempotent upsert. Creds via infra/.env (gitignored).

Usage: python infra/mysql/seed_catalog.py
"""

import os
import sys

import pymysql

BASE = os.path.join(os.path.dirname(__file__), "..", ".env")


def load_dotenv(path: str) -> None:
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    except FileNotFoundError:
        pass


load_dotenv(BASE)

# (name, type, elixir, rarity, playable, note)
CATALOG: list[tuple] = [
    # --- Common troops (19) ---
    ("archers", "troop", 3, "common", 1, ""),
    ("barbarians", "troop", 5, "common", 0, ""),
    ("bats", "troop", 2, "common", 0, ""),
    ("bomber", "troop", 2, "common", 0, ""),
    ("elite-barbarians", "troop", 6, "common", 0, ""),
    ("firecracker", "troop", 3, "common", 0, ""),
    ("fire-spirit", "troop", 1, "common", 0, ""),
    ("goblins", "troop", 2, "common", 0, ""),
    ("goblin-gang", "troop", 3, "common", 0, ""),
    ("ice-spirit", "troop", 1, "common", 0, ""),
    ("knight", "troop", 3, "common", 1, ""),
    ("minions", "troop", 3, "common", 0, ""),
    ("minion-horde", "troop", 5, "common", 0, ""),
    ("royal-giant", "troop", 6, "common", 0, ""),
    ("royal-recruits", "troop", 7, "common", 0, ""),
    ("rascals", "troop", 5, "common", 0, ""),
    ("skeletons", "troop", 1, "common", 1, ""),
    ("skeleton-barrel", "troop", 3, "common", 0, ""),
    ("spear-goblins", "troop", 2, "common", 0, ""),
    # --- Rare troops (14) ---
    ("battle-ram", "troop", 4, "rare", 0, ""),
    ("dart-goblin", "troop", 3, "rare", 0, ""),
    ("elixir-golem", "troop", 3, "rare", 0, ""),
    ("flying-machine", "troop", 4, "rare", 0, ""),
    ("giant", "troop", 5, "rare", 1, ""),
    ("goblin-demolisher", "troop", 4, "rare", 0, ""),
    ("hog-rider", "troop", 4, "rare", 0, ""),
    ("ice-golem", "troop", 2, "rare", 0, ""),
    ("mini-pekka", "troop", 4, "rare", 1, ""),
    ("musketeer", "troop", 4, "rare", 1, ""),
    ("royal-hogs", "troop", 5, "rare", 0, ""),
    ("valkyrie", "troop", 5, "rare", 0, ""),
    ("wizard", "troop", 5, "rare", 0, ""),
    ("zappies", "troop", 4, "rare", 0, ""),
    # --- Epic troops (14) ---
    ("baby-dragon", "troop", 4, "epic", 1, ""),
    ("balloon", "troop", 5, "epic", 0, ""),
    ("bowler", "troop", 5, "epic", 0, ""),
    ("dark-prince", "troop", 4, "epic", 0, ""),
    ("electro-dragon", "troop", 5, "epic", 0, ""),
    ("executioner", "troop", 5, "epic", 0, ""),
    ("giant-skeleton", "troop", 6, "epic", 0, ""),
    ("goblin-giant", "troop", 6, "epic", 0, ""),
    ("golem", "troop", 8, "epic", 1, "full catalog card"),
    ("guards", "troop", 3, "epic", 0, ""),
    ("pekka", "troop", 7, "epic", 0, ""),
    ("prince", "troop", 5, "epic", 0, ""),
    ("skeleton-army", "troop", 3, "epic", 0, ""),
    ("witch", "troop", 5, "epic", 0, ""),
    # --- Legendary troops (17) ---
    ("bandit", "troop", 3, "legendary", 0, ""),
    ("electro-wizard", "troop", 4, "legendary", 0, ""),
    ("fisherman", "troop", 3, "legendary", 0, ""),
    ("inferno-dragon", "troop", 6, "legendary", 0, ""),
    ("ice-wizard", "troop", 3, "legendary", 0, ""),
    ("lava-hound", "troop", 7, "legendary", 0, ""),
    ("lumberjack", "troop", 4, "legendary", 0, ""),
    ("magic-archer", "troop", 4, "legendary", 0, ""),
    ("mega-knight", "troop", 7, "legendary", 0, ""),
    ("miner", "troop", 3, "legendary", 0, ""),
    ("mother-witch", "troop", 4, "legendary", 0, ""),
    ("night-witch", "troop", 4, "legendary", 0, ""),
    ("phoenix", "troop", 4, "legendary", 0, ""),
    ("princess", "troop", 3, "legendary", 0, ""),
    ("ram-rider", "troop", 5, "legendary", 0, ""),
    ("royal-ghost", "troop", 3, "legendary", 0, ""),
    ("sparky", "troop", 6, "legendary", 0, ""),
    # --- Champions (8) ---
    ("archer-queen", "troop", 5, "champion", 0, "ability +1"),
    ("boss-bandit", "troop", 6, "champion", 0, ""),
    ("goblinstein", "troop", 5, "champion", 0, "ability +2"),
    ("golden-knight", "troop", 4, "champion", 0, "ability +1"),
    ("little-prince", "troop", 3, "champion", 0, "ability +3"),
    ("mighty-miner", "troop", 4, "champion", 0, "ability +1"),
    ("monk", "troop", 5, "champion", 0, "ability +1"),
    ("skeleton-king", "troop", 4, "champion", 0, "ability +2"),
    # --- Spells common (4) / rare (4) ---
    ("arrows", "spell", 3, "common", 1, ""),
    ("giant-snowball", "spell", 2, "common", 0, ""),
    ("royal-delivery", "spell", 3, "common", 0, ""),
    ("zap", "spell", 2, "common", 1, ""),
    ("barbarian-barrel", "spell", 2, "rare", 0, ""),
    ("earthquake", "spell", 3, "rare", 0, ""),
    ("fireball", "spell", 4, "rare", 1, ""),
    ("rocket", "spell", 6, "rare", 0, ""),
    # --- Spells epic (9, Mirror excluded: cost mirrors target +1) ---
    ("clone", "spell", 3, "epic", 0, ""),
    ("freeze", "spell", 4, "epic", 0, ""),
    ("goblin-barrel", "spell", 3, "epic", 0, ""),
    ("goblin-curse", "spell", 2, "epic", 0, ""),
    ("lightning", "spell", 6, "epic", 0, ""),
    ("poison", "spell", 4, "epic", 0, ""),
    ("rage", "spell", 2, "epic", 0, ""),
    ("tornado", "spell", 3, "epic", 0, ""),
    ("void", "spell", 3, "epic", 0, ""),
    # --- Spells legendary (2) ---
    ("graveyard", "spell", 5, "legendary", 0, ""),
    ("the-log", "spell", 2, "legendary", 0, ""),
    # --- Buildings common (3) / rare (8) / epic (2) ---
    ("cannon", "building", 3, "common", 1, ""),
    ("mortar", "building", 4, "common", 0, ""),
    ("tesla", "building", 4, "common", 0, ""),
    ("bomb-tower", "building", 4, "rare", 0, ""),
    ("barbarian-hut", "building", 6, "rare", 0, ""),
    ("elixir-collector", "building", 6, "rare", 0, ""),
    ("furnace", "building", 4, "rare", 0, ""),
    ("goblin-cage", "building", 4, "rare", 0, ""),
    ("goblin-hut", "building", 4, "rare", 0, ""),
    ("inferno-tower", "building", 5, "rare", 0, ""),
    ("tombstone", "building", 3, "rare", 0, ""),
    ("goblin-drill", "building", 4, "epic", 0, ""),
    ("x-bow", "building", 6, "epic", 0, ""),
    # --- Tower troops (4) ---
    ("tower-princess", "tower", 0, "common", 0, "tower troop, not deployed"),
    ("cannoneer", "tower", 0, "epic", 0, "tower troop, not deployed"),
    ("dagger-duchess", "tower", 0, "legendary", 0, "tower troop, not deployed"),
    ("royal-chef", "tower", 0, "legendary", 0, "tower troop, not deployed"),
]


def main() -> None:
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
            for row in CATALOG:
                cur.execute(
                    "INSERT INTO card_catalog (name,card_type,elixir,rarity,playable,note) VALUES (%s,%s,%s,%s,%s,%s)"
                    " ON DUPLICATE KEY UPDATE card_type=VALUES(card_type),elixir=VALUES(elixir),rarity=VALUES(rarity),playable=VALUES(playable),note=VALUES(note)",
                    row,
                )
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*), SUM(playable) FROM card_catalog")
            total, playable = cur.fetchone()
        print(f"CATALOG_OK total={total} playable={playable}")
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
