"""CR Clone AI service — rule-based bot brain (Phase 6).

Difficulty behaviour (``choose_move``):
  * easy   — uniform random affordable card + uniform random legal position.
  * medium — greedy: highest DPS-per-elixir affordable troop/building on the lane
    of the weakest standing enemy princess tower.
  * hard   — medium greedy + counters: spend Zap/Fireball only into real swarm
    clusters (centroid), defend with a hard counter when the weakest own tower
    drops below 50% HP, otherwise tank-first split-push away from enemy pressure.

Performance budget (MEMORY#20): every branch is synchronous, does no I/O and
loads no model. All scans are single-pass and streaming; only the result dict
(plus one constant-bounded <=4-element helper list on the easy path) is
allocated per call. Worst-case work is a few hundred float ops, i.e. well under
the 50 ms p95 budget (typically microseconds). Per-function Big-O is stated in
each docstring: h = hand size (<=4), t = towers (<=6), u = live units (<=40).

State shape (tolerant): ``state`` is a ``GameState``-like mapping with
optional ``towers`` / ``units`` lists of mappings (both camelCase and snake_case
keys accepted) plus an optional bot-side hint under ``side`` / ``bot_side`` /
``botSide`` (default ``"red"``). Missing/empty state degrades gracefully to a
sensible default push. ``hand`` is a list of card-id strings (aliases such as
``"golem"`` / ``"mini_pekka"`` are normalised).
"""

from __future__ import annotations

import random
from collections.abc import Mapping
from typing import Any

__all__ = ["CARDS", "DIFFICULTIES", "choose_move"]

# ---------------------------------------------------------------------------
# Module-level tables (shared, never mutated per call).
# Stats mirror GAME_DESIGN.md section 1 (tournament baseline, Level 9).
# ---------------------------------------------------------------------------

DIFFICULTIES = ("easy", "medium", "hard")

ARENA_W = 18.0
ARENA_H = 32.0
LEFT_LANE_X = 3.5
RIGHT_LANE_X = 13.5
RIVER_TOP = 14.0      # last deployable row for blue (own half y <= 14)
RIVER_BOTTOM = 17.0   # first deployable row for red (own half y >= 17)

# Per-card table: cost/hp/dps/speed/range/targets (+ spell damage/radius).
# dps for spells is 0 (instant damage lives in ``damage``); speed 0.0 = static.
CARDS: dict[str, dict[str, Any]] = {
    "knight":      {"cost": 3, "hp": 1450, "dps": 150, "speed": 0.9,
                    "range": 0.8, "targets": "ground", "count": 1, "type": "troop"},
    "archers":     {"cost": 3, "hp": 600, "dps": 172, "speed": 0.9,
                    "range": 5.5, "targets": "air+ground", "count": 2, "type": "troop"},
    "giant":       {"cost": 5, "hp": 3400, "dps": 140, "speed": 0.6,
                    "range": 0.8, "targets": "buildings", "count": 1, "type": "troop"},
    "skeletons":   {"cost": 1, "hp": 240, "dps": 240, "speed": 1.2,
                    "range": 0.6, "targets": "ground", "count": 3, "type": "troop"},
    "musketeer":   {"cost": 4, "hp": 600, "dps": 200, "speed": 0.9,
                    "range": 6.0, "targets": "air+ground", "count": 1, "type": "troop"},
    "baby-dragon": {"cost": 4, "hp": 1100, "dps": 94, "speed": 1.1,
                    "range": 3.5, "targets": "air+ground", "count": 1,
                    "type": "troop", "splash": True},
    "mini-pekka":  {"cost": 4, "hp": 1100, "dps": 344, "speed": 1.2,
                    "range": 0.8, "targets": "ground", "count": 1, "type": "troop"},
    "rock-golem":  {"cost": 6, "hp": 4300, "dps": 130, "speed": 0.5,
                    "range": 0.8, "targets": "buildings", "count": 1,
                    "type": "troop", "deathBurst": 280},
    "fireball":    {"cost": 4, "hp": 0, "dps": 0, "speed": 0.0,
                    "range": 32.0, "targets": "any", "type": "spell",
                    "damage": 700, "towerDamage": 280, "radius": 2.5},
    "arrows":      {"cost": 3, "hp": 0, "dps": 0, "speed": 0.0,
                    "range": 32.0, "targets": "any", "type": "spell",
                    "damage": 300, "towerDamage": 120, "radius": 4.0},
    "zap":         {"cost": 2, "hp": 0, "dps": 0, "speed": 0.0,
                    "range": 32.0, "targets": "any", "type": "spell",
                    "damage": 220, "towerDamage": 88, "radius": 2.5, "stunMs": 500},
    "cannon":      {"cost": 3, "hp": 750, "dps": 262, "speed": 0.0,
                    "range": 5.5, "targets": "ground", "count": 1,
                    "type": "building", "lifetimeMs": 30000},
}

# Common id aliases -> canonical ids (O(1) dict lookup).
_ALIASES = {
    "golem": "rock-golem",
    "rock_golem": "rock-golem",
    "rockgolem": "rock-golem",
    "baby_dragon": "baby-dragon",
    "babydragon": "baby-dragon",
    "mini_pekka": "mini-pekka",
    "minipekka": "mini-pekka",
    "mini-pekka": "mini-pekka",
    "skeleton": "skeletons",
}

# Greedy value per troop/building, precomputed DPS-per-elixir (O(1) lookup).
_VALUE: dict[str, float] = {
    cid: (spec["dps"] / spec["cost"] if spec["cost"] else 0.0)
    for cid, spec in CARDS.items() if spec["type"] != "spell"
}
# Spell fallback value (damage-per-elixir) for spell-vs-spell comparison.
_SPELL_VALUE: dict[str, float] = {
    cid: (spec["damage"] / spec["cost"] if spec["cost"] else 0.0)
    for cid, spec in CARDS.items() if spec["type"] == "spell"
}

_TANKS = frozenset({"rock-golem", "giant", "knight"})
_TANK_ORDER = ("rock-golem", "giant", "knight")  # richest win-con first
_SUPPORTS = frozenset({"musketeer", "archers", "baby-dragon"})

# Threat card -> preferred answers, cheapest reliable counter first (§3).
_COUNTERS: dict[str, tuple[str, ...]] = {
    "giant": ("cannon", "mini-pekka", "skeletons"),
    "rock-golem": ("cannon", "mini-pekka", "skeletons"),
    "knight": ("musketeer", "mini-pekka", "cannon"),
    "mini-pekka": ("skeletons", "archers", "knight"),
    "musketeer": ("fireball", "mini-pekka", "knight"),
    "archers": ("fireball", "arrows", "baby-dragon"),
    "skeletons": ("zap", "arrows", "baby-dragon"),
    "baby-dragon": ("musketeer", "archers"),
    "cannon": ("baby-dragon", "fireball", "knight"),
}

_DEFEND_FRAC = 0.5      # defend when weakest own tower HP < 50%
_TANK_ELIXIR = 7        # push a tank first when this rich
_ZAP_R = 2.5            # cluster radius for zap/fireball answers
_SWARM_MIN = 2          # min units in radius to spend a spell
_ZAP_HP_CAP = 440.0     # zap (220 dmg) handles clusters up to ~2x damage


# ---------------------------------------------------------------------------
# Small O(1) helpers.
# ---------------------------------------------------------------------------

def _norm_id(card: str) -> str:
    """Canonicalise a card id (case/alias tolerant). Time O(1), space O(1)."""
    cid = str(card).strip().lower().replace("_", "-")
    return _ALIASES.get(cid, cid)


def _is_spell(cid: str) -> bool:
    """True for spells (cast anywhere). Time O(1), space O(1)."""
    spec = CARDS.get(cid)
    return spec is not None and spec["type"] == "spell"


def _bot_side(state: Mapping[str, Any]) -> str:
    """Bot side from state hint, default ``"red"``. Time O(1), space O(1)."""
    for key in ("side", "bot_side", "botSide", "playerSide", "bot"):
        val = state.get(key)
        if isinstance(val, str):
            v = val.strip().lower()
            if v in ("blue", "red"):
                return v
    return "red"


def _num(val: Any, default: float) -> float:
    """Coerce to float with fallback. Time O(1), space O(1)."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _pos(entity: Mapping[str, Any], default_x: float, default_y: float) -> tuple[float, float]:
    """Entity position, tolerant to {position:{x,y}} or flat x/y. O(1)/O(1)."""
    p = entity.get("position")
    if isinstance(p, Mapping):
        return _num(p.get("x"), default_x), _num(p.get("y"), default_y)
    return _num(entity.get("x"), default_x), _num(entity.get("y"), default_y)


def _tower_frac(tower: Mapping[str, Any]) -> float:
    """Tower HP fraction in [0,1]; destroyed/missing -> 0.0. O(1)/O(1)."""
    if tower.get("destroyed"):
        return 0.0
    hp = _num(tower.get("hitPoints", tower.get("hp", tower.get("health", -1.0))), -1.0)
    if hp <= 0.0:
        return 0.0
    max_hp = _num(
        tower.get("maxHitPoints", tower.get("maxHp", tower.get("maxHP", 0.0))), 0.0
    )
    if max_hp <= 0.0:  # fall back to spec defaults by kind
        kind = str(tower.get("kind", tower.get("type", "princess"))).lower()
        max_hp = 2400.0 if kind == "king" else 1400.0
    frac = hp / max_hp
    return 0.0 if frac < 0.0 else (1.0 if frac > 1.0 else frac)


def _on_bot_half(y: float, bot: str) -> bool:
    """True if y is inside the bot's deploy half. Time O(1), space O(1)."""
    return y >= RIVER_BOTTOM if bot == "red" else y <= RIVER_TOP


# ---------------------------------------------------------------------------
# Single-pass scans (streaming, no intermediate collections).
# ---------------------------------------------------------------------------

def _scan_towers(
    towers: Any, bot: str, enemy: str
) -> tuple[float, float, float, float, float, float]:
    """One pass over towers (<=6).

    Returns ``(weak_lane_x, weak_tx, weak_ty, own_frac, own_x, own_y)``:
    weakest standing enemy princess lane/tower position + weakest standing own
    tower fraction/position (king included). Time O(t), space O(1).
    """
    left_frac, right_frac = 1.0, 1.0
    weak_tx, weak_ty = LEFT_LANE_X, 9.0
    king_ex, king_ey = 8.5, 27.5 if enemy == "red" else 3.5
    own_frac, own_x, own_y = 1.0, 8.5, 27.5 if bot == "red" else 3.5
    try:
        iterator = iter(towers)  # type: ignore[arg-type]
    except TypeError:
        return LEFT_LANE_X, weak_tx, weak_ty, own_frac, own_x, own_y
    for tw in iterator:
        if not isinstance(tw, Mapping):
            continue
        owner = str(tw.get("owner", tw.get("side", ""))).lower()
        kind = str(tw.get("kind", tw.get("type", "princess"))).lower()
        frac = _tower_frac(tw)
        x, y = _pos(tw, 8.5, 15.5)
        if owner == enemy and frac > 0.0:
            if kind == "king":
                king_ex, king_ey = x, y
            else:  # princess lane tracking (x < 9 = left)
                if x < 9.0:
                    if frac < left_frac:
                        left_frac, weak_tx, weak_ty = frac, x, y
                elif frac < right_frac:
                    right_frac, weak_tx, weak_ty = frac, x, y
        elif owner == bot and frac > 0.0 and frac < own_frac:
            own_frac, own_x, own_y = frac, x, y
    if left_frac <= right_frac:
        return LEFT_LANE_X, weak_tx, weak_ty, own_frac, own_x, own_y
    return RIGHT_LANE_X, weak_tx, weak_ty, own_frac, own_x, own_y


def _scan_enemies(units: Any, enemy: str, own_x: float, own_y: float, bot: str = "red") -> tuple:
    """One pass over units (<=40).

    Returns ``(n, sumx, sumy, anchor_x, anchor_y, threat, tx, ty,
    best_key)``: enemy count + centroid sums + first-enemy anchor + the
    deepest threat (on bot half preferred, else nearest to own tower).
    Time O(u), space O(1). O(1) per unit (dist², no sqrt).
    """
    n = 0
    sumx = sumy = 0.0
    anchor_x = anchor_y = 8.5
    threat: str | None = None
    tx = ty = 8.5
    best_key = None
    try:
        iterator = iter(units)  # type: ignore[arg-type]
    except TypeError:
        return (0, 0.0, 0.0, anchor_x, anchor_y, None, tx, ty, None)
    for un in iterator:
        if not isinstance(un, Mapping):
            continue
        if str(un.get("owner", un.get("side", ""))).lower() != enemy:
            continue
        ux, uy = _pos(un, 8.5, 15.5)
        if n == 0:
            anchor_x, anchor_y = ux, uy
        n += 1
        sumx += ux
        sumy += uy
        cid: str | None = None
        for key in ("cardId", "card_id", "card"):
            val = un.get(key)
            if isinstance(val, str):
                cid = _norm_id(val)
                break
        dx, dy = ux - own_x, uy - own_y
        here = _on_bot_half(uy, bot)  # O(1): bot-half pressure preferred
        key = (0 if here else 1, dx * dx + dy * dy)
        if best_key is None or key < best_key:
            best_key = key
            threat, tx, ty = cid, ux, uy
    return (n, sumx, sumy, anchor_x, anchor_y, threat, tx, ty, best_key)


def _cluster_info(units: Any, enemy: str, ax: float, ay: float, radius: float) -> tuple[int, float]:
    """Count + total HP of enemies within ``radius`` of anchor. O(u)/O(1)."""
    count, hp_sum = 0, 0.0
    r2 = radius * radius
    try:
        iterator = iter(units)  # type: ignore[arg-type]
    except TypeError:
        return (0, 0.0)
    for un in iterator:
        if not isinstance(un, Mapping):
            continue
        if str(un.get("owner", un.get("side", ""))).lower() != enemy:
            continue
        ux, uy = _pos(un, 8.5, 15.5)
        dx, dy = ux - ax, uy - ay
        if dx * dx + dy * dy <= r2:
            count += 1
            hp_sum += _num(un.get("hitPoints", un.get("hp", 100.0)), 100.0)
    return (count, hp_sum)


def _legalize(x: float, y: float, cid: str, bot: str) -> tuple[float, float]:
    """Clamp a placement into the legal zone. Time O(1), space O(1)."""
    if _is_spell(cid):  # spells may target anywhere per GAME_DESIGN §11.2
        cx = 0.5 if x < 0.5 else (ARENA_W - 0.5 if x > ARENA_W - 0.5 else x)
        cy = 0.5 if y < 0.5 else (ARENA_H - 0.5 if y > ARENA_H - 0.5 else y)
        return (round(cx, 2), round(cy, 2))
    cx = 1.0 if x < 1.0 else (ARENA_W - 1.0 if x > ARENA_W - 1.0 else x)
    if bot == "red":
        cy = RIVER_BOTTOM + 0.5 if y < RIVER_BOTTOM + 0.5 else (30.0 if y > 30.0 else y)
    else:
        cy = 1.0 if y < 1.0 else (RIVER_TOP - 0.5 if y > RIVER_TOP - 0.5 else y)
    return (round(cx, 2), round(cy, 2))


# ---------------------------------------------------------------------------
# picks (streaming over the hand, h <= 4).
# ---------------------------------------------------------------------------

def _best_greedy(hand: list[str], elixir: float) -> tuple[str | None, int]:
    """Highest DPS-per-elixir affordable troop/building (spells last resort).

    Single pass, no intermediate list. Time O(h), space O(1).
    """
    best, best_idx, best_val = None, -1, -1.0
    spell, spell_idx, spell_val = None, -1, -1.0
    for i, cid in enumerate(hand):
        spec = CARDS.get(cid)
        if spec is None or spec["cost"] > elixir:
            continue
        if spec["type"] == "spell":
            v = _SPELL_VALUE[cid]
            if v > spell_val:
                spell, spell_idx, spell_val = cid, i, v
        else:
            v = _VALUE[cid]
            if v > best_val:
                best, best_idx, best_val = cid, i, v
    if best is not None:
        return (best, best_idx)
    return (spell, spell_idx)


def _cheapest(hand: list[str]) -> tuple[str | None, int]:
    """Cheapest known card in hand. Time O(h), space O(1)."""
    best, best_idx, best_cost = None, -1, float("inf")
    for i, cid in enumerate(hand):
        spec = CARDS.get(cid)
        if spec is not None and spec["cost"] < best_cost:
            best, best_idx, best_cost = cid, i, spec["cost"]
    return (best, best_idx)


# ---------------------------------------------------------------------------
# Public API.
# ---------------------------------------------------------------------------

def choose_move(
    state: Mapping[str, Any] | None,
    hand: list[str] | tuple[str, ...],
    elixir: float | int | dict,
    difficulty: str = "medium",
) -> dict[str, Any]:
    """Pick a bot move ``{"card", "x", "y", "handIndex"}``.

    Args:
        state: GameState-like mapping (towers/units/optional side hint).
        hand: up to 4 card-id strings (current hand).
        elixir: current bot elixir (float), or an elixir-by-side mapping.
        difficulty: ``easy`` | ``medium`` | ``hard`` (case-insensitive,
            unknown -> ``medium``).

    Returns:
        Dict with canonical ``card`` id, legal ``x``/``y`` floats and the
        ``handIndex`` of the card inside ``hand`` (``-1`` for the degenerate
        empty-hand fallback, which the server resolves/rejects per §12.4).

    Complexity: easy O(h)~O(1) bounded; medium O(h+t); hard O(h+t+u).
    Space O(1) aux beyond the result (easy keeps one <=4-element list).
    All branches complete in microseconds, far below the 50 ms p95 budget.
    """
    diff = str(difficulty or "medium").strip().lower()
    if diff not in DIFFICULTIES:
        diff = "medium"

    st: Mapping[str, Any] = state if isinstance(state, Mapping) else {}
    bot = _bot_side(st)
    enemy = "blue" if bot == "red" else "red"

    # Normalise hand once (O(h)); keep (id, original index) pairs.
    # Accepts both str ids and dict entries {card/handIndex} (server passes dicts).
    # Time O(h), space O(h) with h <= 4.
    norm: list[tuple[str, int]] = []
    for idx, raw in enumerate(hand or ()):
        if isinstance(raw, str):
            cid = _norm_id(raw)
        elif isinstance(raw, Mapping):
            for key in ("card", "cardId", "card_id", "name", "id"):
                val = raw.get(key)
                if isinstance(val, str) and val:
                    cid = _norm_id(val)
                    break
            else:
                cid = ""
        else:
            cid = ""
        if cid in CARDS:
            # Prefer caller handIndex when present, else positional idx. O(1).
            try:
                hi = int(raw.get("handIndex", raw.get("index", idx))) if isinstance(raw, Mapping) else idx
            except Exception:
                hi = idx
            norm.append((cid, hi))
    ids = [cid for cid, _ in norm]

    if isinstance(elixir, Mapping):  # tolerate elixir-by-side mapping
        elixir_val = _num(elixir.get(bot, elixir.get(enemy, 5.0)), 5.0)
    else:
        elixir_val = _num(elixir, 5.0)

    towers = st.get("towers", ())
    units = st.get("units", ())

    if diff == "easy":
        return _choose_easy(ids, norm, elixir_val, bot)
    if diff == "medium":
        return _choose_medium(ids, norm, elixir_val, towers, bot, enemy)
    return _choose_hard(ids, norm, elixir_val, towers, units, bot, enemy)


def _choose_easy(
    ids: list[str], norm: list[tuple[str, int]], elixir_val: float, bot: str
) -> dict[str, Any]:
    """Uniform random affordable card + uniform random legal position.

    Time O(h) ~= O(1) (h <= 4, one bounded pass); space O(h) for one tiny
    affordable list (constant-bounded, <= 4 refs).
    """
    affordable = [i for i, cid in enumerate(ids) if CARDS[cid]["cost"] <= elixir_val]
    if affordable:
        pick = ids[random.choice(affordable)]
    elif ids:
        pick = ids[random.randrange(len(ids))]  # nothing affordable: still suggest
    else:
        pick = "knight"  # degenerate: empty hand fallback
    if _is_spell(pick):
        x, y = random.uniform(0, ARENA_W), random.uniform(0, ARENA_H)
    elif bot == "red":
        x, y = random.uniform(1, ARENA_W - 1), random.uniform(RIVER_BOTTOM, 31.0)
    else:
        x, y = random.uniform(1, ARENA_W - 1), random.uniform(0.0, RIVER_TOP)
    x, y = _legalize(x, y, pick, bot)
    return {"card": pick, "x": x, "y": y, "handIndex": _orig_index(norm, pick)}


def _choose_medium(
    ids: list[str],
    norm: list[tuple[str, int]],
    elixir_val: float,
    towers: Any,
    bot: str,
    enemy: str,
) -> dict[str, Any]:
    """Greedy: best DPS-per-elixir affordable card on weakest enemy lane.

    Time O(h+t) single-pass scans; space O(1) aux beyond the result.
    """
    card, _ = _best_greedy(ids, elixir_val)
    if card is None:
        card, _ = _cheapest(ids)
    if card is None:
        card = "knight"
    weak_x, _, _, _, _, _ = _scan_towers(towers, bot, enemy)
    y = _push_y(card, bot)
    x, y = _legalize(weak_x, y, card, bot)
    # Spell-only fallback chips the weakest tower instead of a blind push.
    if _is_spell(card):
        _, wtx, wty, _, _, _ = _scan_towers(towers, bot, enemy)
        x, y = _legalize(wtx, wty, card, bot)
    return {"card": card, "x": x, "y": y, "handIndex": _orig_index(norm, card)}


def _choose_hard(
    ids: list[str],
    norm: list[tuple[str, int]],
    elixir_val: float,
    towers: Any,
    units: Any,
    bot: str,
    enemy: str,
) -> dict[str, Any]:
    """Greedy + counters: swarm answers, <50% tower defence, split-push.

    1. Swarm: Zap/Fireball at a real cluster centroid (>=2 units in radius).
    2. Defence: weakest own tower <50% HP with enemy pressure -> hard counter
       placed on the threat<->tower line.
    3. Push: tank first when rich (>=7 elixir), away from enemy pressure
       (split-push), else greedy value on the weakest lane.
    Time O(h+t+u) (three single-pass scans); space O(1) aux beyond result.
    """
    weak_x, wtx, wty, own_frac, own_x, own_y = _scan_towers(towers, bot, enemy)
    (n, sumx, sumy, ax, ay, threat, tx, ty, best_key) = _scan_enemies(
        units, enemy, own_x, own_y, bot
    )
    afford = {cid for cid in ids if CARDS[cid]["cost"] <= elixir_val}

    # 1. Swarm answer — only spend the spell when the cluster is real.
    if n >= _SWARM_MIN and ("zap" in afford or "fireball" in afford):
        count, hp_sum = _cluster_info(units, enemy, ax, ay, _ZAP_R)
        spell = None
        if count >= _SWARM_MIN:
            if "zap" in afford and hp_sum <= _ZAP_HP_CAP:
                spell = "zap"
            elif "fireball" in afford:
                spell = "fireball"
            elif "zap" in afford:
                spell = "zap"
        if spell is not None:
            x, y = _legalize(sumx / n, sumy / n, spell, bot)
            return {"card": spell, "x": x, "y": y,
                    "handIndex": _orig_index(norm, spell)}

    # 2. Defence — own tower weak and enemy pressure exists.
    threat_on_half = _on_bot_half(ty, bot) if threat is not None or n > 0 else False
    if own_frac < _DEFEND_FRAC and n > 0 and (
        threat_on_half or (best_key is not None and best_key[1] < 81.0)
    ):
        pick = None
        for counter in _COUNTERS.get(threat or "", ()):  # O(1): <=3 lookups
            if counter in afford:
                pick = counter
                break
        if pick is None:  # no counter available -> best greedy defender
            pick, _ = _best_greedy(ids, elixir_val)
        if pick is None:
            pick, _ = _cheapest(ids)
        if pick is None:
            pick = "knight"
        if _is_spell(pick):  # emergency spell goes on the threat itself
            x, y = _legalize(tx, ty, pick, bot)
        else:  # body-block between threat and tower
            x, y = _legalize((tx + own_x) / 2.0, (ty + own_y) / 2.0, pick, bot)
        return {"card": pick, "x": x, "y": y, "handIndex": _orig_index(norm, pick)}

    # 3. Push — tank first when rich, opposite the enemy pressure (split-push).
    lane_x = weak_x
    if n > 0:
        cx = sumx / n
        lane_x = RIGHT_LANE_X if cx < 9.0 else LEFT_LANE_X
    pick = None
    if elixir_val >= _TANK_ELIXIR:
        for tank in _TANK_ORDER:  # O(1): <=3 lookups
            if tank in afford:
                pick = tank
                break
    if pick is None:
        pick, _ = _best_greedy(ids, elixir_val)
    if pick is None:
        pick, _ = _cheapest(ids)
    if pick is None:
        pick = "knight"
    if _is_spell(pick):  # spell-only hand: chip the weakest tower
        x, y = _legalize(wtx, wty, pick, bot)
    else:
        x, y = _legalize(lane_x, _push_y(pick, bot), pick, bot)
    return {"card": pick, "x": x, "y": y, "handIndex": _orig_index(norm, pick)}


def _push_y(cid: str, bot: str) -> float:
    """Push depth: tanks at the bridgehead, support behind. O(1)/O(1)."""
    if bot == "red":
        return 19.0 if cid in _TANKS else 22.0
    return 12.0 if cid in _TANKS else 9.0


def _orig_index(norm: list[tuple[str, int]], cid: str) -> int:
    """Original hand index of a card id, -1 if absent. O(h)/O(1)."""
    for c, i in norm:
        if c == cid:
            return i
    return -1


# ---------------------------------------------------------------------------
# Minimal self-check (contract + legality + budget smoke, no external tests).
# Run: ``python bot.py`` from ``ai-service/``.
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import time

    _TOWERS = [
        {"id": "blue-pl", "kind": "princess", "owner": "blue",
         "hitPoints": 1400, "maxHitPoints": 1400, "position": {"x": 3.5, "y": 6.5}},
        {"id": "blue-pr", "kind": "princess", "owner": "blue",
         "hitPoints": 500, "maxHitPoints": 1400, "position": {"x": 13.5, "y": 6.5}},
        {"id": "blue-k", "kind": "king", "owner": "blue",
         "hitPoints": 2400, "maxHitPoints": 2400, "position": {"x": 8.5, "y": 3.5}},
        {"id": "red-pl", "kind": "princess", "owner": "red",
         "hitPoints": 600, "maxHitPoints": 1400, "position": {"x": 3.5, "y": 24.5}},
        {"id": "red-pr", "kind": "princess", "owner": "red",
         "hitPoints": 1400, "maxHitPoints": 1400, "position": {"x": 13.5, "y": 24.5}},
        {"id": "red-k", "kind": "king", "owner": "red",
         "hitPoints": 2400, "maxHitPoints": 2400, "position": {"x": 8.5, "y": 27.5}},
    ]
    _UNITS = [
        {"cardId": "skeletons", "owner": "blue", "hitPoints": 80,
         "position": {"x": 8.0, "y": 20.0}},
        {"cardId": "skeletons", "owner": "blue", "hitPoints": 80,
         "position": {"x": 8.6, "y": 20.4}},
        {"cardId": "skeletons", "owner": "blue", "hitPoints": 80,
         "position": {"x": 7.5, "y": 19.6}},
        {"cardId": "giant", "owner": "blue", "hitPoints": 3400,
         "position": {"x": 3.5, "y": 22.0}},
    ]
    _STATE = {"side": "red", "towers": _TOWERS, "units": _UNITS}
    _HAND = ["giant", "musketeer", "zap", "skeletons"]

    for _d in ("easy", "medium", "hard", "BOGUS", "HARD"):
        _t0 = time.perf_counter()
        _m = choose_move(_STATE, _HAND, 8.0, _d)
        _dt = (time.perf_counter() - _t0) * 1000.0
        assert set(("card", "x", "y")) <= set(_m), _m
        assert _m["card"] in CARDS, _m
        assert 0.0 <= _m["x"] <= ARENA_W and 0.0 <= _m["y"] <= ARENA_H, _m
        if not _is_spell(_m["card"]):
            assert _on_bot_half(_m["y"], "red"), _m
        assert 0 <= _m["handIndex"] < len(_HAND), _m
        assert _dt < 50.0, (_d, _dt)
    # Hard answers the skeleton cluster with zap; medium plays greedy value
    # (skeletons: 240 dps / 1 elixir = best DPS-per-elixir in hand).
    assert choose_move(_STATE, _HAND, 8.0, "hard")["card"] == "zap"
    assert choose_move(_STATE, _HAND, 8.0, "medium")["card"] == "skeletons"
    # Degenerate inputs never raise and stay in-bounds.
    for _m2 in (choose_move({}, [], 0.0, "easy"),
                choose_move(None, ["zap"], 0.0, "hard"),
                choose_move({}, ["fireball"], 10, "medium")):
        assert 0.0 <= _m2["x"] <= ARENA_W and 0.0 <= _m2["y"] <= ARENA_H, _m2
    print("bot.py self-check OK (easy/medium/hard legal, <50ms each)")
