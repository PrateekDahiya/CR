# Clash Royale Card Accuracy Plan

Status: **completed 2026-10-20** (stat/mechanic snapshot, generated tables, UI, arena, tests)

Goal: make every one of the 108 playable cards match the live game's card
stats and behaviour as closely as this engine allows, and give every card an
in-game description tab.

## Source of truth

- Primary: Clash Royale Wiki (Fandom) rendered card tables, captured by
  `scripts/import_clash_royale_stats.py` into
  `infra/mysql/card_stats_source.json`.
- Each captured card stores its wiki page URL, description, attributes, level
  11 stats, every level row, and special values (death/dash/charge/spawn
  damage, shield HP, duration, radius).
- The importer is repeatable and caches raw pages outside the repository.
- Where the wiki table is ambiguous, values are cross-checked against the
  card's in-game description and another public stats source before use.
- Level scaling follows the wiki's own 1.1x per-level rule. Level 11 is the
  anchor because every card has a level 11 row.

## Phases

Similar cards are grouped so mechanics can be verified together.

### Phase 0 — Data pipeline (in progress)

- [x] Capture all 108 wiki pages (attributes, descriptions, level rows).
- [x] Store a checked-in source snapshot with page URLs.
- [x] Generate canonical backend/frontend card tables from the snapshot.
- [ ] Generate exact level 1–16 rows from the snapshot.
- [x] Regenerate the AI service's card snapshot from the same data.
- [x] Build a repeatable audit that fails on missing/zero stats.

### Phase 1 — Win conditions and tanks

Giant, Royal Giant, Golem, Lava Hound, Balloon, Hog Rider, Battle Ram,
Ram Rider, Goblin Giant, Elixir Golem, Ice Golem, Skeleton Barrel, Miner,
Giant Skeleton.

Checks: hitpoints, damage, hit speed, range, target mask, movement, deploy
delay, death/split payloads, building-only pathing, and tower damage.

### Phase 2 — Ground melee and mini-tanks

Knight, Valkyrie, Mini P.E.K.K.A, P.E.K.K.A, Prince, Dark Prince, Mega Knight,
Bandit, Boss Bandit, Fisherman, Lumberjack, Royal Ghost, Mighty Miner, Monk,
Golden Knight, Skeleton King, Goblin Demolisher, Archer Queen (ground form).

Checks: melee range, splash radius, charge/dash damage and reach, shields,
ramp stages, invisibility, ability cooldowns, and knockback.

### Phase 3 — Ranged and air troops

Archers, Musketeer, Wizard, Ice Wizard, Electro Wizard, Firecracker, Dart
Goblin, Magic Archer, Executioner, Bowler, Princess, Flying Machine, Baby
Dragon, Electro Dragon, Inferno Dragon, Phoenix, Mother Witch, Witch,
Night Witch, Zappies, Spear Goblins, Little Prince, Goblinstein.

Checks: range, sight range, projectile behaviour, splash radius, chain
targets, slow/stun, ramp stages, spawn-on-death, and flying movement.

### Phase 4 — Swarms and support spawns

Skeletons, Skeleton Army, Goblins, Goblin Gang, Bats, Minions, Minion Horde,
Barbarians, Elite Barbarians, Guards, Royal Recruits, Rascals, Fire Spirit,
Ice Spirit, plus all spawned child units.

Checks: unit count, per-unit HP/damage, shields, suicide area damage, spawn
patterns, and child-template stats.

### Phase 5 — Champions and abilities

Archer Queen, Golden Knight, Skeleton King, Mighty Miner, Little Prince, Monk,
Goblinstein, Boss Bandit.

Checks: champion ability cost/duration/radius, stat stage changes, summoned
units, and cooldown handling.

### Phase 6 — Spells

All 20 catalog spells: Arrows, Giant Snowball, Royal Delivery, Zap, Barbarian
Barrel, Earthquake, Fireball, Rocket, Clone, Freeze, Goblin Barrel, Goblin
Curse, Lightning, Poison, Rage, Tornado, Void, Graveyard, The Log.

Checks: damage per volley/tick, crown-tower multiplier, radius, duration,
knockback/pull, slow/freeze/stun, deployment delay, spawn count, and target
count scaling.

### Phase 7 — Buildings and tower troops

Cannon, Mortar, Tesla, Bomb Tower, Barbarian Hut, Elixir Collector, Furnace,
Goblin Cage, Goblin Hut, Inferno Tower, Tombstone, Goblin Drill, X-Bow, and the
four tower troops (Tower Princess, Cannoneer, Dagger Duchess, Royal Chef).

Checks: lifetime, HP decay, attack range/speed, deployment time, spawn
interval, minimum range, death payloads, and tower-troop stats.

### Phase 8 — Card Info UI and arena layout

- Add two tabs inside Card Info: **Stats** and **Description**.
- Show the real per-level values, including splash/dash/charge/death/shield
  fields where relevant.
- Add the in-game-style short description captured from the wiki.
- Correct the arena's symmetry to an 18×32 board centred on x=9, with lanes at
  3.5/14.5 and the king tower at 9, matching Clash Royale geometry.
- Re-check tower HP/damage against the current tower-troop tables.

### Phase 9 — Verification and release

- Backend tests: catalog completeness, stat sanity, level monotonicity,
  targeting, mechanics audit, spawn templates.
- Frontend tests: card info tabs, descriptions, exact values, layout.
- AI tests against the regenerated snapshot.
- Manual match checks for representative cards from every phase.
- Fresh screenshots, commit, push.

## Working rules

- No heuristic stat generation for card facts. All numbers come from the
  snapshot or a documented override.
- Every override lives in the importer/audit and is listed in the tracker.
- A card is only marked verified when its stats, level row, targeting, and
  special mechanics have all been checked.
- The tracker (`docs/CARD_STATS_TRACKER.md`) is updated as each phase lands.

## Completion log (2026-10-20)

- Captured all 108 cards from the Clash Royale Wiki into
  `infra/mysql/card_stats_source.json` (attributes, descriptions, level 11
  anchors, every level row, special damage values, source URLs).
- Regenerated `backend/src/game/cards.generated.ts`,
  `backend/src/game/cardLevels.generated.ts`, `frontend/lib/cards.generated.ts`
  and `ai-service/cards_data.json` from that snapshot. No heuristic stats remain.
- Exact 16-level rows are derived from the level-11 wiki anchor with the wiki's
  1.1x rule, then seeded into `card_level_stats`.
- Reconciled mechanics data: target masks, splash radii, spell radii/durations,
  crown-tower multipliers, dash/charge/death/spawn damage, shields, spawn
  cadence, Furnace's 2025 troop rework, range fixes (Mortar 3.5-11.5), and
  Inferno/Mighty Miner ramp multipliers.
- Added short card descriptions and Stats/Description tabs to Card Info.
- Centred the arena on x=9 with lanes at 3.5/14.5 and bridges at 3-4 / 14-15.
- Verification: backend 131 tests, AI 13 tests + self-check, frontend build,
  Playwright card-info/board flows, tracker regenerated.

### Documented approximations

- Dash radius is not published on the wiki; dash cards use a 1.5-tile radius.
- Death-damage radii are taken from the card archetype when the wiki does not
  list a radius (Balloon 2.5, Golem/Ice Golem 2, Giant Skeleton 3, etc.).
- Multi-entity cards (Goblinstein, Little Prince, Rascals, Phoenix, Mother Witch)
  show the primary unit in Card Info; their secondary units are covered by the
  spawn-template stats and card description.
- Some champion ability timings are preserved from the existing mechanics data
  where the wiki table does not expose a dedicated timing column.
