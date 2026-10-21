"""The per-card 3D recipe for the sprite sheets.

Every entry describes how one card of the catalogue is built from the CC0
KayKit character kit (or from procedural primitives for the buildings, spells
and towers):

    model       the rigged character (`adventures` / `skeletons` pack)
    gear        the modular parts of that character to show (helmet, cape, ...)
    weapon      an accessory from the kit, bound to a hand bone
    attachments extra geometry bound to a bone (wings, a belly, a cannon, ...)
    tint        a multiplier on the base colour (the card palette)
    scale       the size of the unit (a giant is 1.7x a goblin)
    walk        the walk animation (a real one from the character rig)
    attack      the attack animation (melee / ranged / spellcast)
    magic       the magic orb that lights up in the attack rows (red = fire,
                blue = ice)
    hover       the unit flies instead of walking (height + bob)
    desc        what the card actually is (checked against the wiki render)

The recipes were checked one by one against the original card renders
(`docs/card-art/sources/<card>-front.png`, see
`scripts/card-sheets/compare_sheets.py`).

The result is rendered by `scripts/blender/render_card_sheet.py` into the
4x5 sheet of the card.
"""

from __future__ import annotations

# the magic colours
FIRE = [1.0, 0.42, 0.08]
ICE = [0.35, 0.72, 1.0]
BOLT = [1.0, 0.85, 0.2]
ARCANE = [0.72, 0.35, 1.0]
TOXIC = [0.55, 0.9, 0.35]

# the palettes (a multiplier on the texture of the base model)
STEEL = [1.0, 1.0, 1.0]
GOLD = [1.3, 1.02, 0.5]
GREEN = [0.5, 1.0, 0.45]
PURPLE = [0.8, 0.6, 1.2]
RED = [1.25, 0.72, 0.68]
DARK = [0.6, 0.52, 0.8]
ROCK = [0.88, 0.88, 0.92]
SKIN = [1.1, 1.0, 0.95]


def troop(
    model: str,
    gear: list[str] | None = None,
    weapon: dict | None = None,
    attachments: list[dict] | None = None,
    tint: list[float] | None = None,
    scale: float = 1.0,
    walk: str = "Walking_A",
    attack: str = "1H_Melee_Attack_Chop",
    magic: dict | None = None,
    hover: dict | None = None,
    desc: str = "",
) -> dict:
    entry: dict = {"model": model, "walk": walk, "attack": attack, "scale": scale, "desc": desc}
    if gear:
        entry["gear"] = gear
    if weapon:
        entry["weapon"] = weapon
    if attachments:
        entry["attachments"] = attachments
    if tint:
        entry["tint"] = tint
    if magic:
        entry["magic"] = magic
    if hover:
        entry["hover"] = hover
    return entry


def orb(color: list[float], radius: float = 0.19, bone: str = "hand.r") -> dict:
    return {"orb": color, "radius": radius, "bone": bone}


# --- attachment helpers -----------------------------------------------------


def belly(radius: float = 0.6, color=(0.55, 0.26, 0.14), z: float = -0.25) -> dict:
    """A round belly (the giant, the royal giant, the bowler)."""
    return {
        "type": "sphere",
        "name": "belly",
        "radius": radius,
        "bone": "spine",
        "anchor": "tail",
        "offset": [0.0, -0.14, z],
        "color": list(color),
        "size": [1.15, 0.85, 0.95],
    }


def wings(color=(0.55, 0.75, 1.0), span: float = 0.5, height: float = 0.05) -> list[dict]:
    """A pair of bat / dragon wings on the back (flat triangular fins)."""
    return [
        {
            "type": "cone",
            "name": f"wing{side}",
            "radius": span,
            "depth": 0.12,
            "vertices": 3,
            "bone": "chest",
            "anchor": "head",
            "offset": [side * 0.26, 0.14, height],
            "rot": [0, side * 100, side * 35],
            "color": list(color),
            "size": [1.0, 1.0, 1.0],
        }
        for side in (-1, 1)
    ]


def crown(color=(1.0, 0.82, 0.25)) -> list[dict]:
    """A small crown on the head."""
    return [
        {
            "type": "cone",
            "name": f"crown{index}",
            "radius": 0.09,
            "depth": 0.22,
            "bone": "head",
            "offset": [0.22 * (index - 1), 0.0, 0.06],
            "color": list(color),
        }
        for index in range(3)
    ]


def horns(color=(0.85, 0.5, 0.75), height: float = 0.2) -> list[dict]:
    return [
        {
            "type": "cone",
            "name": f"horn{side}",
            "radius": 0.11,
            "depth": height,
            "bone": "head",
            "offset": [side * 0.26, 0.02, 0.02],
            "rot": [0, side * 22, 0],
            "color": list(color),
        }
        for side in (-1, 1)
    ]


def hat(color=(0.4, 0.3, 0.7), height: float = 0.55) -> dict:
    """A pointy wizard hat."""
    return {
        "type": "cone",
        "name": "hat",
        "radius": 0.42,
        "depth": height,
        "bone": "head",
        "offset": [0.0, 0.0, 0.12],
        "color": list(color),
    }


def barrel(color=(0.45, 0.3, 0.18), radius: float = 0.32) -> dict:
    return {
        "type": "cylinder",
        "name": "barrel",
        "radius": radius,
        "depth": 0.6,
        "bone": "hand.r",
        "offset": [0.0, -0.1, -0.1],
        "rot": [0, 0, 90],
        "color": list(color),
    }


def cannon(color=(0.28, 0.28, 0.32), length: float = 1.1) -> dict:
    return {
        "type": "cylinder",
        "name": "cannon",
        "radius": 0.24,
        "depth": length,
        "bone": "hand.r",
        "offset": [0.0, -length * 0.35, 0.0],
        "rot": [90, 0, 0],
        "color": list(color),
    }


def musket(color=(0.35, 0.28, 0.22), length: float = 1.3) -> dict:
    return {
        "type": "cylinder",
        "name": "musket",
        "radius": 0.09,
        "depth": length,
        "bone": "hand.r",
        "offset": [0.0, -length * 0.3, 0.0],
        "rot": [90, 0, 0],
        "color": list(color),
    }


def bow(color=(0.5, 0.32, 0.18)) -> list[dict]:
    """A small bow with a string (held in the right hand)."""
    return [
        {
            "type": "torus",
            "name": "bow",
            "radius": 0.3,
            "minor": 0.04,
            "bone": "hand.r",
            "offset": [0.0, -0.16, 0.02],
            "rot": [90, 0, 0],
            "color": list(color),
            "size": [1.0, 0.75, 1.0],
        },
        {
            "type": "cylinder",
            "name": "bowstring",
            "radius": 0.012,
            "depth": 0.52,
            "bone": "hand.r",
            "offset": [0.0, -0.16, 0.02],
            "rot": [90, 0, 0],
            "color": [0.85, 0.85, 0.85],
        },
        {
            "type": "cylinder",
            "name": "arrow",
            "radius": 0.02,
            "depth": 0.5,
            "bone": "hand.r",
            "offset": [0.0, -0.16, 0.02],
            "rot": [90, 0, 0],
            "color": [0.7, 0.55, 0.35],
        },
    ]


def pickaxe(color=(0.4, 0.4, 0.45)) -> list[dict]:
    return [
        {
            "type": "cylinder",
            "name": "handle",
            "radius": 0.06,
            "depth": 1.0,
            "bone": "hand.r",
            "offset": [0.0, -0.15, 0.0],
            "rot": [35, 0, 0],
            "color": [0.45, 0.3, 0.18],
        },
        {
            "type": "cube",
            "name": "pick",
            "size": [0.5, 0.12, 0.14],
            "bone": "hand.r",
            "offset": [0.0, -0.42, 0.42],
            "rot": [0, 0, 25],
            "color": list(color),
        },
    ]


def balloon(color=(0.25, 0.4, 0.75), radius: float = 0.72) -> list[dict]:
    return [
        {
            "type": "sphere",
            "name": "balloon",
            "radius": radius,
            "bone": "head",
            "offset": [0.0, 0.12, 0.95],
            "color": list(color),
        },
        {
            "type": "cylinder",
            "name": "rope",
            "radius": 0.03,
            "depth": 0.6,
            "bone": "head",
            "offset": [0.0, 0.12, 0.4],
            "color": [0.35, 0.25, 0.15],
        },
    ]


def goggles(color=(0.3, 0.25, 0.2)) -> list[dict]:
    return [
        {
            "type": "sphere",
            "name": f"goggle{side}",
            "radius": 0.11,
            "bone": "head",
            "offset": [side * 0.22, -0.3, 0.06],
            "color": list(color),
            "size": [1.0, 0.6, 1.0],
        }
        for side in (-1, 1)
    ]


def rock_plates(color=(0.55, 0.55, 0.6)) -> list[dict]:
    """Stone plates (the golem)."""
    return [
        {
            "type": "cube",
            "name": f"plate{side}",
            "size": [0.5, 0.45, 0.35],
            "bone": "chest",
            "offset": [side * 0.52, 0.0, 0.02],
            "rot": [0, side * 18, 0],
            "color": list(color),
        }
        for side in (-1, 1)
    ]


def tail(color=(0.5, 0.7, 0.4)) -> dict:
    return {
        "type": "cone",
        "name": "tail",
        "radius": 0.16,
        "depth": 0.8,
        "bone": "hips",
        "offset": [0.0, 0.45, -0.05],
        "rot": [110, 0, 0],
        "color": list(color),
    }


def prop(parts: list[dict], desc: str = "") -> dict:
    return {"prop": {"parts": parts}, "desc": desc}


def cube(name, size, loc, color, **kw):
    return {"type": "cube", "name": name, "size": size, "loc": loc, "color": color, **kw}


def cyl(name, radius, depth, loc, color, **kw):
    return {"type": "cylinder", "name": name, "radius": radius, "depth": depth, "loc": loc, "color": color, **kw}


def cone(name, radius, depth, loc, color, **kw):
    return {"type": "cone", "name": name, "radius": radius, "depth": depth, "loc": loc, "color": color, **kw}


def ball(name, radius, loc, color, **kw):
    return {"type": "sphere", "name": name, "radius": radius, "loc": loc, "color": color, **kw}


def torus(name, radius, minor, loc, color, **kw):
    return {"type": "torus", "name": name, "radius": radius, "minor": minor, "loc": loc, "color": color, **kw}


# ---------------------------------------------------------------------------
# the catalogue - every card, checked against the original card render

SPEC: dict[str, dict] = {
    # --- the classic troops ------------------------------------------------
    "barbarians": troop(
        "barbarian",
        gear=["1H_Axe", "Barbarian_Cape"],
        tint=SKIN,
        attack="1H_Melee_Attack_Chop",
        desc="Three bare-chested warriors with moustaches, headbands and swords.",
    ),
    "archers": troop(
        "rogue_hooded",
        gear=["Rogue_Cape"],
        attachments=bow(),
        tint=[1.15, 0.75, 0.95],
        attack="1H_Ranged_Shoot",
        scale=0.95,
        desc="Two archers with pink hair and green hoods, drawing longbows.",
    ),
    "bomber": troop(
        "skeleton_minion",
        attachments=goggles() + [barrel((0.3, 0.28, 0.26))],
        tint=[0.95, 0.92, 0.85],
        attack="Throw",
        scale=0.9,
        desc="A goggled skeleton that lobs bombs out of a barrel.",
    ),
    "bats": troop(
        "skeleton_minion",
        attachments=wings((0.45, 0.35, 0.7), 0.4),
        tint=[0.55, 0.45, 0.75],
        attack="Unarmed_Melee_Attack_Punch_A",
        hover={"height": 0.55, "bob": 0.07},
        scale=0.62,
        desc="Three small purple bats with leathery wings.",
    ),
    "elite-barbarians": troop(
        "barbarian",
        gear=["2H_Axe", "Barbarian_Cape"],
        tint=[1.2, 1.0, 0.85],
        attack="2H_Melee_Attack_Chop",
        scale=1.05,
        desc="Three elite warriors with spiked helmets and two-handed swords.",
    ),
    "goblins": troop(
        "rogue_hooded",
        gear=["Knife"],
        tint=GREEN,
        attack="1H_Melee_Attack_Stab",
        scale=0.74,
        desc="Three small green goblins with daggers and brown hoods.",
    ),
    "goblin-gang": troop(
        "rogue_hooded",
        gear=["Knife", "Rogue_Cape"],
        tint=GREEN,
        attack="1H_Melee_Attack_Slice_Diagonal",
        scale=0.74,
        desc="Five goblins with daggers and spears.",
    ),
    "fire-spirit": troop(
        "mage",
        attachments=[hat((1.0, 0.35, 0.08), 0.4)],
        tint=[1.3, 0.5, 0.25],
        attack="Spellcasting",
        magic=orb(FIRE, 0.18),
        scale=0.7,
        desc="A small fire elemental - a burning head that spits flame.",
    ),
    "ice-spirit": troop(
        "mage",
        attachments=[hat((0.45, 0.75, 1.0), 0.4)],
        tint=[0.6, 0.85, 1.3],
        attack="Spellcasting",
        magic=orb(ICE, 0.18),
        scale=0.7,
        desc="A small ice elemental - a smiling blue icicle blob.",
    ),
    "firecracker": troop(
        "rogue",
        attachments=[cannon((0.5, 0.25, 0.25), 0.9)],
        tint=[0.9, 0.7, 0.9],
        attack="Throw",
        scale=0.85,
        desc="A girl with goggles and a shoulder rocket launcher.",
    ),
    "minions": troop(
        "skeleton_minion",
        attachments=wings((0.5, 0.35, 0.8), 0.45),
        tint=[0.8, 0.6, 1.05],
        attack="Unarmed_Melee_Attack_Punch_A",
        hover={"height": 0.5, "bob": 0.07},
        scale=0.72,
        desc="Three small bat-winged demons with purple fur.",
    ),
    "knight": troop(
        "knight",
        gear=["1H_Sword", "Knight_Helmet", "Knight_Cape"],
        attack="1H_Melee_Attack_Slice_Horizontal",
        desc="An armoured knight with a sword and a red cape.",
    ),
    "minion-horde": troop(
        "skeleton_minion",
        attachments=wings((0.5, 0.35, 0.8), 0.45),
        tint=[0.8, 0.6, 1.05],
        attack="Unarmed_Melee_Attack_Punch_B",
        hover={"height": 0.5, "bob": 0.07},
        scale=0.72,
        desc="Five bat-winged demons.",
    ),
    "royal-giant": troop(
        "barbarian",
        gear=["Barbarian_Hat"],
        attachments=[belly(0.55, (0.6, 0.35, 0.16)), cannon((0.25, 0.25, 0.3), 1.15)],
        tint=[1.15, 1.0, 0.8],
        attack="Throw",
        scale=1.45,
        desc="A fat blond king who lobs a cannon over his shoulder.",
    ),
    "royal-recruits": troop(
        "knight",
        gear=["2H_Sword", "Knight_Helmet"],
        tint=[0.75, 0.85, 1.15],
        attack="2H_Melee_Attack_Chop",
        scale=0.95,
        desc="Three recruits in blue helmets with swords and shields.",
    ),
    "rascals": troop(
        "rogue",
        gear=["1H_Crossbow"],
        attachments=[{"type": "cube", "name": "plank", "size": [0.12, 0.9, 0.16], "bone": "hand.l", "offset": [0, 0, 0], "color": [0.6, 0.42, 0.22]}],
        tint=[0.85, 0.95, 0.8],
        attack="1H_Ranged_Shooting",
        desc="A girl with a whip next to a boy with a wooden plank.",
    ),
    "spear-goblins": troop(
        "rogue_hooded",
        weapon={"asset": "arrow", "bone": "hand.r", "scale": 1.5, "rot": [0, 90, 0]},
        tint=GREEN,
        attack="Throw",
        scale=0.74,
        desc="Three goblins with spears.",
    ),
    "skeleton-barrel": troop(
        "skeleton_minion",
        attachments=balloon((0.3, 0.45, 0.8), 0.42) + [barrel((0.35, 0.3, 0.22), 0.34)],
        tint=[0.95, 0.92, 0.85],
        attack="Unarmed_Melee_Attack_Punch_A",
        hover={"height": 0.35, "bob": 0.05},
        scale=0.8,
        desc="A barrel of skeletons lifted by two balloons.",
    ),
    "skeletons": troop(
        "skeleton_warrior",
        gear=["Skeleton_Warrior_Helmet"],
        weapon={"asset": "Skeleton_Blade", "pack": "kaykit-skeletons", "bone": "hand.r"},
        attack="1H_Melee_Attack_Slice_Horizontal",
        scale=0.92,
        desc="Four skeletons with rusty swords.",
    ),
    "battle-ram": troop(
        "barbarian",
        attachments=[{"type": "cylinder", "name": "ram", "radius": 0.55, "depth": 1.5, "bone": "chest", "offset": [0, -0.1, -0.15], "rot": [0, 0, 90], "color": [0.55, 0.4, 0.28]}],
        tint=SKIN,
        attack="2H_Melee_Attack_Chop",
        scale=1.1,
        desc="A battering ram: a spiked log on a wheeled frame.",
    ),
    "dart-goblin": troop(
        "rogue_hooded",
        weapon={"asset": "crossbow_1handed", "bone": "hand.r", "scale": 0.9},
        tint=GREEN,
        attack="1H_Ranged_Shoot",
        scale=0.74,
        desc="A goblin with a blowgun.",
    ),
    "elixir-golem": troop(
        "barbarian",
        attachments=[belly(0.55, (0.42, 0.14, 0.65))],
        tint=[0.75, 0.55, 1.15],
        attack="Unarmed_Melee_Attack_Punch_A",
        scale=1.3,
        desc="A fat purple golem made of elixir.",
    ),
    "flying-machine": troop(
        "skeleton_minion",
        attachments=[
            {"type": "cube", "name": "body", "size": [0.9, 0.9, 0.7], "bone": "chest", "offset": [0, 0.1, 0], "color": [0.55, 0.4, 0.25]},
            {"type": "cube", "name": "prop", "size": [1.5, 0.1, 0.12], "bone": "chest", "offset": [0, 0.25, 0.55], "rot": [0, 0, 15], "color": [0.4, 0.3, 0.2]},
        ],
        tint=[0.8, 0.78, 0.7],
        attack="Unarmed_Melee_Attack_Kick",
        hover={"height": 0.75, "bob": 0.08},
        scale=0.95,
        desc="A wooden flying machine with a propeller.",
    ),
    "goblin-demolisher": troop(
        "rogue_hooded",
        gear=["Knife"],
        attachments=[
            {"type": "cylinder", "name": "tank", "radius": 0.5, "depth": 0.8, "bone": "hips", "offset": [0, 0.05, -0.15], "color": [0.35, 0.32, 0.3]},
            {"type": "cylinder", "name": "stick", "radius": 0.09, "depth": 0.7, "bone": "hand.r", "offset": [0, -0.15, 0.1], "rot": [20, 0, 0], "color": [0.7, 0.2, 0.15]},
        ],
        tint=GREEN,
        attack="Throw",
        scale=1.15,
        desc="A goblin riding a demolition machine loaded with dynamite.",
    ),
    "giant": troop(
        "barbarian",
        attachments=[belly(0.5, (0.55, 0.26, 0.14))],
        tint=SKIN,
        attack="1H_Melee_Attack_Chop",
        scale=1.65,
        desc="A huge, fat, bare-chested man with a wide belt.",
    ),
    "hog-rider": troop(
        "barbarian",
        gear=["1H_Axe"],
        attachments=[{"type": "sphere", "name": "hog", "radius": 0.5, "bone": "hips", "offset": [0, 0.45, -0.15], "color": [0.85, 0.6, 0.55]}],
        tint=SKIN,
        attack="1H_Melee_Attack_Slice_Horizontal",
        scale=1.05,
        desc="A man riding a war hog with a hammer.",
    ),
    "mini-pekka": troop(
        "knight",
        gear=["Knight_Helmet"],
        attachments=horns((0.5, 0.85, 1.0), 0.18),
        tint=[0.7, 0.65, 1.0],
        attack="2H_Melee_Attack_Spin",
        scale=0.78,
        desc="A small armoured fighter with glowing blue blades.",
    ),
    "ice-golem": troop(
        "barbarian",
        attachments=rock_plates((0.5, 0.68, 0.9)),
        tint=[0.6, 0.85, 1.25],
        attack="Unarmed_Melee_Attack_Punch_B",
        scale=1.35,
        desc="A big ice golem with icicles on its shoulders.",
    ),
    "musketeer": troop(
        "rogue",
        attachments=[musket((0.3, 0.25, 0.22), 1.35)],
        tint=[0.75, 0.65, 1.05],
        attack="1H_Ranged_Shoot",
        scale=0.95,
        desc="A woman with a purple bob cut and a heavy musket.",
    ),
    "royal-hogs": troop(
        "barbarian",
        attachments=[
            {"type": "sphere", "name": "hog", "radius": 0.45, "bone": "hips", "offset": [0, 0.4, -0.1], "color": [0.9, 0.65, 0.6]},
            {"type": "sphere", "name": "helmet", "radius": 0.28, "bone": "head", "offset": [0, 0.05, 0.08], "color": [0.35, 0.45, 0.8]},
        ],
        tint=[1.05, 0.9, 0.9],
        attack="1H_Melee_Attack_Stab",
        scale=0.85,
        desc="Four war hogs wearing blue helmets.",
    ),
    "wizard": troop(
        "mage",
        gear=["2H_Staff", "Mage_Hat", "Mage_Cape"],
        attack="Spellcast_Long",
        magic=orb(FIRE, 0.2),
        desc="A bearded wizard in a blue robe casting a fire spell.",
    ),
    "valkyrie": troop(
        "barbarian",
        gear=["2H_Axe", "Barbarian_Hat"],
        attachments=crown((0.9, 0.9, 0.95)),
        tint=[1.2, 0.85, 0.75],
        attack="2H_Melee_Attack_Spin",
        scale=0.95,
        desc="A red-haired woman with a big axe.",
    ),
    "zappies": troop(
        "skeleton_minion",
        attachments=[
            {"type": "cone", "name": "cap", "radius": 0.3, "depth": 0.35, "bone": "head", "offset": [0, 0, 0.08], "color": [0.2, 0.4, 0.75]},
            {"type": "cone", "name": "antenna", "radius": 0.05, "depth": 0.35, "bone": "head", "offset": [0, 0, 0.3], "color": [0.3, 0.3, 0.35]},
        ],
        tint=[0.8, 0.9, 1.0],
        attack="Unarmed_Melee_Attack_Punch_A",
        magic=orb(BOLT, 0.14),
        scale=0.85,
        desc="Three small goblin-like zappers with electric arcs.",
    ),
    "baby-dragon": troop(
        "mage",
        attachments=wings((0.35, 0.85, 0.4), 0.5, 0.2) + [tail((0.35, 0.85, 0.4))],
        tint=[0.75, 1.15, 0.6],
        attack="Spellcasting",
        magic=orb(FIRE, 0.2),
        hover={"height": 0.45, "bob": 0.07},
        scale=0.62,
        desc="A small green dragon with wings and a tail.",
    ),
    "bowler": troop(
        "barbarian",
        attachments=[belly(0.45, (0.32, 0.16, 0.62))],
        tint=[0.75, 0.6, 1.1],
        attack="Throw",
        scale=1.15,
        desc="A fat purple man who throws a huge boulder.",
    ),
    "dark-prince": troop(
        "knight",
        gear=["2H_Sword", "Knight_Helmet", "Knight_Cape"],
        tint=DARK,
        attack="2H_Melee_Attack_Spin",
        desc="A black-armoured prince with a spike shield and a plume.",
    ),
    "balloon": troop(
        "skeleton_minion",
        attachments=balloon((0.25, 0.38, 0.7), 0.78),
        tint=[0.95, 0.92, 0.85],
        attack="Unarmed_Melee_Attack_Punch_A",
        hover={"height": 0.9, "bob": 0.05},
        scale=0.8,
        desc="A skeleton riding in a hot air balloon.",
    ),
    "electro-dragon": troop(
        "mage",
        attachments=wings((0.45, 0.6, 1.0), 0.55, 0.15) + [tail((0.45, 0.6, 1.0))],
        tint=[0.7, 0.85, 1.2],
        attack="Spellcasting",
        magic=orb(BOLT, 0.22),
        hover={"height": 0.5, "bob": 0.08},
        scale=0.68,
        desc="A blue dragon that shoots lightning.",
    ),
    "giant-skeleton": troop(
        "skeleton_warrior",
        gear=["Skeleton_Warrior_Helmet"],
        weapon={"asset": "Skeleton_Blade", "pack": "kaykit-skeletons", "bone": "hand.r"},
        attachments=[{"type": "sphere", "name": "bomb", "radius": 0.3, "bone": "hand.l", "offset": [0, 0, 0], "color": [0.15, 0.15, 0.17]}],
        attack="2H_Melee_Attack_Chop",
        scale=1.7,
        desc="A giant skeleton with a helmet and a bomb in its hand.",
    ),
    "goblin-giant": troop(
        "rogue_hooded",
        gear=["Knife"],
        attachments=[belly(0.55, (0.18, 0.42, 0.12))],
        tint=GREEN,
        attack="1H_Melee_Attack_Chop",
        scale=1.8,
        desc="A huge goblin in blue overalls with a spear.",
    ),
    "executioner": troop(
        "barbarian",
        gear=["2H_Axe", "Barbarian_Hat"],
        attachments=[{"type": "sphere", "name": "mask", "radius": 0.3, "bone": "head", "offset": [0, -0.22, 0.02], "color": [0.12, 0.12, 0.14]}],
        tint=SKIN,
        attack="2H_Melee_Attack_Chop",
        scale=1.05,
        desc="A masked executioner swinging a huge axe.",
    ),
    "pekka": troop(
        "knight",
        gear=["Knight_Helmet"],
        attachments=horns((0.9, 0.4, 0.75), 0.28),
        tint=[0.62, 0.55, 0.95],
        attack="2H_Melee_Attack_Spin",
        scale=1.25,
        desc="A big armoured fighter with pink horns and a giant sword.",
    ),
    "guards": troop(
        "skeleton_warrior",
        weapon={"asset": "Skeleton_Blade", "pack": "kaykit-skeletons", "bone": "hand.r"},
        attachments=[{"type": "cube", "name": "shield", "size": [0.5, 0.12, 0.7], "bone": "hand.l", "offset": [0.05, 0, 0], "color": [0.35, 0.35, 0.4]}],
        attack="1H_Melee_Attack_Stab",
        scale=0.95,
        desc="Two skeletons with spears and a shield.",
    ),
    "prince": troop(
        "knight",
        gear=["2H_Sword", "Knight_Helmet", "Knight_Cape"],
        attachments=crown(),
        tint=GOLD,
        attack="2H_Melee_Attack_Spin",
        desc="A golden prince with a lance and a crown.",
    ),
    "golem": troop(
        "barbarian",
        attachments=rock_plates((0.42, 0.42, 0.46))
        + [{"type": "sphere", "name": "core", "radius": 0.22, "bone": "chest", "offset": [0, -0.42, -0.05], "color": [0.9, 0.3, 0.9], "emissive": True, "emission": 1.2}],
        tint=ROCK,
        attack="Unarmed_Melee_Attack_Punch_B",
        scale=1.8,
        desc="A stone golem with a glowing purple core and blue crystals.",
    ),
    "skeleton-army": troop(
        "skeleton_warrior",
        weapon={"asset": "Skeleton_Blade", "pack": "kaykit-skeletons", "bone": "hand.r"},
        attack="1H_Melee_Attack_Slice_Horizontal",
        scale=0.92,
        desc="A horde of skeletons with swords.",
    ),
    "witch": troop(
        "mage",
        gear=["Spellbook_open", "Mage_Hat", "Mage_Cape"],
        attack="Spellcast_Long",
        magic=orb(ARCANE, 0.19),
        desc="A dark witch in a purple dress raising her skeletal hand.",
    ),
    "fisherman": troop(
        "barbarian",
        weapon={"asset": "arrow", "bone": "hand.r", "scale": 1.6, "rot": [0, 90, 0]},
        tint=[0.65, 0.85, 0.95],
        attack="1H_Melee_Attack_Stab",
        scale=0.95,
        desc="A man with a fishing rod and a fish on the line.",
    ),
    "bandit": troop(
        "rogue",
        gear=["Knife", "Rogue_Cape"],
        tint=[0.55, 0.5, 0.55],
        attack="1H_Melee_Attack_Stab",
        desc="A masked bandit with a dagger.",
    ),
    "electro-wizard": troop(
        "mage",
        gear=["2H_Staff", "Mage_Hat"],
        attack="Spellcasting",
        magic=orb(BOLT, 0.21),
        desc="A wizard whose staff crackles with electricity.",
    ),
    "inferno-dragon": troop(
        "mage",
        attachments=wings((0.9, 0.45, 0.25), 0.55, 0.15) + [tail((0.9, 0.45, 0.25))],
        tint=[1.25, 0.5, 0.35],
        attack="Spellcasting",
        magic=orb(FIRE, 0.24),
        hover={"height": 0.5, "bob": 0.08},
        scale=0.7,
        desc="A dragon that breathes a stream of fire.",
    ),
    "lava-hound": troop(
        "barbarian",
        attachments=[
            {"type": "sphere", "name": "body", "radius": 0.6, "bone": "hips", "offset": [0, 0.2, -0.1], "color": [1.0, 0.35, 0.12], "emissive": True, "emission": 1.0},
            {"type": "cone", "name": "head", "radius": 0.35, "depth": 0.6, "bone": "head", "offset": [0, -0.15, 0], "rot": [-90, 0, 0], "color": [1.0, 0.45, 0.15]},
        ],
        tint=[1.3, 0.5, 0.25],
        attack="1H_Melee_Attack_Chop",
        scale=1.1,
        desc="A lava hound with a molten body.",
    ),
    "ice-wizard": troop(
        "mage",
        gear=["2H_Staff", "Mage_Hat"],
        tint=[0.6, 0.85, 1.25],
        attack="Spellcast_Long",
        magic=orb(ICE, 0.21),
        desc="An ice wizard throwing a shard of ice.",
    ),
    "lumberjack": troop(
        "barbarian",
        gear=["2H_Axe"],
        tint=[1.1, 0.9, 0.75],
        attack="2H_Melee_Attack_Chop",
        desc="A lumberjack swinging a huge axe.",
    ),
    "mega-knight": troop(
        "knight",
        gear=["2H_Sword", "Knight_Helmet", "Knight_Cape"],
        attack="2H_Melee_Attack_Spin",
        scale=1.55,
        desc="A huge armoured knight with a two-handed sword.",
    ),
    "magic-archer": troop(
        "rogue_hooded",
        gear=["Rogue_Cape"],
        attachments=bow((0.6, 0.3, 0.9)),
        tint=PURPLE,
        attack="1H_Ranged_Shoot",
        magic=orb(ARCANE, 0.16),
        desc="An archer with a bow of purple energy.",
    ),
    "mother-witch": troop(
        "mage",
        gear=["Spellbook_open", "Mage_Hat", "Mage_Cape"],
        attack="Spellcast_Long",
        magic=orb(ARCANE, 0.2),
        scale=1.05,
        desc="A witch with a spellbook and a broom.",
    ),
    "night-witch": troop(
        "mage",
        gear=["1H_Wand", "Mage_Hat"],
        tint=[0.6, 0.5, 0.9],
        attack="Spellcasting",
        magic=orb(ARCANE, 0.2),
        desc="A witch with a horned hat and a wand.",
    ),
    "phoenix": troop(
        "mage",
        attachments=wings((1.3, 0.6, 0.2), 0.6, 0.2) + [tail((1.3, 0.6, 0.2))],
        tint=[1.35, 0.7, 0.35],
        attack="Spellcast_Raise",
        magic=orb(FIRE, 0.24),
        hover={"height": 0.55, "bob": 0.09},
        desc="A fiery bird with burning wings.",
    ),
    "princess": troop(
        "rogue_hooded",
        attachments=bow() + [{"type": "sphere", "name": "crown", "radius": 0.26, "bone": "head", "offset": [0, 0, 0.06], "color": [1.0, 0.82, 0.25]}],
        tint=[1.15, 0.8, 0.95],
        attack="1H_Ranged_Shoot",
        magic=orb(ICE, 0.18),
        desc="An archer princess with a bow and a golden crown.",
    ),
    "ram-rider": troop(
        "barbarian",
        attachments=[{"type": "sphere", "name": "ram", "radius": 0.5, "bone": "hips", "offset": [0, 0.42, -0.12], "color": [0.8, 0.78, 0.72]}],
        tint=SKIN,
        attack="2H_Melee_Attack_Spin",
        scale=1.05,
        desc="A man on a ram with a lance.",
    ),
    "miner": troop(
        "barbarian",
        attachments=pickaxe(),
        tint=[0.75, 0.65, 0.55],
        attack="1H_Melee_Attack_Chop",
        desc="A miner with a pickaxe.",
    ),
    "archer-queen": troop(
        "rogue_hooded",
        attachments=bow() + [{"type": "sphere", "name": "crown", "radius": 0.26, "bone": "head", "offset": [0, 0, 0.06], "color": [1.0, 0.82, 0.25]}],
        tint=GOLD,
        attack="1H_Ranged_Shooting",
        desc="The archer queen with a bow and a crown.",
    ),
    "sparky": troop(
        "mage",
        gear=["Mage_Hat", "1H_Wand"],
        attack="Spellcast_Raise",
        magic=orb(BOLT, 0.2),
        desc="A wizard with a crackling spark on his hat.",
    ),
    "royal-ghost": troop(
        "mage",
        gear=["2H_Staff", "Mage_Hat"],
        tint=[1.05, 1.05, 1.15],
        attack="Spellcasting",
        magic=orb(ICE, 0.18),
        desc="A transparent ghostly king with a crown.",
    ),
    "boss-bandit": troop(
        "rogue",
        gear=["Knife", "Knife_Offhand", "Rogue_Cape"],
        tint=[0.5, 0.45, 0.5],
        attack="Dualwield_Melee_Attack_Slice",
        scale=1.35,
        desc="A big bandit with two daggers.",
    ),
    "golden-knight": troop(
        "knight",
        gear=["2H_Sword", "Knight_Helmet", "Knight_Cape"],
        tint=GOLD,
        attack="2H_Melee_Attack_Spin",
        desc="A golden knight with a sword and a shield.",
    ),
    "little-prince": troop(
        "rogue_hooded",
        attachments=[{"type": "sphere", "name": "crown", "radius": 0.22, "bone": "head", "offset": [0, 0, 0.05], "color": [1.0, 0.82, 0.25]}],
        tint=GOLD,
        attack="1H_Ranged_Shoot",
        scale=0.62,
        desc="A small prince with a crossbow and a crown.",
    ),
    "goblinstein": troop(
        "rogue_hooded",
        gear=["Knife", "Rogue_Cape"],
        attachments=[belly(0.45, (0.18, 0.42, 0.12))],
        tint=GREEN,
        attack="1H_Melee_Attack_Chop",
        scale=1.25,
        desc="A Frankenstein goblin, stitched together and huge.",
    ),
    "mighty-miner": troop(
        "barbarian",
        attachments=pickaxe(),
        tint=[0.8, 0.7, 0.6],
        attack="1H_Melee_Attack_Chop",
        scale=1.05,
        desc="A mighty miner with a pickaxe and a moustache.",
    ),
    "monk": troop(
        "mage",
        gear=["Mage_Cape"],
        tint=[1.05, 0.8, 0.55],
        attack="Unarmed_Melee_Attack_Punch_A",
        scale=0.95,
        desc="A bald monk in an orange robe.",
    ),
    "skeleton-king": troop(
        "skeleton_warrior",
        gear=["Skeleton_Warrior_Helmet"],
        weapon={"asset": "Skeleton_Staff", "pack": "kaykit-skeletons", "bone": "hand.r"},
        attack="Spellcast_Long",
        magic=orb(ICE, 0.2),
        scale=1.15,
        desc="A skeleton king with a crown and a staff.",
    ),
    "furnace": prop(
        [
            cube("base", [1.4, 1.2, 1.0], [0, 0, 0.5], [0.26, 0.24, 0.26]),
            cyl("flue", 0.28, 1.1, [0, 0.35, 1.5], [0.28, 0.26, 0.28]),
            cube("mouth", [0.7, 0.12, 0.5], [0, -0.62, 0.55], [0.12, 0.1, 0.1]),
            ball("fire", 0.3, [0, -0.6, 0.6], [1.0, 0.45, 0.1], emissive=True, glow=True, emission=1.4),
        ],
        desc="A stone furnace that spits fire.",
    ),
    # --- the buildings ------------------------------------------------------
    "cannon": prop(
        [
            cube("base", [1.1, 1.1, 0.35], [0, 0, 0.18], [0.3, 0.3, 0.33]),
            cyl("barrel", 0.26, 1.3, [0, -0.35, 0.75], [0.25, 0.26, 0.3], rot=[72, 0, 0]),
            cyl("wheelL", 0.42, 0.16, [-0.55, 0, 0.42], [0.22, 0.16, 0.12], rot=[0, 90, 0]),
            cyl("wheelR", 0.42, 0.16, [0.55, 0, 0.42], [0.22, 0.16, 0.12], rot=[0, 90, 0]),
            ball("muzzle", 0.16, [0, -0.85, 0.95], [1.0, 0.7, 0.25], emissive=True, glow=True, emission=1.2),
        ],
        desc="A cannon on a wooden carriage with two wheels.",
    ),
    "tesla": prop(
        [
            cyl("post", 0.34, 1.1, [0, 0, 0.55], [0.45, 0.35, 0.22]),
            cube("coil", [0.5, 0.5, 0.22], [0, 0, 1.15], [0.35, 0.28, 0.2]),
            torus("ring", 0.34, 0.07, [0, 0, 1.35], [0.5, 0.42, 0.25]),
            ball("spark", 0.2, [0, 0, 1.55], [0.35, 0.65, 1.0], emissive=True, glow=True, emission=0.35),
        ],
        desc="A buried tesla coil that fires lightning.",
    ),
    "mortar": prop(
        [
            cyl("pit", 0.72, 0.3, [0, 0, 0.15], [0.35, 0.33, 0.3]),
            cyl("tube", 0.34, 1.25, [0, -0.15, 0.85], [0.3, 0.28, 0.26], rot=[62, 0, 0]),
            ball("shell", 0.2, [0, -0.45, 1.35], [1.0, 0.6, 0.15], emissive=True, glow=True, emission=1.3),
        ],
        desc="A mortar that lobs shells at the enemy tower.",
    ),
    "barbarian-hut": prop(
        [
            cube("walls", [1.5, 1.3, 1.0], [0, 0, 0.5], [0.62, 0.45, 0.28]),
            cube("beam", [1.56, 0.16, 0.16], [0, -0.62, 0.62], [0.3, 0.2, 0.13]),
            cone("roof", 1.15, 0.85, [0, 0, 1.4], [0.32, 0.2, 0.13]),
            cube("door", [0.42, 0.12, 0.6], [0, -0.68, 0.3], [0.18, 0.12, 0.09]),
            cyl("torch", 0.05, 0.4, [0.45, -0.66, 0.7], [0.25, 0.18, 0.12]),
            ball("light", 0.15, [0.45, -0.68, 0.95], [1.0, 0.55, 0.15], emissive=True, glow=True, emission=0.9),
        ],
        desc="A wooden hut where barbarians spawn.",
    ),
    "goblin-hut": prop(
        [
            cube("walls", [1.4, 1.2, 0.95], [0, 0, 0.48], [0.48, 0.58, 0.3]),
            cube("beam", [1.46, 0.16, 0.16], [0, -0.58, 0.58], [0.24, 0.3, 0.15]),
            cone("roof", 1.05, 0.8, [0, 0, 1.32], [0.22, 0.32, 0.16]),
            cube("door", [0.4, 0.12, 0.55], [0, -0.63, 0.28], [0.14, 0.18, 0.1]),
            cyl("torch", 0.05, 0.4, [-0.42, -0.6, 0.66], [0.22, 0.16, 0.1]),
            ball("light", 0.13, [-0.42, -0.62, 0.9], [0.45, 0.95, 0.3], emissive=True, glow=True, emission=0.9),
        ],
        desc="A green goblin hut.",
    ),
    "goblin-cage": prop(
        [
            cube("floor", [1.4, 1.4, 0.2], [0, 0, 0.1], [0.4, 0.35, 0.25]),
            cyl("barA", 0.07, 1.4, [-0.55, -0.6, 0.8], [0.3, 0.28, 0.22]),
            cyl("barB", 0.07, 1.4, [0, -0.6, 0.8], [0.3, 0.28, 0.22]),
            cyl("barC", 0.07, 1.4, [0.55, -0.6, 0.8], [0.3, 0.28, 0.22]),
            cyl("top", 0.09, 1.3, [0, -0.6, 1.5], [0.34, 0.3, 0.22], rot=[0, 90, 0]),
            ball("goblin", 0.26, [0, 0, 0.6], [0.45, 0.9, 0.4], emissive=True, glow=True, emission=0.7),
        ],
        desc="A cage that drops goblins on the enemy side.",
    ),
    "bomb-tower": prop(
        [
            cyl("tower", 0.55, 1.3, [0, 0, 0.65], [0.42, 0.4, 0.42]),
            cyl("top", 0.72, 0.35, [0, 0, 1.45], [0.3, 0.28, 0.3]),
            ball("bomb", 0.32, [0, 0, 1.85], [0.15, 0.15, 0.17]),
            ball("fuse", 0.1, [0.1, 0, 2.08], [1.0, 0.5, 0.1], emissive=True, glow=True, emission=1.6),
        ],
        desc="A tower that drops bombs on the enemy tower.",
    ),
    "inferno-tower": prop(
        [
            cyl("tower", 0.5, 1.5, [0, 0, 0.75], [0.35, 0.32, 0.35]),
            cyl("crown", 0.62, 0.3, [0, 0, 1.62], [0.28, 0.25, 0.28]),
            ball("flame", 0.28, [0, 0, 1.95], [1.0, 0.35, 0.08], emissive=True, glow=True, emission=1.8),
        ],
        desc="A tower that breathes a stream of fire.",
    ),
    "elixir-collector": prop(
        [
            cyl("tank", 0.6, 1.1, [0, 0, 0.55], [0.45, 0.3, 0.55]),
            cyl("rim", 0.68, 0.18, [0, 0, 1.16], [0.3, 0.2, 0.4]),
            ball("elixir", 0.22, [0, 0, 1.4], [0.6, 0.2, 0.95], emissive=True, glow=True, emission=0.4),
        ],
        desc="A tank that collects elixir and spawns a golem.",
    ),
    "tombstone": prop(
        [
            cube("stone", [0.85, 0.28, 1.1], [0, 0, 0.55], [0.55, 0.55, 0.58]),
            cone("top", 0.43, 0.4, [0, 0, 1.28], [0.55, 0.55, 0.58]),
            cube("rune", [0.4, 0.06, 0.5], [0, -0.16, 0.7], [0.2, 0.25, 0.3]),
            ball("runeGlow", 0.13, [0, -0.2, 0.7], [0.3, 0.6, 0.95], emissive=True, glow=True, emission=0.35),
        ],
        desc="A tombstone that spawns skeletons.",
    ),
    "goblin-drill": prop(
        [
            cyl("body", 0.45, 0.9, [0, 0, 0.55], [0.35, 0.45, 0.25]),
            cone("drill", 0.42, 1.1, [0, 0, 0.2], [0.55, 0.5, 0.45], rot=[180, 0, 0]),
            ball("glow", 0.15, [0, 0, 1.15], [0.6, 1.0, 0.4], emissive=True, glow=True, emission=1.4),
        ],
        desc="A drill that burrows under the bridge.",
    ),
    "x-bow": prop(
        [
            cube("frame", [1.5, 0.7, 0.5], [0, 0, 0.35], [0.38, 0.3, 0.24]),
            cube("rail", [0.25, 0.3, 1.5], [0, 0, 0.9], [0.45, 0.35, 0.26]),
            cyl("limb", 0.08, 1.5, [0, 0, 1.5], [0.3, 0.24, 0.2], rot=[0, 0, 90]),
            ball("bolt", 0.13, [0, -0.35, 1.0], [1.0, 0.8, 0.3], emissive=True, glow=True, emission=1.3),
        ],
        desc="A crossbow that fires two bolts at a time.",
    ),
    # --- the spells ---------------------------------------------------------
    "arrows": prop(
        [
            cyl("shaftA", 0.05, 1.1, [-0.25, 0, 0.5], [0.6, 0.45, 0.25], rot=[0, 20, 0]),
            cyl("shaftB", 0.05, 1.1, [0.25, 0, 0.5], [0.6, 0.45, 0.25], rot=[0, -20, 0]),
            cone("tipA", 0.11, 0.3, [-0.36, 0, 1.05], [0.8, 0.8, 0.85], rot=[0, 20, 0]),
            cone("tipB", 0.11, 0.3, [0.36, 0, 1.05], [0.8, 0.8, 0.85], rot=[0, -20, 0]),
        ],
        desc="A volley of arrows raining down on an area.",
    ),
    "fireball": prop(
        [
            ball("core", 0.4, [0, 0, 0.6], [1.0, 0.45, 0.08], emissive=True, glow=True, emission=1.6),
            ball("tail", 0.24, [0, 0.32, 0.6], [1.0, 0.65, 0.15], emissive=True, glow=True, emission=1.1),
        ],
        desc="A big fireball that explodes in a burst of flame.",
    ),
    "giant-snowball": prop(
        [
            ball("snow", 0.52, [0, 0, 0.6], [0.5, 0.72, 0.95], emissive=True, glow=True, emission=0.3),
            ball("crust", 0.18, [0.2, 0.1, 0.75], [0.45, 0.62, 0.9]),
        ],
        desc="A giant snowball that freezes everything it hits.",
    ),
    "zap": prop(
        [
            cyl("bolt", 0.06, 1.0, [0, 0, 0.55], [0.35, 0.7, 1.0], emissive=True, glow=True, emission=0.35),
            ball("spark", 0.14, [0, 0, 1.1], [0.85, 0.8, 0.3], emissive=True, glow=True, emission=0.35),
        ],
        desc="A lightning zap that stuns and destroys small troops.",
    ),
    "barbarian-barrel": prop(
        [
            cyl("barrel", 0.45, 1.0, [0, 0, 0.55], [0.5, 0.35, 0.22]),
            cyl("band", 0.48, 0.12, [0, 0, 0.3], [0.3, 0.3, 0.32]),
            cyl("band2", 0.48, 0.12, [0, 0, 0.8], [0.3, 0.3, 0.32]),
            ball("spark", 0.14, [0, 0, 1.15], [1.0, 0.6, 0.2], emissive=True, glow=True, emission=1.4),
        ],
        desc="A barrel of barbarians that explodes into a horde.",
    ),
    "goblin-barrel": prop(
        [
            cyl("barrel", 0.45, 1.0, [0, 0, 0.55], [0.35, 0.45, 0.25]),
            cyl("band", 0.48, 0.12, [0, 0, 0.3], [0.28, 0.3, 0.2]),
            ball("goblin", 0.22, [0, 0, 1.1], [0.5, 0.95, 0.4], emissive=True, glow=True, emission=1.0),
        ],
        desc="A barrel of goblins that hops onto the arena.",
    ),
    "earthquake": prop(
        [
            cube("crack", [1.4, 0.2, 0.18], [0, 0, 0.1], [0.25, 0.2, 0.16]),
            cube("crack2", [0.2, 1.2, 0.16], [0.2, 0.1, 0.1], [0.22, 0.18, 0.15]),
            cube("rockA", [0.35, 0.35, 0.35], [-0.4, 0.1, 0.2], [0.4, 0.36, 0.3]),
            cube("rockB", [0.3, 0.3, 0.3], [0.45, -0.1, 0.18], [0.38, 0.34, 0.28]),
            ball("dust", 0.28, [0, 0.1, 0.4], [0.75, 0.65, 0.5], emissive=True, glow=True, emission=0.5),
        ],
        desc="An earthquake that shakes the ground and slows the troops.",
    ),
    "royal-delivery": prop(
        [
            cyl("box", 0.45, 0.9, [0, 0, 0.5], [0.55, 0.32, 0.2]),
            cone("lid", 0.5, 0.35, [0, 0, 1.1], [0.4, 0.24, 0.16]),
            ball("royal", 0.14, [0, 0, 1.35], [1.0, 0.8, 0.25], emissive=True, glow=True, emission=1.4),
        ],
        desc="A royal delivery box that drops three recruits.",
    ),
    "freeze": prop(
        [
            cyl("ice", 0.4, 1.1, [0, 0, 0.55], [0.42, 0.68, 0.95], emissive=True, glow=True, emission=0.25),
            cone("shard", 0.22, 0.5, [0.2, 0.1, 1.1], [0.55, 0.8, 1.0]),
            cone("shard2", 0.16, 0.4, [-0.2, -0.1, 1.0], [0.5, 0.75, 1.0]),
        ],
        desc="A freeze that locks a whole area in ice.",
    ),
    "clone": prop(
        [
            ball("head", 0.3, [0, 0, 1.05], [0.5, 0.62, 0.85]),
            cyl("body", 0.4, 0.9, [0, 0, 0.45], [0.4, 0.55, 0.8], emissive=True, glow=True, emission=0.2),
            ball("aura", 0.16, [0, 0, 1.5], [0.55, 0.75, 1.0], emissive=True, glow=True, emission=0.35),
        ],
        desc="A clone spell that copies the last card played.",
    ),
    "rocket": prop(
        [
            cyl("body", 0.22, 1.2, [0, 0, 0.7], [0.7, 0.7, 0.75]),
            cone("nose", 0.22, 0.45, [0, 0, 1.5], [1.0, 0.3, 0.15]),
            cube("finA", [0.1, 0.3, 0.35], [0.2, 0, 0.25], [0.6, 0.3, 0.2]),
            cube("finB", [0.1, 0.3, 0.35], [-0.2, 0, 0.25], [0.6, 0.3, 0.2]),
            ball("flame", 0.22, [0, 0, 0.05], [1.0, 0.55, 0.1], emissive=True, glow=True, emission=1.8),
        ],
        desc="A rocket that flies over the units and hits the tower.",
    ),
    "goblin-curse": prop(
        [
            ball("curse", 0.38, [0, 0, 0.6], [0.45, 0.9, 0.35], emissive=True, glow=True, emission=1.2),
            torus("ring", 0.45, 0.06, [0, 0, 0.6], [0.35, 0.7, 0.3]),
        ],
        desc="A curse that turns the enemy troops into goblins.",
    ),
    "lightning": prop(
        [
            cyl("boltA", 0.08, 0.8, [0, 0.15, 0.5], [0.5, 0.62, 0.95], emissive=True, glow=True, emission=0.35),
            cyl("boltB", 0.07, 0.7, [0.12, -0.1, 0.95], [0.5, 0.62, 0.95], emissive=True, glow=True, emission=0.35),
            ball("flash", 0.22, [0, 0, 1.4], [0.8, 0.8, 0.6], emissive=True, glow=True, emission=0.35),
        ],
        desc="A lightning strike that stuns and damages a big area.",
    ),
    "poison": prop(
        [
            cyl("vial", 0.3, 0.7, [0, 0, 0.5], [0.35, 0.3, 0.4]),
            cyl("liquid", 0.26, 0.4, [0, 0, 0.4], [0.5, 0.9, 0.3], emissive=True, glow=True, emission=1.0),
            ball("bubble", 0.12, [0.1, 0.05, 0.95], [0.6, 1.0, 0.4], emissive=True, glow=True, emission=1.3),
        ],
        desc="A poison cloud that keeps damaging and slowing the troops.",
    ),
    "tornado": prop(
        [
            cyl("core", 0.18, 1.5, [0, 0, 0.8], [0.42, 0.58, 0.8], emissive=True, glow=True, emission=0.25),
            cyl("ringA", 0.55, 0.12, [0, 0, 0.35], [0.45, 0.58, 0.8]),
            cyl("ringB", 0.4, 0.12, [0, 0, 0.9], [0.45, 0.58, 0.8]),
            ball("top", 0.18, [0, 0, 1.6], [0.85, 0.9, 1.0], emissive=True, glow=True, emission=1.1),
        ],
        desc="A tornado that drags the troops around.",
    ),
    "rage": prop(
        [
            ball("core", 0.34, [0, 0, 0.6], [1.0, 0.35, 0.3], emissive=True, glow=True, emission=1.5),
            torus("ring", 0.5, 0.07, [0, 0, 0.6], [1.0, 0.5, 0.35]),
        ],
        desc="A rage spell that makes the troops furious and faster.",
    ),
    "void": prop(
        [
            ball("void", 0.42, [0, 0, 0.65], [0.18, 0.1, 0.3], emissive=True, glow=True, emission=0.9),
            torus("ring", 0.55, 0.07, [0, 0, 0.65], [0.55, 0.3, 0.9]),
            ball("spark", 0.1, [0.35, 0.1, 1.0], [0.8, 0.5, 1.0], emissive=True, glow=True, emission=1.4),
        ],
        desc="A void that swallows the troops and the buildings.",
    ),
    "the-log": prop(
        [
            cyl("log", 0.4, 1.5, [0, 0, 0.45], [0.45, 0.3, 0.18], rot=[0, 0, 90]),
            cyl("ringA", 0.42, 0.1, [-0.5, 0, 0.45], [0.6, 0.45, 0.25], rot=[0, 0, 90]),
            cyl("ringB", 0.42, 0.1, [0.5, 0, 0.45], [0.6, 0.45, 0.25], rot=[0, 0, 90]),
        ],
        desc="A rolling log that knocks down the troops in its way.",
    ),
    "graveyard": prop(
        [
            cube("mound", [1.5, 1.2, 0.35], [0, 0, 0.18], [0.3, 0.35, 0.25]),
            cube("stoneA", [0.4, 0.16, 0.6], [-0.35, -0.1, 0.6], [0.55, 0.55, 0.58]),
            cube("stoneB", [0.4, 0.16, 0.45], [0.3, 0.05, 0.5], [0.5, 0.5, 0.53]),
            ball("soul", 0.16, [0, -0.2, 0.95], [0.35, 0.6, 0.95], emissive=True, glow=True, emission=0.35),
        ],
        desc="A graveyard that spawns skeletons on the field.",
    ),
    # --- the towers ---------------------------------------------------------
    "tower-princess": prop(
        [
            cyl("base", 0.72, 0.3, [0, 0, 0.15], [0.45, 0.4, 0.4]),
            cyl("body", 0.55, 1.5, [0, 0, 0.95], [0.62, 0.58, 0.58]),
            cyl("crown", 0.72, 0.25, [0, 0, 1.8], [0.5, 0.46, 0.46]),
            cone("roof", 0.72, 0.7, [0, 0, 2.2], [0.72, 0.35, 0.3]),
            ball("gem", 0.12, [0, -0.5, 1.95], [0.35, 0.6, 0.95], emissive=True, glow=True, emission=0.35),
        ],
        desc="The red princess tower with a red roof.",
    ),
    "dagger-duchess": prop(
        [
            cyl("base", 0.72, 0.3, [0, 0, 0.15], [0.35, 0.32, 0.4]),
            cyl("body", 0.55, 1.5, [0, 0, 0.95], [0.45, 0.42, 0.55]),
            cyl("crown", 0.72, 0.25, [0, 0, 1.8], [0.38, 0.34, 0.48]),
            cone("roof", 0.72, 0.7, [0, 0, 2.2], [0.45, 0.25, 0.6]),
            ball("gem", 0.12, [0, -0.5, 1.95], [0.55, 0.3, 0.9], emissive=True, glow=True, emission=0.35),
        ],
        desc="The blue dagger duchess tower.",
    ),
    "cannoneer": prop(
        [
            cyl("base", 0.75, 0.3, [0, 0, 0.15], [0.4, 0.38, 0.4]),
            cyl("body", 0.58, 1.6, [0, 0, 1.0], [0.5, 0.47, 0.5]),
            cyl("crown", 0.75, 0.25, [0, 0, 1.9], [0.42, 0.4, 0.42]),
            cyl("barrel", 0.2, 1.0, [0, -0.45, 2.2], [0.3, 0.3, 0.33], rot=[75, 0, 0]),
            ball("muzzle", 0.14, [0, -0.75, 2.45], [1.0, 0.75, 0.25], emissive=True, glow=True, emission=1.3),
        ],
        desc="A cannon tower that shoots at the enemy.",
    ),
    "royal-chef": prop(
        [
            cyl("base", 0.72, 0.3, [0, 0, 0.15], [0.45, 0.42, 0.42]),
            cyl("body", 0.55, 1.5, [0, 0, 0.95], [0.85, 0.85, 0.88]),
            cyl("crown", 0.72, 0.25, [0, 0, 1.8], [0.5, 0.48, 0.5]),
            cone("hat", 0.5, 0.75, [0, 0, 2.25], [0.95, 0.95, 0.98]),
            ball("gem", 0.12, [0, -0.5, 1.95], [1.0, 0.8, 0.3], emissive=True, glow=True, emission=1.3),
        ],
        desc="The royal chef tower.",
    ),
}
