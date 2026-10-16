# GAME_DESIGN_STUB — placeholder for Phase 2 (`docs/GAME_DESIGN.md`)

> STATUS: STUB (Phase 1). Normative spec lands in Phase 2. Do not balance against this file.
> Each heading below becomes a full section in `docs/GAME_DESIGN.md`.

## 1. Overview (1v1 realtime card battler)
- TODO(phase-2): fantasy, match length, arena orientation.

## 2. Win conditions (crowns / tower destruction / timeout / overtime)
- TODO(phase-2): king-snipe = instant win? draw rules?

## 3. Cards (troops / spells / buildings, full list + stats)
- TODO(phase-2): per-card HP/damage/range/speed/count/radius table. Must match `shared/types.ts:Card`.

## 4. Elixir (regen rate, cap, double-elixir window)
- TODO(phase-2): numbers (e.g. 1 per Xs, cap 10).

## 5. Arenas (lanes, river/bridge, deploy zones, tower positions)
- TODO(phase-2): coordinates in arena units; must match `shared/types.ts:Vec2`.

## 6. Towers (king / princess HP, damage, range, targeting)
- TODO(phase-2): numbers table. Must match `shared/types.ts:Tower`.

## 7. Tick rate + netcode (10-20Hz authoritative, interpolation, lag comp)
- TODO(phase-2): tick Hz, snapshot shape (= `shared/types.ts:GameState`), client interp.

## 8. Protocol (socket events, REST surface, matchmaking)
- TODO(phase-2): normative event list (= `shared/types.ts:SocketEvents`), error codes.

## 9. Balance numbers (starting point for playtest + AI analytics)
- TODO(phase-2): initial tuning + how `ai-service` balance endpoint consumes replays.
