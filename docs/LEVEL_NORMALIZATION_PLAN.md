# Level-Normalized Card Stats Plan

Status: Phase 1 complete, Phase 2 pending
Branch: `card-mechanics`

## Goal

Move HP, damage, attack interval, DPS, movement speed, range, sight range,
radius, count, lifetime, deploy delay, tower damage, and related combat values
out of one-level generated runtime records and into versioned database rows for
every catalog card at every supported level.

The authoritative lookup will be:

```text
card_stats(card_id, level, mode, stat_version) -> complete stat block
```

The engine will resolve a card's level once when a match is created and keep an
immutable stat snapshot in the match. It will not query MySQL during a 10 Hz
combat tick.

## Current Problem

- `cards.generated.ts` contains one generated stat block per card, not a level
  series.
- The 108-card table is a client/server build artifact rather than a complete
  database stat source.
- Crown towers use fixed constants in `arena.ts` and do not have selectable
  tower troop level profiles.
- Child units have separate template data, but not level rows.
- UI cards display a single HP/DPS value and do not identify the selected level.
- Match/deck payloads contain card IDs but no authoritative card level snapshot.

## Stat Scope

The level table covers all 108 catalog records:

- Troops: common, rare, epic, legendary, and champion records.
- Spells: direct damage, damage-over-time, control, spawn, and utility spells.
- Buildings: defensive, siege, spawner, and resource buildings.
- Tower troops: Tower Princess, Cannoneer, Dagger Duchess, and Royal Chef.

The 20 database child templates also receive level rows so split, death, and
periodic spawns use the same level context as their parent card.

Every row stores the complete effective block, even when a value does not vary
by level. This prevents the engine from silently applying a generic formula to
attack speed or special effects.

## Database Model

### `card_level_stats`

One row per catalog card, level, mode, and stat version.

```sql
PRIMARY KEY (card_id, level, mode, stat_version)
```

Columns:

- `card_id`, `level`, `mode`, `stat_version`
- `hit_points`, `damage`, `hit_speed_ms`, `dps`
- `move_speed`, `range_tiles`, `sight_range`, `radius_tiles`
- `unit_count`, `duration_ms`, `deploy_delay_ms`
- `tower_damage`, `death_burst`, `death_burst_radius`
- `flying`, `targets`, `attack_pattern`
- `source`, `is_approximation`, `notes`

### `spawn_template_level_stats`

Same complete stat shape for the 20 non-deck child templates. It is keyed by
`template_id`, `level`, `mode`, and `stat_version`.

### `card_catalog`

Remains the identity/filter table and keeps the current base/default values for
collection screens and backward-compatible content responses. New gameplay
code must use the level tables.

### Level ownership

The first phase keeps the existing deck wire format compatible. Later phases
will add an optional level map to deck/match creation:

```ts
levels?: Record<string, number>
```

The server validates ownership and bounds, resolves each row, and stores the
resolved level plus stat block in the match state. Client-provided HP, damage,
DPS, or attack speed is never trusted.

## Normalization Rules

1. Level rows are data, not engine formulas.
2. Phase 1 seeds levels 1 through 16 for every card and child template.
3. Existing generated values are treated as the baseline for the current
   content version. A deterministic seed transformer creates complete rows so
   the database is immediately usable.
4. HP, damage, death burst, and tower damage scale with the configured level
   multiplier. DPS is stored as a derived value from stored damage and
   `hit_speed_ms`, then rounded only for presentation.
5. `hit_speed_ms`, movement speed, range, radius, count, lifetime, and deploy
   delay are stored per level. They remain unchanged when the source data says
   they are level-invariant; they are not recalculated in the engine.
6. A future balance patch creates a new `stat_version`; it does not overwrite
   active-match rows.
7. Every generated/approximate value is marked with `is_approximation=1` until
   replaced by a source-backed value.
8. Tower troops use the same level table but are applied to tower profiles, not
   spawned as ordinary moving units.

## Phases

### Phase 1: Database stat foundation

- Add `card_level_stats` and `spawn_template_level_stats` tables.
- Add migration-safe columns/indexes and foreign keys.
- Extend the idempotent bootstrap to seed 108 x 16 card rows and 20 x 16
  child-template rows.
- Add `getCardStats(cardId, level)` and bulk loading APIs with memory caching.
- Add count/parity tests against the generated catalog and mechanics seed.
- No combat behavior change yet; current runtime remains the compatibility path.

### Phase 2: Shared stat contracts

- Add `CardLevelStats`, `ResolvedCard`, and `TowerProfileStats` shared types.
- Extend content API responses with level ranges and resolved stats.
- Add a server-side level validator and default-level policy.
- Add match snapshot fields for level and resolved stat version.

### Phase 3: Authoritative engine migration

- Replace direct `getCard()` numeric reads in deployment/combat with resolved
  match stat snapshots.
- Apply level stats to HP, damage, attack cooldown, DPS, movement, range,
  splash, death effects, spawn timing, and spell tower damage.
- Resolve crown tower and tower troop profiles through the same level service.
- Add replay determinism tests across levels and stat versions.

### Phase 4: Persistence and matchmaking

- Store deck card levels and tower troop selections in database JSON with
  server-side validation.
- Include level maps in queue/match creation and reject unavailable levels.
- Persist the resolved stat version on matches for replay/audit compatibility.
- Update AI room state so bot decisions use resolved level stats.

### Phase 5: Frontend and API

- Card collection shows level, HP, damage, attack speed, DPS, and upgrade
  preview from `/content/cards/:id/levels`.
- Deck editor stores card levels and tower troop selection.
- Battle HUD displays player/tower levels and uses server-resolved stats for
  health bars, damage numbers, and attack previews.
- Remove client-side duplicated numeric formulas after API parity is verified.

### Phase 6: Source-backed data and balance validation

- Replace approximate seed rows with source-backed per-level values.
- Validate every card category and child template against a stat fixture.
- Add migration reports for changed values and stat versions.
- Run full backend, frontend, AI, live database, and Playwright gates.

## Phase 1 Acceptance Criteria

- A fresh database creates all existing tables plus both level-stat tables.
- Bootstrap reports `card_stats=1728` for 108 cards x 16 levels.
- Bootstrap reports `spawn_stats=320` for 20 child templates x 16 levels.
- Re-running bootstrap produces no duplicate rows.
- Every catalog card has levels 1 through 16.
- Every tower troop has levels 1 through 16.
- Every row has non-null HP/damage/attack speed/DPS fields appropriate to its
  type, including zero-valued spell HP and movement where appropriate.
- Existing 44 backend tests and frontend production build remain green.

## Phase 1 Implementation Notes

- `card_level_stats` and `spawn_template_level_stats` are created by the same
  automatic MySQL bootstrap as the rest of the game schema.
- Bootstrap currently seeds `1728` card rows and `320` child-template rows,
  using stat version `1`, mode `ladder`, and explicit level rows 1 through 16.
- `getCardStats` and `getCardLevelSeries` provide database-backed lookups with
  a deterministic local fallback for development without MySQL.
- Existing combat still uses the legacy stat block until Phase 3 resolves and
  snapshots these rows at match creation.
