"""Pytest for Phase 6 routes: health, bot/move matrix, balance.

Covers: GET /health, POST /bot/move easy/medium/hard + invalid->medium +
handIndex echo + took_ms budget, GET /balance/cards shape.
All O(1) request overhead + O(h+t+u) brain (MEMORY#20 <50ms p95).
"""

import time

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

HAND = [
    {"card": "giant", "handIndex": 0, "cost": 5},
    {"card": "musketeer", "handIndex": 1, "cost": 4},
    {"card": "zap", "handIndex": 2, "cost": 2},
    {"card": "skeletons", "handIndex": 3, "cost": 1},
]


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "service": "ai"}


def test_bot_move_easy():
    res = client.post("/bot/move", json={"difficulty": "easy", "hand": HAND, "elixir": 8.0, "side": "red"})
    assert res.status_code == 200
    body = res.json()
    assert body["difficulty"] == "easy"
    assert body["handIndex"] in [0, 1, 2, 3]
    assert 0 <= body["x"] <= 18 and 0 <= body["y"] <= 32
    assert body["took_ms"] < 50.0


def test_bot_move_medium_greedy():
    res = client.post("/bot/move", json={"difficulty": "medium", "hand": HAND, "elixir": 8.0, "side": "red", "game_state": {}})
    assert res.status_code == 200
    body = res.json()
    assert body["difficulty"] == "medium"
    assert body["handIndex"] in [0, 1, 2, 3]
    assert body["took_ms"] < 50.0


def test_bot_move_hard_and_invalid_difficulty():
    # hard with swarm state -> zap answer expected when affordable
    state = {
        "side": "red",
        "towers": [],
        "units": [
            {"cardId": "skeletons", "owner": "blue", "hitPoints": 80, "position": {"x": 8.0, "y": 20.0}},
            {"cardId": "skeletons", "owner": "blue", "hitPoints": 80, "position": {"x": 8.6, "y": 20.4}},
        ],
    }
    res = client.post("/bot/move", json={"difficulty": "hard", "hand": HAND, "elixir": 8.0, "game_state": state, "side": "red"})
    assert res.status_code == 200
    assert res.json()["difficulty"] == "hard"
    # invalid difficulty defaults to medium with 200 (never 422)
    res2 = client.post("/bot/move", json={"difficulty": "BOGUS", "hand": HAND, "elixir": 5})
    assert res2.status_code == 200
    assert res2.json()["difficulty"] == "medium"


def test_bot_move_handindex_substitution():
    # brain pick not in hand -> nearest-by-cost substitution, still legal handIndex
    hand = [{"card": "knight", "handIndex": 0, "cost": 3}]
    res = client.post("/bot/move", json={"difficulty": "medium", "hand": hand, "elixir": 10, "side": "red"})
    assert res.status_code == 200
    body = res.json()
    assert body["handIndex"] == 0
    assert isinstance(body["substituted"], bool)


def test_bot_move_supports_full_catalog_cards():
    # Cards beyond the original 12 must be playable, not silently dropped.
    hand = [{"card": "mega-knight", "handIndex": 0, "cost": 7}]
    res = client.post("/bot/move", json={"difficulty": "easy", "hand": hand, "elixir": 10, "side": "red"})
    assert res.status_code == 200
    body = res.json()
    assert body["card"] == "mega-knight"
    assert body["handIndex"] == 0


def test_balance_cards_shape():
    res = client.get("/balance/cards")
    assert res.status_code == 200
    body = res.json()
    assert "cards" in body and isinstance(body["cards"], list)
    assert len(body["cards"]) >= 5
    for row in body["cards"]:
        assert "name" in row and "win_rate" in row


def test_bot_move_latency_budget():
    t0 = time.perf_counter()
    for _ in range(20):
        r = client.post("/bot/move", json={"difficulty": "hard", "hand": HAND, "elixir": 8.0})
        assert r.status_code == 200
    dt_ms = (time.perf_counter() - t0) * 1000.0 / 20.0
    assert dt_ms < 50.0, dt_ms

def test_medium_counters_air_on_own_half():
    state = {
        "towers": [
            {"id": "red-pl", "kind": "princess", "owner": "red", "hitPoints": 4000, "maxHitPoints": 4858, "position": {"x": 3.5, "y": 24.5}},
        ],
        "units": [
            {"cardId": "baby-dragon", "owner": "blue", "hitPoints": 1200, "position": {"x": 8.0, "y": 20.0}},
        ],
    }
    hand = [
        {"card": "giant", "handIndex": 0, "cost": 5},
        {"card": "archers", "handIndex": 1, "cost": 3},
        {"card": "fireball", "handIndex": 2, "cost": 4},
    ]
    res = client.post("/bot/move", json={"difficulty": "medium", "hand": hand, "elixir": 6, "side": "red", "game_state": state})
    assert res.status_code == 200
    body = res.json()
    assert body["card"] in ("archers", "fireball")
    assert body["y"] >= 17.0


def test_medium_answers_swarm_with_small_spell():
    state = {
        "towers": [
            {"id": "red-pl", "kind": "princess", "owner": "red", "hitPoints": 4000, "maxHitPoints": 4858, "position": {"x": 3.5, "y": 24.5}},
        ],
        "units": [
            {"cardId": "skeletons", "owner": "blue", "hitPoints": 81, "position": {"x": 8.0, "y": 20.0}},
            {"cardId": "skeletons", "owner": "blue", "hitPoints": 81, "position": {"x": 8.6, "y": 20.2}},
            {"cardId": "skeletons", "owner": "blue", "hitPoints": 81, "position": {"x": 7.5, "y": 19.6}},
        ],
    }
    hand = [
        {"card": "giant", "handIndex": 0, "cost": 5},
        {"card": "zap", "handIndex": 1, "cost": 2},
        {"card": "archers", "handIndex": 2, "cost": 3},
    ]
    res = client.post("/bot/move", json={"difficulty": "medium", "hand": hand, "elixir": 5, "side": "red", "game_state": state})
    assert res.status_code == 200
    assert res.json()["card"] == "zap"

