# AI Improvement Plan

Status: implemented 2026-10-20

## Goals

1. AI must use the same tower levels (and tower troop) as the player.
2. AI must follow the normal elixir economy: never spend more than it owns,
   never dump multiple cards into the same tile, and keep a reserve unless the
   base is under threat.
3. AI must react to the player's units instead of blindly pushing one lane:
   counter air, swarms, tanks, and defend its weak tower.
4. Place cards at varied, legal positions rather than one repeated drop tile.

## Changes

### Server (`backend/src/ai.ts`, `backend/src/index.ts`)

- [x] Bot tower level = player's King Level and tower-troop level; AI also uses
      the player's selected tower troop.
- [x] Authoritative levels: the player profile wins over the client level map,
      removing the race that created matches at level 1.
- [x] Bot think interval raised to 900 ms with a per-room busy lock (no
      overlapping AI requests / burst plays).
- [x] Elixir reserve: 1 elixir is kept unless enemy troops are on the bot half
      or one of its towers is below 55% HP.
- [x] `bot:played` now includes the chosen x/y for debugging and tests.

### AI service (`ai-service/bot.py`, `main.py`)

- [x] Medium difficulty now scans enemy units and reacts:
      - air threat -> anti-air troop/spell
      - 3+ swarm cluster -> small spell / splash troop
      - close threat -> counter card body-blocked between threat and tower
      - otherwise pushes the weaker lane
- [x] Proactive pushes vary lane and drop tile instead of always using
      `x=3.5, y=22`.
- [x] Hard difficulty also varies push placement.
- [x] Added pytest cases for medium air counters and swarm answers.

## Gameplay verification

- Level-16 account: AI towers reported **7704 / 4858 / 4858 HP, level 16**.
- 30 s practice match: bot played 5 cards with maximum **4 elixir in any 5 s
  window** (no over-spend), at varied x/y positions.
- Defense run: bot placed Cannon/Spear Goblins/Bomber/Goblin Curse across
  different lanes in response to blue pushes.
- Backend tests: 141 passing.
- AI service tests: 15 passing; `python bot.py` self-check passes.
- Battle Playwright smoke tests pass against the updated bot.
