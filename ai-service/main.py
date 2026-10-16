"""CR Clone AI Service — FastAPI stub.

Rule-based bots + balance analytics (Phase 1 scaffolding, full logic lands in Phase 6).
"""

import random

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="CR Clone AI Service", version="0.1.0")

# Stub card pool for random bot moves.
STUB_CARDS = ["knight", "archers", "giant", "fireball", "skeletons"]


class BotMoveRequest(BaseModel):
    """Incoming bot-move request. All fields optional so the stub is easy to call."""

    difficulty: str = Field(default="medium", description="Bot difficulty: easy | medium | hard")
    game_state: dict = Field(default_factory=dict, description="Opaque game snapshot (unused in stub)")


class BotMoveResponse(BaseModel):
    card: str
    x: float
    y: float
    difficulty: str


@app.get("/health")
def health() -> dict:
    """Liveness probe used by Docker Compose and tests."""
    return {"ok": True, "service": "ai"}


@app.post("/bot/move", response_model=BotMoveResponse)
def bot_move(req: BotMoveRequest) -> BotMoveResponse:
    """Return a random stub move, echoing the requested difficulty."""
    difficulty = (req.difficulty or "medium").lower()
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"
    return BotMoveResponse(
        card=random.choice(STUB_CARDS),
        x=round(random.uniform(0, 18), 2),
        y=round(random.uniform(0, 32), 2),
        difficulty=difficulty,
    )


@app.get("/balance/cards")
def balance_cards() -> dict:
    """Stub balance analytics. Real win-rate computation lands in Phase 6."""
    return {
        "cards": [
            {"name": name, "win_rate": 0.5, "pick_rate": 0.2}
            for name in STUB_CARDS
        ],
        "note": "stub data — real analytics in Phase 6",
    }
