# Tower Level Stats and Target-Type Verification Plan

Status: **implemented 2026-10-20**

## 1. Towers use level tables, not flat level-1 values

Current mismatch: arena constants hard-code level-1 Crown Tower values
(Princess 1,400 / King 2,400). The live game scales both towers by level.

Source: Clash Royale Wiki `Tower Princess` and `King's Tower` statistics
tables (levels 1-16, captured in `infra/mysql/card_stats_source.json` and
mirrored in `backend/src/game/arena.ts`).

Implementation:
- [x] Add King Tower level table: HP 2,400 -> 7,704, damage 50 -> 173,
      hit speed 1.0s, range 7.
- [x] Add Tower Princess level table: HP 1,400 -> 4,858, damage 50 -> 173,
      hit speed 0.8s, range 7.5.
- [x] Use the player's King Level for the King Tower.
- [x] Crown-tower level = max(King Level, selected tower-troop level), so an
      under-levelled tower troop cannot make the towers weaker than the
      player's King Level.
- [x] Tower troops keep their own per-level HP/damage/hit-speed tables
      (Cannoneer, Dagger Duchess, Royal Chef).
- [x] Send `king-tower` level with the battle payload and validate it
      server-side.

## 2. Every troop must obey its real target mask

Target masks are `ground`, `air+ground`, `buildings`, `all`, or `none`.

Implementation:
- [x] Re-audit all 108 card rows and 20 spawn templates.
- [x] Elixir Golem, Elixir Golemite, and Elixir Blob target **buildings only**.
- [x] Golem/Golemite, Lava Hound/Lava Pup, Giant, Royal Giant, Hog Rider,
      Balloon, Battle Ram, Ram Rider, Goblin Giant keep building-only targeting.
- [x] Ground-only cards (Bowler, Valkyrie, Sparky, Knight, P.E.K.K.A, etc.)
      cannot acquire flying units.
- [x] Air-capable cards (Archers, Musketeer, Wizard, Little Prince, etc.) can
      acquire both ground and flying units.
- [x] Spawned children inherit the child template's target mask, not the
      parent card's mask.
- [x] Add regression tests that pin an enemy troop next to an Elixir Golem
      family unit and prove it keeps walking to the tower.

## 3. Verification

- [x] Backend tower-level tests (level 1 vs level 11 vs max).
- [x] Backend targeting tests for Elixir Golem -> Golemite -> Blob.
- [x] Spawn-template audit still passes.
- [x] Frontend build + battle HUD shows the scaled HP.
- [x] Full test suites, screenshots, commit and push.
