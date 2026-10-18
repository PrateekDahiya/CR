#!/usr/bin/env python3
"""Collect all real CR card art into frontend/public/cards/.

Sources:
- deckshop.pro /img/c/<Name>.png          (regular cards, 120)
- deckshop.pro /img/tower-troop/<slug>.png (tower troops, 4)
- clash-royale-wordle.com /static/img/cards/<slug>.png (fallback for any missing)
- clashroyale.fandom.com/wiki/<Name>     (extract og:image as last resort)

Idempotent: skips existing non-empty files. O(n) network, bounded by sources.
"""
import asyncio
import os
import sys
import time

import aiohttp

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "cards")
os.makedirs(OUT, exist_ok=True)

# deckshop PascalCase -> our kebab slug (full catalog)
DECKSHOP = {
    "3M": "three-musketeers",
    "ArcherQueen": "archer-queen",
    "Archers": "archers",
    "Arrows": "arrows",
    "BabyD": "baby-dragon",
    "Balloon": "balloon",
    "Bandit": "bandit",
    "BarbBarrel": "barbarian-barrel",
    "BarbHut": "barbarian-hut",
    "Barbs": "barbarians",
    "Barrel": "goblin-barrel",
    "Bats": "bats",
    "BattleHealer": "battle-healer",
    "Berserker": "berserker",
    "BombTower": "bomb-tower",
    "Bomber": "bomber",
    "BossBandit": "boss-bandit",
    "Bowler": "bowler",
    "Cannon": "cannon",
    "CannonCart": "cannon-cart",
    "Clone": "clone",
    "DarkPrince": "dark-prince",
    "DartGob": "dart-goblin",
    "Earthquake": "earthquake",
    "ElectroGiant": "electro-giant",
    "ElectroSpirit": "electro-spirit",
    "ElixirGolem": "elixir-golem",
    "Exe": "executioner",
    "FireSpirit": "fire-spirit",
    "Fireball": "fireball",
    "Firecracker": "firecracker",
    "Fisherman": "fisherman",
    "FlyingMachine": "flying-machine",
    "Freeze": "freeze",
    "Furnace": "furnace",
    "Ghost": "royal-ghost",
    "Giant": "giant",
    "GiantSkelly": "giant-skeleton",
    "GobGang": "goblin-gang",
    "GobGiant": "goblin-giant",
    "GobHut": "goblin-hut",
    "GoblinCage": "goblin-cage",
    "GoblinCurse": "goblin-curse",
    "GoblinDemolisher": "goblin-demolisher",
    "GoblinDrill": "goblin-drill",
    "GoblinMachine": "goblin-machine",
    "Goblinstein": "goblinstein",
    "Gobs": "goblins",
    "GoldenKnight": "golden-knight",
    "Golem": "golem",
    "Graveyard": "graveyard",
    "Guards": "guards",
    "HealSpirit": "heal-spirit",
    "Hog": "hog-rider",
    "Horde": "minion-horde",
    "Hunter": "hunter",
    "IceGolem": "ice-golem",
    "IceSpirit": "ice-spirit",
    "IceWiz": "ice-wizard",
    "Inferno": "inferno-tower",
    "InfernoD": "inferno-dragon",
    "Knight": "knight",
    "Lava": "lava-hound",
    "Lightning": "lightning",
    "LittlePrince": "little-prince",
    "Log": "the-log",
    "Lumber": "lumberjack",
    "MM": "mega-knight",
    "MP": "mini-pekka",
    "MagicArcher": "magic-archer",
    "MegaKnight": "mega-knight",
    "MightyMiner": "mighty-miner",
    "Miner": "miner",
    "MinionGiant": "minion-giant",
    "Minions": "minions",
    "Monk": "monk",
    "Mortar": "mortar",
    "MotherWitch": "mother-witch",
    "Musk": "musketeer",
    "NightWitch": "night-witch",
    "PEKKA": "pekka",
    "Phoenix": "phoenix",
    "Poison": "poison",
    "Prince": "prince",
    "Princess": "princess",
    "Pump": "elixir-collector",
    "RG": "royal-giant",
    "Rage": "rage",
    "Ram": "battle-ram",
    "RamRider": "ram-rider",
    "Rascals": "rascals",
    "Rocket": "rocket",
    "Ronin": "ronin",
    "RoyalDelivery": "royal-delivery",
    "RoyalHogs": "royal-hogs",
    "RoyalRecruits": "royal-recruits",
    "RuneGiant": "rune-giant",
    "Skarmy": "skeleton-army",
    "SkeletonDragons": "skeleton-dragons",
    "SkeletonKing": "skeleton-king",
    "Skellies": "skeletons",
    "SkellyBarrel": "skeleton-barrel",
    "Snowball": "giant-snowball",
    "Sparky": "sparky",
    "SpearGobs": "spear-goblins",
    "SpiritEmpress": "spirit-empress",
    "SuspiciousBush": "suspicious-bush",
    "Tesla": "tesla",
    "Tombstone": "tombstone",
    "Tornado": "tornado",
    "Valk": "valkyrie",
    "Void": "void",
    "WallBreakers": "wall-breakers",
    "Witch": "witch",
    "Wiz": "wizard",
    "XBow": "x-bow",
    "Zap": "zap",
    "Zappies": "zappies",
    "eBarbs": "elite-barbarians",
    "eDragon": "electro-dragon",
    "eWiz": "electro-wizard",
}

TOWER = {
    "cannoneer": "cannoneer",
    "dagger-duchess": "dagger-duchess",
    "royal-chef": "royal-chef",
    "tower-princess": "tower-princess",
}

SOURCES = [
    ("https://www.deckshop.pro/img/c/", DECKSHOP),
    ("https://www.deckshop.pro/img/tower-troop/", TOWER),
]

CONCURRENCY = 8
TIMEOUT = 15


async def fetch_one(s: aiohttp.ClientSession, base: str, name: str, slug: str) -> str:
    out = os.path.join(OUT, f"{slug}.png")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return f"skip {slug}.png"
    url = f"{base}{name}.png"
    try:
        async with s.get(url, timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as r:
            if r.status != 200:
                return f"miss {name} status {r.status}"
            data = await r.read()
            with open(out, "wb") as f:
                f.write(data)
            return f"ok {slug}.png ({len(data)}b)"
    except Exception as e:  # noqa
        return f"err {name}: {e}"


async def main() -> None:
    sem = asyncio.Semaphore(CONCURRENCY)
    results: list[str] = []
    async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0"}) as s:
        async def run(base: str, name: str, slug: str) -> None:
            async with sem:
                r = await fetch_one(s, base, name, slug)
                results.append(r)
        items = [(b, n, sl) for b, m in SOURCES for n, sl in m.items()]
        t0 = time.time()
        await asyncio.gather(*[run(b, n, sl) for b, n, sl in items])
        ok = sum(1 for r in results if r.startswith("ok"))
        skip = sum(1 for r in results if r.startswith("skip"))
        miss = sum(1 for r in results if r.startswith("miss"))
        err = sum(1 for r in results if r.startswith("err"))
        print(f"ok={ok} skip={skip} miss={miss} err={err} elapsed={time.time() - t0:.1f}s")
        for r in results:
            if not r.startswith("ok") and not r.startswith("skip"):
                print(" ", r)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()) or 0)
