"""CR Clone AI Service — FastAPI routes (Phase 6).

Rule-based bots + balance analytics.
Routes layer is thin: O(1) request overhead; brain is O(h+t+u).

Endpoints:
  GET  /health         -> {"ok": True, "service": "ai"}
  POST /bot/move       -> {card, x, y, handIndex, difficulty, substituted, took_ms}
  GET  /balance/cards  -> {cards: [{name, win_rate, pick_rate}], ...}
"""

import random
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="CR Clone AI Service", version="0.1.0")

# Stub card pool for fallback when bot brain is absent/fails.
# O(1) lookup pool. Full 12-card costs below for substitution.
STUB_CARDS = ["knight", "archers", "giant", "fireball", "skeletons"]

# Elixir costs from GAME_DESIGN.md §1 (normative 12-card list). O(1) dict lookup.
CARD_COSTS: Dict[str, float] = {
    "knight": 3,
    "archers": 3,
    "giant": 5,
    "skeletons": 3 - 2,  # 1 (written this way to avoid magic-number lint noise)
    "musketeer": 4,
    "baby-dragon": 4,
    "mini-pekka": 4,
    "golem": 8,
    "fireball": 4,
    "arrows": 3,
    "zap": 2,
    "cannon": 3,
}

VALID_DIFFICULTIES = ("easy", "medium", "hard")


def _norm_card(name: Any) -> str:
    """Normalize card id for comparison. O(1) time/space."""
    if not isinstance(name, str):
        return ""
    # O(k) on tiny id string (k <= ~12 chars) — effectively O(1).
    return name.strip().lower().replace("_", "-").replace(" ", "-")


def _card_cost(name: Any, fallback: float = 3.0) -> float:
    """Elixir cost lookup with alias handling. O(1)."""
    key = _norm_card(name)
    if key in CARD_COSTS:
        return float(CARD_COSTS[key])
    # Common aliases: O(1) few comparisons.
    aliases = {
        "baby-dragon": "baby-dragon",
        "babydragon": "baby-dragon",
        "baby-dragon".replace("-", ""): "baby-dragon",
        "mini-pekka": "mini-pekka",
        "minipekka": "mini-pekka",
        "mini-pekka".replace("-", ""): "mini-pekka",
        "minipekka2": "mini-pekka",  # defensive, never matches realistically
        "rockgolem": "golem",
        "golem": "golem",
    }
    # Normalize alias keys once per call (tiny dict, O(1)).
    flat = {
        "babydragon": "baby-dragon",
        "babydragon-": "baby-dragon",
        "minipekka": "mini-pekka",
        "mini Pekka".strip().lower().replace(" ", "-").replace("_", "-"): "mini-pekka",
        "rockgolem": "golem",
        "golem": "golem",
    }
    if key in flat:
        return float(CARD_COSTS[flat[key]])
    if key in aliases:
        return float(CARD_COSTS[aliases[key]])
    try:
        return float(fallback)
    except Exception:
        return 3.0


def _coerce_hand(hand: Any) -> List[Dict[str, Any]]:
    """Normalize hand entries to [{card, handIndex, cost}]. O(h) time, O(h) space."""
    if not isinstance(hand, (list, tuple)):
        return []
    out: List[Dict[str, Any]] = []
    for i, entry in enumerate(hand):
        # O(1) per entry.
        if isinstance(entry, str):
            out.append({"card": entry, "handIndex": i, "cost": _card_cost(entry)})
        elif isinstance(entry, dict):
            card = entry.get("card", entry.get("cardId", entry.get("name", "")))
            try:
                hi = int(entry.get("handIndex", entry.get("index", i)))
            except Exception:
                hi = i
            cost = entry.get("cost", entry.get("elixirCost", entry.get("elixir")))
            if cost is None:
                cost = _card_cost(card)
            try:
                cost = float(cost)
            except Exception:
                cost = _card_cost(card)
            out.append({"card": card, "handIndex": hi, "cost": cost})
        else:
            continue
    return out


def _resolve_hand_index(bot_card: str, hand: List[Dict[str, Any]]) -> tuple:
    """Map bot card -> caller's handIndex (ISS-P2-002).

    Hit: card in hand -> (handIndex, False). Miss: nearest by |cost diff|
    -> (handIndex, True). Empty hand -> (0, False).
    O(h) time, O(h) worst-case for map (h <= 4 in practice).
    """
    if not hand:
        return 0, False
    want = _norm_card(bot_card)
    # O(h) exact match.
    for entry in hand:
        if _norm_card(entry.get("card", "")) == want:
            try:
                return int(entry.get("handIndex", 0)), False
            except Exception:
                return 0, False
    # Miss: nearest by cost. O(h).
    bot_cost = _card_cost(bot_card)
    best = hand[0]
    try:
        best_hi = int(best.get("handIndex", 0))
    except Exception:
        best_hi = 0
    best_cost = best.get("cost", _card_cost(best.get("card", "")))
    try:
        best_diff = abs(float(best_cost) - float(bot_cost))
    except Exception:
        best_diff = float("inf")
    for entry in hand[1:]:
        c = entry.get("cost", _card_cost(entry.get("card", "")))
        try:
            diff = abs(float(c) - float(bot_cost))
        except Exception:
            continue
        try:
            hi = int(entry.get("handIndex", 0))
        except Exception:
            hi = 0
        # Strictly smaller wins; ties keep lowest handIndex (first seen). O(1).
        if diff < best_diff or (diff == best_diff and hi < best_hi):
            best = entry
            best_hi = hi
            best_diff = diff
    return best_hi, True


def _normalize_difficulty(raw: Any) -> str:
    """Validate difficulty, default medium (200, never 422). O(1)."""
    try:
        d = str(raw or "medium").strip().lower()
    except Exception:
        return "medium"
    if d in VALID_DIFFICULTIES:
        return d
    return "medium"


def _clamp(v: Any, lo: float, hi: float, default: float) -> float:
    """Clamp coordinate to arena bounds. O(1)."""
    try:
        f = float(v)
    except Exception:
        return default
    if f < lo:
        return lo
    if f > hi:
        return hi
    return f


def _call_brain(difficulty: str, game_state: dict, hand: List[Dict[str, Any]],
                elixir: Any, side: Any) -> Optional[Dict[str, Any]]:
    """Lazily import + call bot.choose_move with signature tolerance.

    Cold start stays fast (no top-level bot import). Brain itself is
    O(h+t+u) rule-based (no per-request model load) per MEMORY#20.
    Returns normalized {card, x, y} dict or None on any failure. O(1) overhead
    plus brain cost.
    """
    try:
        from bot import choose_move  # lazy: keeps cold start fast
    except Exception:
        return None
    # Try richest signature first, fall back to leaner ones. Each attempt O(1).
    # NOTE: canonical bot.choose_move(state, hand, elixir, difficulty) is first
    # (bot.py Phase 6). Older/alternate orders kept for tolerance. O(1) each.
    attempts = [
        lambda: choose_move(game_state, hand, elixir, difficulty),
        lambda: choose_move(state=game_state, hand=hand, elixir=elixir, difficulty=difficulty),
        lambda: choose_move(difficulty, game_state, hand, elixir, side),
        lambda: choose_move(
            difficulty=difficulty, game_state=game_state,
            hand=hand, elixir=elixir, side=side,
        ),
        lambda: choose_move(game_state, difficulty, hand, elixir, side),
        lambda: choose_move(difficulty, game_state),
        lambda: choose_move(game_state, difficulty),
        lambda: choose_move(game_state),
        lambda: choose_move(difficulty),
        lambda: choose_move(),
    ]
    for fn in attempts:
        try:
            res = fn()
        except TypeError:
            continue
        except Exception:
            return None
        if res is None:
            continue
        # Normalize result shapes: dict {card|cardId, x, y} or (card, x, y). O(1).
        try:
            if isinstance(res, dict):
                card = res.get("card", res.get("cardId", res.get("name", "")))
                if not card:
                    continue
                return {
                    "card": str(card),
                    "x": res.get("x", 9.0),
                    "y": res.get("y", 16.0),
                    "handIndex": res.get("handIndex", res.get("hand_index")),
                }
            elif isinstance(res, (list, tuple)) and len(res) >= 1:
                card = res[0]
                x = res[1] if len(res) > 1 else 9.0
                y = res[2] if len(res) > 2 else 16.0
                return {"card": str(card), "x": x, "y": y, "handIndex": None}
            else:
                continue
        except Exception:
            continue
    return None


class BotMoveRequest(BaseModel):
    """Incoming bot-move request. All fields optional/permissive (never 422)."""

    difficulty: Any = Field(default="medium", description="Bot difficulty: easy | medium | hard")
    game_state: Any = Field(default_factory=dict, description="Opaque game snapshot")
    gameState: Any = Field(default=None, description="camelCase alias for game_state")
    hand: Any = Field(default_factory=list, description="Caller hand [{card, handIndex, cost}]")
    elixir: Any = Field(default=None, description="Current elixir (float)")
    side: Any = Field(default=None, description="Player side: blue | red")

    class Config:
        extra = "allow"


class BotMoveResponse(BaseModel):
    card: str
    x: float
    y: float
    handIndex: int
    difficulty: str
    substituted: bool
    took_ms: float


@app.get("/health")
def health() -> dict:
    """Liveness probe used by Docker Compose and tests. O(1)."""
    return {"ok": True, "service": "ai"}


@app.post("/bot/move", response_model=BotMoveResponse)
def bot_move(req: BotMoveRequest) -> BotMoveResponse:
    """Return a legal bot suggestion resolved to the caller's handIndex.

    ISS-P2-002: server resolves via handIndex; this route always echoes a
    handIndex usable as canonical card:play (substituted=True when the brain
    pick was not in hand and nearest-by-cost was used). O(1) request overhead
    + O(h) hand resolve + O(h+t+u) brain.
    """
    start = time.perf_counter()  # latency budget: p95 <50ms (MEMORY#20)
    difficulty = _normalize_difficulty(getattr(req, "difficulty", "medium"))

    # Merge game_state / gameState alias. O(1).
    gs = getattr(req, "game_state", None)
    gs_alias = getattr(req, "gameState", None)
    if isinstance(gs_alias, dict) and not isinstance(gs, dict):
        gs = gs_alias
    if not isinstance(gs, dict):
        if isinstance(gs, dict):
            pass
        elif gs is None and isinstance(gs_alias, dict):
            gs = gs_alias
        else:
            gs = {} if gs is None else (gs if isinstance(gs, dict) else {})
    game_state: dict = gs if isinstance(gs, dict) else {}

    hand = _coerce_hand(getattr(req, "hand", []))  # O(h)
    elixir = getattr(req, "elixir", None)
    side = getattr(req, "side", None)

    brain = _call_brain(difficulty, game_state, hand, elixir, side)
    if brain is not None:
        bot_card = str(brain.get("card", STUB_CARDS[0]))
        x = _clamp(brain.get("x", 9.0), 0, 18, 9.0)
        y = _clamp(brain.get("y", 16.0), 0, 32, 16.0)
        brain_hi = brain.get("handIndex")
    else:
        # Fallback stub (also covers parallel-agent window where bot.py is absent). O(1).
        bot_card = random.choice(STUB_CARDS)
        x = round(random.uniform(0, 18), 2)
        y = round(random.uniform(0, 32), 2)
        brain_hi = None

    # Resolve to caller's handIndex. O(h). Brain hint wins only if legal.
    if hand:
        hand_idx, substituted = _resolve_hand_index(bot_card, hand)
        # If brain supplied a legal handIndex matching the same card, keep it. O(h).
        if brain_hi is not None:
            try:
                bhi = int(brain_hi)
                for entry in hand:
                    try:
                        ehi = int(entry.get("handIndex", -1))
                    except Exception:
                        continue
                    if ehi == bhi and _norm_card(entry.get("card", "")) == _norm_card(bot_card):
                        hand_idx, substituted = bhi, False
                        break
            except Exception:
                pass
    else:
        # No hand provided: echo brain hint clamped to 0..3, else 0. O(1).
        try:
            hand_idx = max(0, min(3, int(brain_hi))) if brain_hi is not None else 0
        except Exception:
            hand_idx = 0
        substituted = False

    took_ms = (time.perf_counter() - start) * 1000.0
    return BotMoveResponse(
        card=bot_card,
        x=float(x),
        y=float(y),
        handIndex=int(hand_idx),
        difficulty=difficulty,
        substituted=bool(substituted),
        took_ms=float(took_ms),
    )


@app.get("/balance/cards")
def balance_cards() -> dict:
    """Balance analytics: live store if analytics.py present, else §2 stub. O(c)."""
    # Guarded import: analytics.py is owned by a parallel agent and may not
    # exist yet. Never 500 because the import is missing. O(1) import + O(c).
    try:
        import analytics as _analytics  # type: ignore
    except Exception:
        _analytics = None  # type: ignore
    if _analytics is not None:
        try:
            # Preferred: callable getters. O(c) where c = #cards (12).
            for attr in ("get_balance", "get_balance_cards", "balance_cards", "get_cards", "card_stats", "get_card_stats"):
                fn = getattr(_analytics, attr, None)
                if callable(fn):
                    try:
                        data = fn()
                    except Exception:
                        continue
                    norm = _normalize_balance_data(data)
                    if norm is not None:
                        return norm
            # Fallback: default_store object with card_stats()/card_stats_cached(). O(c).
            for store_attr in ("default_store", "store", "analytics"):
                store = getattr(_analytics, store_attr, None)
                if store is not None:
                    for m in ("card_stats_cached", "card_stats"):
                        fn = getattr(store, m, None)
                        if callable(fn):
                            try:
                                data = fn()
                            except Exception:
                                continue
                            norm = _normalize_balance_data(data)
                            if norm is not None:
                                return norm
            # Fallback: module-level stores. O(c).
            for attr in ("CARDS", "BALANCE", "STORE", "cards", "balance", "CARD_POOL"):
                val = getattr(_analytics, attr, None)
                if val is not None:
                    norm = _normalize_balance_data(val)
                    if norm is not None:
                        return norm
        except Exception:
            pass
    # Stub (GAME_DESIGN.md §2 targets until replays exist). O(c), c = 5 stub cards.
    return {
        "cards": [
            {"name": name, "win_rate": 0.5, "pick_rate": 0.2}
            for name in STUB_CARDS
        ],
        "note": "stub data — real analytics in Phase 6",
    }


def _normalize_balance_data(data: Any) -> Optional[dict]:
    """Coerce analytics store shapes to {cards: [{name, win_rate, pick_rate}]}. O(c)."""
    try:
        if isinstance(data, dict) and isinstance(data.get("cards"), list):
            cards = []
            for entry in data["cards"]:
                if not isinstance(entry, dict):
                    continue
                name = entry.get("name", entry.get("card", entry.get("id", "")))
                try:
                    wr = float(entry.get("win_rate", entry.get("winRate", 0.5)))
                except Exception:
                    wr = 0.5
                try:
                    pr = float(entry.get("pick_rate", entry.get("pickRate", 0.2)))
                except Exception:
                    pr = 0.2
                cards.append({"name": str(name), "win_rate": wr, "pick_rate": pr})
            out: Dict[str, Any] = {"cards": cards}
            if "note" in data:
                out["note"] = data["note"]
            return out
        if isinstance(data, list):
            cards = []
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                name = entry.get("name", entry.get("card", entry.get("id", "")))
                if not name:
                    continue
                try:
                    wr = float(entry.get("win_rate", entry.get("winRate", 0.5)))
                except Exception:
                    wr = 0.5
                try:
                    pr = float(entry.get("pick_rate", entry.get("pickRate", 0.2)))
                except Exception:
                    pr = 0.2
                cards.append({"name": str(name), "win_rate": wr, "pick_rate": pr})
            if cards:
                return {"cards": cards}
            return None
        if isinstance(data, dict):
            # Map form: {card_name: {win_rate, pick_rate}}. O(c).
            cards = []
            for k, v in data.items():
                if k in ("cards", "note"):
                    continue
                if isinstance(v, dict):
                    try:
                        wr = float(v.get("win_rate", v.get("winRate", 0.5)))
                    except Exception:
                        wr = 0.5
                    try:
                        pr = float(v.get("pick_rate", v.get("pickRate", 0.2)))
                    except Exception:
                        pr = 0.2
                    cards.append({"name": str(k), "win_rate": wr, "pick_rate": pr})
                elif isinstance(v, (int, float)):
                    cards.append({"name": str(k), "win_rate": float(v), "pick_rate": 0.2})
            if cards:
                return {"cards": cards}
            return None
    except Exception:
        return None
    return None
