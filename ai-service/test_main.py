"""Pytest stubs for the AI service."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "service": "ai"}


def test_bot_move_returns_random_move_with_difficulty():
    res = client.post("/bot/move", json={"difficulty": "hard"})
    assert res.status_code == 200
    body = res.json()
    assert body["difficulty"] == "hard"
    assert body["card"] in ["knight", "archers", "giant", "fireball", "skeletons"]
    assert "x" in body and "y" in body
