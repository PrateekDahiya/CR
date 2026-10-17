"""Seed Aiven MySQL `cr` with authentic CR roster/menus (original art metadata only).

Usage (gitignored creds via infra/.env, never committed):
  python infra/mysql/seed.py
Reads DB_HOST/DB_USER/DB_PASS/DB_NAME/DB_PORT/DB_SSL from infra/.env or env.
Idempotent: INSERT ... ON DUPLICATE KEY UPDATE.
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

HOST = os.environ["DB_HOST"]
USER = os.environ["DB_USER"]
PASSWORD = os.environ["DB_PASS"]
DB = os.environ.get("DB_NAME", "cr")
PORT = int(os.environ.get("DB_PORT", "27884"))
SSL = os.environ.get("DB_SSL", "true").lower() == "true"

# Canonical 12-card roster from docs/GAME_DESIGN.md §1 (same naming/stats).
CARDS = [
    ("knight", "troop", 3, 1450, 165, 1100, 150, 900, "med", 0.8, "melee", "ground", 1, "common", 0, 0, 0, 0, 0, 1000, 0, "Mini-tank, stable opener"),
    ("archers", "troop", 3, 600, 95, 1100, 172, 900, "med", 5.5, "ranged", "air+ground", 2, "common", 0, 0, 0, 0, 0, 1000, 0, "Survive full Zap (300 > 220)"),
    ("giant", "troop", 5, 3400, 210, 1500, 140, 600, "slow", 0.8, "melee", "buildings", 1, "rare", 0, 0, 0, 0, 0, 1000, 0, "Win-condition tank"),
    ("skeletons", "troop", 1, 240, 80, 1000, 240, 1200, "fast", 0.6, "melee", "ground", 3, "common", 0, 0, 0, 0, 0, 1000, 0, "Cycle + bait"),
    ("musketeer", "troop", 4, 600, 200, 1000, 200, 900, "med", 6.0, "ranged", "air+ground", 1, "rare", 0, 0, 0, 0, 0, 1000, 0, "Top single-target ranged dps"),
    ("baby-dragon", "troop", 4, 1100, 150, 1600, 94, 1100, "fast", 3.5, "ranged", "air+ground", 1, "epic", 0, 0, 0, 0, 0, 1000, 0, "Flying splash"),
    ("mini-pekka", "troop", 4, 1100, 550, 1600, 344, 1200, "fast", 0.8, "melee", "ground", 1, "rare", 0, 0, 0, 0, 0, 1000, 0, "Glass cannon"),
    ("rock-golem", "troop", 6, 4300, 260, 2000, 130, 500, "slow", 0.8, "melee", "buildings", 1, "epic", 0, 0, 0, 0, 0, 1000, 280, "Late-game win-con + death burst"),
    ("fireball", "spell", 4, 0, 700, 800, 0, 0, "", 2.5, "area", "all", 1, "rare", 700, 280, 2.5, 0, 0, 800, 0, "One-shots Musketeer/Archers"),
    ("arrows", "spell", 3, 0, 100, 200, 0, 0, "", 4.0, "area", "all", 1, "common", 300, 120, 4.0, 0, 0, 600, 0, "3 volleys x100"),
    ("zap", "spell", 2, 0, 220, 0, 0, 0, "", 2.5, "area", "all", 1, "common", 220, 88, 2.5, 500, 0, 0, 0, "Stun + reset, not vs full Archers"),
    ("cannon", "building", 3, 750, 210, 800, 262, 0, "static", 5.5, "ranged", "ground", 1, "common", 0, 0, 0, 0, 30000, 1000, 0, "Pulls Giant/Golem, dies to air"),
]

EMOJI = {"knight": "⚔️", "archers": "🏹", "giant": "🗿", "skeletons": "💀", "musketeer": "🔫", "baby-dragon": "🐲", "mini-pekka": "🔪", "rock-golem": "🪨", "fireball": "🔥", "arrows": "➶", "zap": "⚡", "cannon": "🏯"}

MENUS = [
    ("Battle", "/battle", "⚔️", 1, None),
    ("Deck", "/deck", "🃏", 2, None),
    ("Clan", "/clan", "🛡️", 3, None),
    ("Shop", "/shop", "🛒", 4, None),
    ("Leaderboard", "/leaderboard", "🏆", 5, None),
    ("Profile", "/profile", "👤", 6, None),
    ("Lobby", "/lobby", "🎮", 7, None),
]

CARD_COLS = "(name,card_type,elixir,hp,dmg_per_hit,hit_speed_ms,dps,speed_ms_per_tile,speed_label,range_tiles,range_kind,targets,unit_count,rarity,damage_vs_troops,damage_vs_towers,radius_tiles,stun_ms,lifetime_ms,deploy_delay_ms,death_burst,notes)"


def main() -> None:
    conn = pymysql.connect(host=HOST, user=USER, password=PASSWORD, database=DB, port=PORT, ssl={"ssl": True} if SSL else None, connect_timeout=20)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM cards")
            before = cur.fetchone()[0]
            for c in CARDS:
                cur.execute(
                    f"INSERT INTO cards {CARD_COLS} VALUES ({','.join(['%s']*len(c))}) ON DUPLICATE KEY UPDATE elixir=VALUES(elixir),hp=VALUES(hp),dps=VALUES(dps),notes=VALUES(notes)",
                    c,
                )
            for i, (name, kind) in enumerate([(n, CARDS[j][1]) for j, n in enumerate([c[0] for c in CARDS])]):
                cur.execute(
                    "INSERT INTO sprites (card_name,kind,atlas_x,atlas_y,w,h,placeholder_emoji,art_path,art_note) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE placeholder_emoji=VALUES(placeholder_emoji)",
                    (name, kind if kind in ("troop", "spell", "building") else "troop", (i % 4) * 64, (i // 4) * 64, 64, 64, EMOJI[name], f"assets/placeholders/{name}.svg", "original placeholder - inspired by, not copied"),
                )
            for m in MENUS:
                cur.execute("INSERT INTO menus (label,route,icon,sort_order,parent) VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE route=VALUES(route),sort_order=VALUES(sort_order)", m)
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM cards")
            cards = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM sprites")
            sprites = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM menus")
            menus = cur.fetchone()[0]
        print(f"SEED_OK cards={cards} sprites={sprites} menus={menus} (before cards={before})")
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
