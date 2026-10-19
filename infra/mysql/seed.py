"""Legacy menu bootstrap for the MySQL content store.

Card facts are no longer hardcoded here. Run these data imports instead:

  python infra/mysql/seed_catalog.py
  python infra/mysql/seed_card_mechanics.py

The catalog and mechanics imports are the authoritative 108-card seed.
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
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())
    except FileNotFoundError:
        pass


MENUS = [
    ("Battle", "/battle", "⚔️", 1, None),
    ("Deck", "/deck", "🃏", 2, None),
    ("Clan", "/clan", "🛡️", 3, None),
    ("Shop", "/shop", "🛒", 4, None),
    ("Leaderboard", "/leaderboard", "🏆", 5, None),
    ("Profile", "/profile", "👤", 6, None),
    ("Lobby", "/lobby", "🎮", 7, None),
]


def main() -> int:
    load_dotenv(BASE)
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
            for menu in MENUS:
                cur.execute(
                    "INSERT INTO menus (label,route,icon,sort_order,parent) VALUES (%s,%s,%s,%s,%s) "
                    "ON DUPLICATE KEY UPDATE route=VALUES(route),sort_order=VALUES(sort_order)",
                    menu,
                )
        conn.commit()
        print(f"MENU_SEED_OK menus={len(MENUS)}; run seed_catalog.py and seed_card_mechanics.py for cards")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
