# backend/tests — engine unit tests (no server needed)

Unit tests for the authoritative game engine (`backend/src/game/engine.ts`).
No Express/Socket.io/Redis required — pure simulation logic per
`docs/GAME_DESIGN.md` §§5–8/11.

## Files

- `engine.test.ts` — elixir regen (1/2.8s single, 1/1.4s double, cap 10),
  `playCard` deducts + hand-cycles, tower damage + king activation
  (Princess 1400 / King 2400), win + crowns (princess = 1, king = instant 3),
  overtime trigger (0–0 full-HP at 3:00 → OT, draw at 4:00).
- `validation.test.ts` — rejects bad x/y (`BAD_POSITION`), insufficient
  elixir (`NO_ELIXIR`), bad handIndex (`BAD_HAND_INDEX`), cardId-echo
  mismatch (`CARD_REJECTED`), stale tick (`STALE_TICK`), burst overflow
  (`RATE_LIMITED`) — with no state mutation on any reject.
- `README.md` — this file.

Both import the engine with the ESM `.js` suffix:

```ts
import { createGame, playCard, tickGame } from '../src/game/engine.js';
```

`tsx` maps `engine.js` → `engine.ts` at runtime. Plain `tsc` build
(`rootDir: src`, `include: src/**/*`) ignores `tests/`, so these files never
affect `npm run build`.

## How to run

```powershell
Set-Location backend
npm install        # installs tsx (already in devDependencies) + deps
npm test           # -> tsx --test tests/*.test.ts
```

Expected:

```text
✔ engine — elixir regen (7 tests)
✔ engine — playCard deducts + cycles (3 tests)
✔ engine — towers + king activation (4 tests)
✔ engine — win / crowns (2 tests)
✔ validation — bad x/y (8 tests)
✔ validation — insufficient elixir (2 tests)
✔ validation — bad handIndex (5 tests)
✔ validation — clock/rate (2 tests)
```

## Engine contract (locked to `src/game/engine.ts` on this branch)

| Export | Signature | Notes |
|---|---|---|
| `createGame` | `(matchId, blueDeck, redDeck, opts?) => EngineState` | 8 distinct ids, ≤2 spells; start 5 elixir, 6 towers (1400/2400, king inactive), crowns 0–0 |
| `playCard` | `(state, side, { handIndex, x, y, ... }) => { ok, cardId?, unitIds? } \| { ok: false, code, message }` | `NO_ELIXIR` / `BAD_POSITION` / `BAD_HAND_INDEX` / `CARD_REJECTED` / `STALE_TICK` / `RATE_LIMITED`; no mutation on reject |
| `tickGame` | `(state, dtSec = 0.1) => state` | 10 Hz: elixir (float, cap 10; double from t≥120s) → move → combat (towers first) → clock/win |
| `ELIXIR_START/CAP/SINGLE_SEC/DOUBLE_SEC` | `5 / 10 / 2.8 / 1.4` | normative §7 numbers, asserted literally |
| State | `EngineState` | towers carry `hp/maxHp/active/destroyed` + `x/y`; hands/decks/queue drive the 4-card rotation |

Normative numbers: `docs/GAME_DESIGN.md` §0 table + `shared/types.ts`.

## Troubleshooting

- `Cannot find module '../src/game/engine.js'` → engine implementation not
  merged yet on `feature/phase-3-backend-server`. Tests are syntax-valid
  (`node --check`) and run green once it lands.
- `tsx: command not found` → run `npm install` first (no install is run by
  test agents per prompt; CI/maintainers install once).
- `dt` larger than 0.5s in `tickGame` is clamped to `TICK_DT` by design
  (anti-speedhack) — the regen tests therefore advance time in 0.1s steps.
