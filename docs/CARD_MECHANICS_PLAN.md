# Card Mechanics Plan

Status: Phase 1 implementation in progress
Branch: `card-mechanics`
Scope: the repository's 108 catalog entries

## 1. Scope And Findings

The current repository exposes 108 catalog records through
`backend/src/game/cards.generated.ts` and `frontend/lib/cards.generated.ts`.
The hand-tuned engine behavior covers only the original 12-card prototype:
Knight, Archers, Giant, Skeletons, Musketeer, Baby Dragon, Mini P.E.K.K.A,
Rock Golem, Fireball, Arrows, Zap, and Cannon. The remaining records receive
derived HP/damage/speed data, but do not receive their original gameplay
behavior. The generated data also currently treats tower troops as ordinary
deployable troops because zero-elixir catalog rows are coerced to troop rows.

This plan keeps the existing project protocol and 18x32 arena, but changes the
card model and engine so the 108 records have explicit mechanics. The four
tower troops remain in the catalog and are playable through role-specific tower
profiles; they are not ordinary moving units even though they are playable card
records.

This is a faithful educational simulation, not a claim of byte-for-byte parity
with a live commercial server. Public card balance values change frequently,
so mechanics and tournament-standard data will be versioned in this repository
and tested deterministically.

## 2. Research Record

Research was performed against these public sources on 2026-10-19:

- Supercell support, [Cards & Decks](https://support.clashroyale.com/hc/en-us/articles/49484924205595-Cards-Decks): card types, rarities, tower troops, evolution/hero slot rules, and the distinction between collection cards and battle forms.
- Clash Royale Wiki, [Cards](https://clashroyale.fandom.com/wiki/Cards): card comparison tables, target/range conventions, special damage, spawner timing, death effects, tower troop behavior, and linked card overviews.
- Liquipedia, [Cards Portal](https://liquipedia.net/clashroyale/Portal:Cards): short card descriptions for spells, buildings, spawners, and tower troops.
- Deck Shop, [Cards by property](https://www.deckshop.pro/card/property): interaction tags such as building targeting, charge, knockback, reset, healing, splash, spawner, and king activation.
- Supercell, [Royal Chef release notes](https://supercell.com/en/games/clashroyale/blog/release-notes/game-update-new-tower-troop-royal-chef/): Royal Chef's automatic level-up mechanic.
- Supercell, [August 2025 balance changes](https://supercell.com/en/games/clashroyale/blog/release-notes/august-balance-changes-2/): current tower troop behavior constraints and balance-version caveats.

The wiki and third-party pages are used for mechanics research only. No card
art, audio, fonts, or other copyrighted binaries are to be copied into this
repository.

Implementation status at this checkpoint:

- Complete: generated/backend/frontend indexes contain exactly 108 catalog
  records; no runtime 12-card hardcoded table remains.
- Complete: MySQL schema, JSON seed, importer, content endpoint, startup loader,
  and local seed-file fallback for 108 mechanic rows.
- Complete: database-backed child templates for spawned units and generic
  periodic/death split execution; seed input is `infra/mysql/spawn_templates.json`.
- Complete: generic engine support for database-defined area damage, status,
  knockback, clone, shields, splash selection, persistent fields, periodic
  spawns, and death splits.
- Remaining: child spawn templates, split/death chains, projectiles, beams,
  charges/dashes, champion abilities, tower profiles, and per-card regression
  tests described in Phases 3-8.

## 3. Design Decisions

1. The server remains authoritative. Frontend card metadata is a display and
   placement mirror; it never resolves damage or status effects.
2. Card facts and mechanics are database data. The engine interprets a small
   set of generic effect primitives instead of growing a 108-branch `if`
   statement or a TypeScript card map.
3. Every card gets a mechanic test. Cards that share a primitive still get an
   individual data/fixture assertion so a bad mapping cannot silently pass.
4. A unit is an entity with a base stat block plus runtime state. Runtime state
   carries shields, statuses, charge/ramp progress, death payloads, spawn
   timers, invisibility, and optional companion relationships.
5. All randomness is deterministic. Graveyard and similar distributed spawns
   use a match seed plus card instance id and never call nondeterministic
   `Math.random()`.
6. The current 8-card deck protocol stays unchanged for this feature. Tower
   troops are selected outside the hand and are attached to the crown-tower
   profile. Evolution and hero forms are deferred unless already represented by
   one of the 108 base records.
7. Balance numbers and mechanic definitions will be stored as explicit,
   versioned database data, not silently derived from rarity and elixir. Where
   an exact level value is unavailable in the public source, the database row
   will mark the value as a tuning approximation while preserving the correct
   behavior.

8. TypeScript contains only the schema/parser for mechanics and generic engine
   primitives. Card-specific behavior records are seeded into MySQL and loaded
   into an in-memory match snapshot at match creation. The in-memory snapshot
   is a runtime cache, not a second source of truth.

## 4. Target Runtime Model

The first implementation pass should extend `CardDef` with these database-fed
sections. Names are illustrative; the final type names should remain small and
serializable.

```ts
interface CardMechanics {
  targeting: "ground" | "air+ground" | "buildings" | "all";
  movement?: "ground" | "flying" | "burrow" | "siege";
  attack?: "single" | "splash" | "pierce" | "chain" | "shotgun" | "beam";
  onDeploy?: EffectSpec[];
  onAttack?: EffectSpec[];
  onHit?: EffectSpec[];
  onDeath?: EffectSpec[];
  periodic?: PeriodicEffectSpec[];
  ability?: AbilitySpec;
}
```

The MySQL model will use a `card_mechanics` table keyed by card id. The checked-in
seed input is `infra/mysql/card_mechanics.json`, and
`infra/mysql/seed_card_mechanics.py` imports it into MySQL. Scalar
facts remain in `card_catalog`; behavior is stored as validated JSON columns or
rows for attack, deployment, hit, death, periodic, and ability effects. The
minimum record shape is:

```sql
card_mechanics(
  card_id VARCHAR(40) PRIMARY KEY,
  version INT NOT NULL,
  attack_pattern VARCHAR(16),
  targeting VARCHAR(16) NOT NULL,
  movement VARCHAR(16),
  on_deploy JSON NOT NULL,
  on_attack JSON NOT NULL,
  on_hit JSON NOT NULL,
  on_death JSON NOT NULL,
  periodic JSON NOT NULL,
  ability JSON NOT NULL,
  FOREIGN KEY (card_id) REFERENCES card_catalog(name)
)
```

At process startup, the backend loads and validates all mechanic rows. A match
stores the immutable validated mechanic snapshot it was created with, so a
mid-match database edit cannot change an active simulation. If the configured
database is unavailable, matchmaking must fail closed with a clear content
readiness error rather than silently inventing mechanics in TypeScript.

The actual implementation should use discriminated unions for `EffectSpec` and
avoid untyped JSON at engine boundaries. The required generic primitives are:

- `damage`: troop, building, tower, or reduced crown-tower damage.
- `areaDamage`: radius plus target filter.
- `status`: stun, freeze, slow, rage, invisibility, curse, shield, or reflect.
- `knockback`: displacement with arena/bridge clamping.
- `heal`: friendly-unit area healing with max-HP cap.
- `spawn`: a named child card/entity template, count, interval, and cap.
- `split`: replace a dead entity with child entities.
- `clone`: copy eligible friendly units with clone HP and no building copy.
- `teleport`/`burrow`: remove an entity from targeting, then deploy it at a
  deterministic destination.
- `dash`/`charge`: stateful movement attack with bonus damage and reset rules.
- `ramp`: target-lock damage stages that reset on target loss, stun, or retarget.
- `pierce`/`chain`: ordered multi-target projectile resolution.
- `levelUp`: Royal Chef or other explicit level modifier.
- `elixir`: collector/death-payout modifications to player resources.

The engine should process each tick in this order:

1. Expire/advance statuses and timed effects.
2. Resolve queued deployments and delayed projectiles.
3. Advance periodic spawners and resource generators.
4. Acquire targets using each entity's target mask and special priority.
5. Move, charge, dash, pull, or burrow entities.
6. Resolve tower attacks.
7. Resolve unit attacks and projectile effects in deterministic entity order.
8. Resolve deaths, splits, eggs, bombs, rage fields, and curse conversions.
9. Compact dead entities, expire buildings, activate kings, and determine win.

## 5. Card-By-Card Research And Implementation Plan

The `Actual mechanic` column records the behavior to reproduce. The
`Implementation` column names the preferred generic primitive rather than a
card-specific engine branch. `Base` means ordinary stats/targeting/count only;
it is still covered by an individual card test.

### Troops: common and baseline cards

| ID | Actual mechanic | Implementation |
|---|---|---|
| `archers` | Two separate ranged troops attack air and ground. | `count=2`, `single` attack, `air+ground` targeting. Keep each archer as an independent entity. |
| `barbarians` | Five melee ground barbarians. | `count=5`, ground `single` attack. |
| `bats` | Five very fast flying melee troops that attack air and ground. | `count=5`, `flying`, `air+ground`; no special effect. |
| `bomber` | Ground ranged attacker whose bomb splashes nearby ground troops. | `attack=splash`, ground-only splash filter; projectile impact at target. |
| `elite-barbarians` | Two fast, high-damage melee barbarians. | `count=2`, fast ground `single` attack. |
| `fire-spirit` | Jumps to a target and self-destructs on impact, damaging the target area. | `jump`/suicide entity; resolve one `areaDamage` and kill the spirit on impact. |
| `goblins` | Four fast melee ground goblins. | `count=4`, ground `single` attack. |
| `goblin-gang` | Three melee goblins plus three spear goblins. | Composite spawn list with two templates, `3+3`; spear template targets air and ground. |
| `ice-spirit` | Jumps into a target area, deals damage, and freezes enemies briefly before dying. | Reuse spirit jump with `damage + freeze` and self-destruct. |
| `knight` | One durable melee ground mini-tank. | Existing base behavior; explicit ground `single` profile. |
| `minions` | Three flying ranged/melee attackers that target air and ground. | `count=3`, flying, air+ground. |
| `minion-horde` | Six minions. | `count=6`, same minion template; cap spawn positions deterministically. |
| `royal-giant` | Ranged ground troop that targets buildings, unlike the original Giant's melee attack. | Building-only target mask with ranged attack; do not use generic tank defaults. |
| `royal-recruits` | Six ground troops, each with a shield; split across lanes in the original game. | `count=6`, deterministic lane formation, per-entity `shield` pool. |
| `rascals` | One melee Rascal Boy accompanied by two ranged Rascal Girls. | Composite spawn list with role-specific stats and targeting. |
| `skeletons` | Three fragile melee ground skeletons. | Existing base behavior; `count=3`, ground `single`. |
| `skeleton-barrel` | Floating barrel travels toward a building/tower, then releases skeletons when destroyed or reaching its target. | Composite carrier entity: flying movement, death/impact `spawn` skeletons, optional death damage. |
| `spear-goblins` | Three ranged goblins that target air and ground. | `count=3`, ranged `air+ground`; correct generated target mask. |

### Troops: rare

| ID | Actual mechanic | Implementation |
|---|---|---|
| `battle-ram` | Building-seeking ram charges toward a building; the ram's charge hit is stronger and two barbarians appear when it breaks or dies. | `buildingOnly` movement plus `charge`; carrier death/impact `spawn` two barbarians. |
| `dart-goblin` | Very fast long-range ground/air dart attacker. | Correct `air+ground` target mask, high range and fast attack; no melee generic fallback. |
| `elixir-golem` | Tank splits into two Elixir Golemites; each Golemite splits into two Elixir Blobs. Each split gives the opponent elixir in the original game. | `split` chain with child templates and `elixir` death payout; payout ownership is the opposing player. |
| `flying-machine` | Flying long-range ranged attacker that targets air and ground. | `flying`, `air+ground`, long-range `single`; no ground movement constraints. |
| `giant` | Slow, high-HP ground tank that attacks buildings only. | Existing building-only targeting; explicit slow speed and melee range. |
| `goblin-demolisher` | Ground ranged bomber that carries a bomb and detonates a larger bomb on death. | Ranged ground attack plus `onDeath areaDamage`; damage profile separate from Bomber. |
| `hog-rider` | Fast ground unit that ignores troops and targets buildings, crossing the river without normal troop distraction. | `buildingOnly` target priority; normal bridge movement; no troop acquisition. |
| `ice-golem` | Cheap building-targeting tank that explodes on death and slows/freezes nearby enemies. | `buildingOnly` movement plus death `areaDamage + slow/freeze`; no generic ranged attack. |
| `mini-pekka` | Single fast melee ground tank killer. | Existing base profile, explicit ground `single`. |
| `musketeer` | Single long-range ranged attacker that targets air and ground. | Existing base profile, explicit `air+ground` ranged attack. |
| `royal-hogs` | Four fast ground troops that target buildings. | `count=4`, building-only target mask, lane-aware deterministic formation. |
| `valkyrie` | Melee ground troop with a 360-degree area attack. | `attack=splash` centered on Valkyrie, ground filter, hit all entities in radius. |
| `wizard` | Ranged ground/air attacker with area splash damage. | `attack=splash`, `air+ground` target filter; distinguish from Bomber by air support. |
| `zappies` | Three ranged units that repeatedly stun their targets and attack air/ground. | `count=3`, `single + stun` on hit; apply per-target reset and cooldown. |

### Troops: epic

| ID | Actual mechanic | Implementation |
|---|---|---|
| `baby-dragon` | Flying ranged splash attacker against air and ground. | Existing splash primitive, `flying`, `air+ground`. |
| `balloon` | Flying building-only attacker that drops a bomb on death. | `flying + buildingOnly`; death `areaDamage` at last position. |
| `bowler` | Ground ranged boulder rolls through multiple enemies and knocks them back. | `pierce` projectile with ordered hit list plus `knockback`; ground filter. |
| `dark-prince` | Ground melee splash attacker with a shield and a charge attack. | Per-unit `shield`, `charge`, and centered melee splash. |
| `electro-dragon` | Flying chain lightning attacks up to three targets and briefly stuns them. | `chain` attack with max targets, chain distance, `stun`; deterministic nearest ordering. |
| `executioner` | Throws an axe that damages enemies on the outward and return paths. | `pierce` projectile with two passes; each pass has its own hit set rules. |
| `giant-skeleton` | Ground tank whose death drops a large bomb that detonates after a delay. | `onDeath delayed areaDamage` entity; bomb can be destroyed/triggered by timer. |
| `goblin-giant` | Building-targeting tank with two Spear Goblins riding on its back; the riders continue/are released on death. | Parent/child companion entities; parent `buildingOnly`, children ranged `air+ground`, death release. |
| `golem` | Building-targeting tank that splits into two Golemites and has a death explosion; Golemites also have death explosions. | `split` chain plus per-stage `onDeath areaDamage`; use a shared Golem/Golemite template. |
| `guards` | Three ground melee units with shields that absorb damage before HP. | `count=3` with independent `shield` pools. |
| `pekka` | Very high-damage ground melee unit with no special effect. | Base ground `single`; explicit stats, not the generic tank archetype. |
| `prince` | Ground melee troop that charges and deals bonus charge damage. | Reuse `charge`; reset charge on stun/target loss according to status rules. |
| `skeleton-army` | Large group of fragile melee skeletons. | `count=15`, spawn formation; each entity independently vulnerable to splash. |
| `witch` | Ranged splash-support troop that periodically summons Skeletons. | Ranged splash attack plus periodic `spawn` skeletons with a per-instance timer. |

### Troops: legendary

| ID | Actual mechanic | Implementation |
|---|---|---|
| `bandit` | Ground assassin dashes to a target after a minimum travel distance; dash attack has bonus damage and temporary invulnerability. | Reuse `dash` state with target lock, bonus hit, collision immunity, and cooldown reset. |
| `electro-wizard` | On deployment, zaps/stuns nearby enemies; attacks two targets simultaneously and briefly resets them. | `onDeploy area stun/damage` plus dual-target `chain`/parallel attack. |
| `fisherman` | Ranged hook pulls an enemy troop toward the Fisherman; when hooking a building, the Fisherman is pulled toward it. | `hook` projectile with target-type-dependent displacement and retarget interruption. |
| `inferno-dragon` | Flying beam ramps damage over time against one target and resets when interrupted or retargeted. | `ramp` beam with stage timer; reset on stun, target death, or target change. |
| `ice-wizard` | Ranged splash/slow attacker; deployment impact slows/freezes nearby enemies. | `onDeploy area slow` plus attacks that apply slow to air/ground targets. |
| `lava-hound` | Flying building-targeting tank that splits into six Lava Pups on death. | `flying + buildingOnly` parent and `split count=6` child template. |
| `lumberjack` | Fast melee troop that drops a Rage field when killed. | `onDeath spawn rage field`; field buffs friendly entities and expires on timer. |
| `magic-archer` | Long-range projectile continues in a straight line and pierces every entity in its path. | `pierce` line projectile with fixed direction and ordered collision list. |
| `mega-knight` | Heavy ground unit with area damage on deployment and a jump attack after sufficient distance; landing damages nearby enemies. | `onDeploy areaDamage` plus `jump`/`charge` landing effect and normal splash melee. |
| `miner` | Burrows and can be deployed anywhere; emerges at the chosen target and deals reduced damage to Crown Towers. | Special deploy validation bypass, `burrow/teleport`, tower damage multiplier on Miner attacks. |
| `mother-witch` | Ranged attacker curses enemy troops; cursed troops that die become friendly Cursed Hogs. | Status `curse` on hit plus death conversion hook; track curse owner and source level. |
| `night-witch` | Ground melee support troop that periodically spawns Bats and releases one on death. | Periodic `spawn` plus `onDeath spawn`; Bats are independent flying entities. |
| `phoenix` | Flying troop leaves an egg on death; if the egg survives its timer, Phoenix revives once. | `onDeath spawn egg`, egg timer, enemy egg damage, one-shot `revive` transition. |
| `princess` | Extremely long-range ground/air splash attacker. | Long-range `splash`, `air+ground`; do not use generated 3-tile generic range. |
| `ram-rider` | Rider/ram compound unit: ram targets buildings and charges; rider attacks/slows enemy troops. | Parent/child compound entity, separate target masks, charge, and slow projectile/status. |
| `royal-ghost` | Ground melee splash troop that is invisible until attacking or taking damage, then becomes invisible again after a delay. | Status `invisible` with reveal/re-hide transitions; splash melee attack. |
| `sparky` | Ground ranged unit charges a large area-damage shot; stun/reset removes charge progress. | `charge-up` attack with stored shot, area impact, and reset-on-stun. |

### Troops: champions

Champion abilities are activated by an explicit server action in a later
protocol extension. Until that action exists, the base troop still deploys and
attacks correctly, but the card must not silently gain an automatic ability.

| ID | Actual mechanic | Implementation |
|---|---|---|
| `archer-queen` | Ranged air/ground troop. Ability makes her invisible and greatly increases attack speed for a timed window. | `ability` spends elixir, sets `invisible`, applies attack-speed modifier, and schedules expiry. |
| `goblinstein` | Champion deployment includes Goblinstein and its Monster companion; the ability creates a damaging lightning link/field between the pair and nearby enemies. | Composite champion + companion tether; `ability` spawns/updates a link effect with target filters and tower-damage multiplier. |
| `golden-knight` | Ground melee champion. Ability chains a dash through nearby enemies, dealing bonus damage and retargeting after each hit. | Reuse `dash` with multi-target chain, deterministic nearest selection, and ability cooldown. |
| `little-prince` | Ranged champion. Ability summons Guardienne, a protective/charging companion, at the Little Prince. | `ability spawn` companion with parent link and charge movement; only latest eligible champion owns the ability. |
| `mighty-miner` | Ground unit's damage ramps while locked to one target. Ability burrows to the opposite lane and leaves a damaging bomb. | `ramp` attack plus ability `burrow/teleport` and delayed `areaDamage` bomb. |
| `monk` | Ground champion with a multi-hit melee combo. Ability reduces/reflects incoming projectiles and protects nearby allies for a short duration. | Combo counter on attacks; `reflect` status intercepts eligible projectiles and applies reflected damage. |
| `skeleton-king` | Ground champion collects souls from deaths. Ability spends elixir to summon Skeletons around him based on collected souls. | Match-side soul counter, death event hook, and ability `spawn` capped by stored souls. |
| `boss-bandit` | Heavy Bandit variant with building/troop dash behavior and a stronger dash attack. | Reuse Bandit `dash` primitive with explicit champion stats and ability/cooldown data; no generic tank fallback. |

### Spells

| ID | Actual mechanic | Implementation |
|---|---|---|
| `arrows` | Large area receives multiple arrow volleys over a short duration; reduced Crown Tower damage. | Delayed `areaDamage` events at three deterministic timestamps; tower multiplier per data. |
| `barbarian-barrel` | Ground rolling projectile damages/knocks back units and breaks to spawn one Barbarian. | Restricted line projectile with collision sweep, knockback, and terminal `spawn`. |
| `clone` | Duplicates eligible friendly troops in the target area at 1 HP; does not clone buildings and cloned units cannot use champion abilities. | `clone` effect with eligibility filter, clone HP policy, `isClone` flag, and no-building/no-ability rules. |
| `earthquake` | Area damage over time; deals substantially more damage to buildings and affects ground units, not flying units. | Timed area ticks with separate troop/building/tower multipliers and `groundOnly` filter. |
| `fireball` | Delayed area damage with Crown Tower reduction and troop knockback. | Existing area damage extended with impact delay and `knockback`; explicit tower multiplier. |
| `freeze` | Area damage plus a timed freeze that prevents movement and attacks for troops/buildings/towers. | `damage + status freeze` with expiry and attack cooldown reset. |
| `giant-snowball` | Area damage, knockback, and temporary slow; reduced Crown Tower damage. | `areaDamage + knockback + slow` with ground/air target support. |
| `goblin-barrel` | Travels to any arena point and releases three Goblins on landing; the barrel can be intercepted/damaged. | Ballistic carrier/projectile with terminal `spawn count=3`; no troop-only deploy validation. |
| `goblin-curse` | Applies damage over time/curse; enemy troops that die under the curse become Goblins for the caster. | Area timed status `curse` plus death conversion hook; buildings/towers only receive configured damage. |
| `lightning` | Selects up to three highest-hitpoint enemy troops/buildings in the area, strikes them, and stuns/resets them. | Target ranking by current HP with deterministic id tie-break; max-three `strike + stun`. |
| `poison` | Persistent area damage over time to enemy troops/buildings/towers with reduced tower damage. | Timed area field with per-tick damage and tower multiplier. |
| `rage` | Persistent area buff that increases friendly troop/building movement, attack, and spawn rates; no generic damage effect. | `status rage` field with multiplicative stat modifiers and periodic timer scaling. |
| `rocket` | Slow projectile with very high small-radius impact damage and Crown Tower reduction. | Delayed projectile plus `areaDamage`, explicit travel delay, and knockback where applicable. |
| `royal-delivery` | Delayed drop damages enemy troops in an area and then deploys one Royal Recruit; cannot directly damage Crown Towers in the original behavior. | Deploy-zone-independent drop event with `areaDamage` target filter and terminal `spawn Royal Recruit`. |
| `the-log` | Long rolling ground projectile damages and knocks back ground units/buildings; reduced Crown Tower damage. | Directional line sweep with ground-only collision, `knockback`, and tower multiplier. |
| `tornado` | Area damage over time pulls enemy troops toward the center; tower damage is reduced. | `pull` force integrated each tick plus area damage; preserve flying/ground behavior from data. |
| `void` | Area damage is stronger when fewer enemy targets are present; applies separate troop/building/tower damage tiers. | Count eligible targets first, select damage tier, then apply deterministic area damage. |
| `zap` | Instant area damage and brief stun/reset to troops/buildings/towers; reduced tower damage. | Existing spell path extended to generic `stun/reset`, including buildings and towers. |

### Buildings

| ID | Actual mechanic | Implementation |
|---|---|---|
| `barbarian-hut` | Stationary building periodically spawns Barbarians and spawns one on destruction. | `periodic spawn` plus `onDeath spawn`; lifetime and spawn cap in data. |
| `bomb-tower` | Defensive building targets ground troops with splash bombs and drops a death bomb. | Building attack `splash` plus `onDeath areaDamage`; target ground only. |
| `cannon` | Stationary ground-targeting defensive building with deploy delay and finite lifetime. | Existing building/lifetime behavior; move stats and delay into data. |
| `elixir-collector` | Stationary building periodically grants its owner Elixir and expires after its lifetime; it is not a normal attacking building. | `periodic elixir` effect, no attack target, lifetime expiry, and explicit placement. |
| `furnace` | Stationary building periodically spawns Fire Spirits. | `periodic spawn` with lifetime and deterministic spawn positions. |
| `goblin-cage` | Stationary building absorbs damage; on destruction releases one Goblin Brawler that fights normally. | `onDeath spawn` child with a parent-destruction trigger. |
| `goblin-drill` | Burrows to an arena target, periodically releases Goblins, and releases extra Goblins on destruction. | Building special deploy bypass plus burrow carrier, periodic spawn, death spawn. |
| `goblin-hut` | Stationary building periodically spawns Spear Goblins and releases one on destruction. | `periodic spawn` plus `onDeath spawn`. |
| `inferno-tower` | Defensive building uses a ramping beam against air/ground targets and expires. | Reuse `ramp` beam with building lifetime and reset rules. |
| `mortar` | Long-range ground siege building fires arcing splash shells, cannot hit targets inside its minimum range, and can hit Crown Towers. | `siege` targeting with minimum range, projectile arc delay, and splash impact. |
| `tesla` | Defensive air/ground building hides while not attacking and reveals while firing; finite lifetime. | `buried/hidden` building state with reveal-on-target and hide-after-idle transitions. |
| `tombstone` | Stationary building periodically spawns Skeletons and releases four on destruction. | `periodic spawn` plus `onDeath spawn count=4`. |
| `x-bow` | Long-range siege building locks onto a target and rapidly fires; can target Crown Towers and has a minimum range/placement behavior. | `siege` target priority, lock-on beam/projectile, minimum range, lifetime. |

### Tower troops

These four records are not normal hand cards. They are selected before a match
and configure the player's Princess Tower attack profile.

| ID | Actual mechanic | Implementation |
|---|---|---|
| `tower-princess` | Baseline fast, moderate-damage air/ground Crown Tower defender. | Tower profile with standard HP/damage/hit speed/range. |
| `cannoneer` | Slow, powerful single-target Crown Tower shot; weak against swarms. | Tower profile with slow attack and high damage; no hand deployment. |
| `dagger-duchess` | Stores a finite dagger magazine, fires quickly while ammunition remains, then reloads; full magazine can be dumped into one target. | Tower profile with ammo counter, burst attack, and reload timer. |
| `royal-chef` | Attacks as a tower and automatically levels up the highest-HP eligible friendly troop; cooking is slower while attacking and ignores buildings/critically wounded troops. | Tower profile plus periodic `levelUp` queue, eligibility threshold, no hand action. |

## 6. Data Changes Planned

1. Replace `scripts/generate_card_table.py`'s rarity/archetype formulas with a
   data import that writes a versioned source table containing the 108 IDs,
   display names, card kind, elixir, rarity, tournament-standard stats, and
   mechanic rows into MySQL.
2. Add a `tower` card kind or a separate `TowerTroopDef` type. Do not coerce
   zero-elixir tower rows into ordinary troops.
3. Add explicit database spawn templates for child entities that are not deck cards:
   Golemite, Elixir Golemite, Elixir Blob, Lava Pup, Cursed Hog, Guardienne,
   Goblin Brawler, Royal Recruit, Fire Spirit, Barbarian, Spear Goblin,
   Skeleton, Bat, and the Goblinstein Monster.
4. Add exact display names instead of using lowercase IDs as names.
5. Add explicit target masks, count, flying state, range, splash, lifetime,
   deployment delay, tower multiplier, and mechanic effects for every record in
   database columns/JSON, not code constants.
6. Keep backend and frontend content responses sourced from the same database;
   startup validation must fail if any catalog record lacks a mechanic row.
7. Add and migrate the `card_mechanics` table with `card_kind`, effect JSON,
   version, and `playable`/`tower_troop` semantics. Never silently change
   existing meanings.

## 7. Phased Implementation Plan

### Phase 0: Research and contract (this phase)

- Create the isolated worktree and `card-mechanics` branch.
- Record the 108-card roster, mechanics, source links, and architecture in this
  document.
- Add a manifest test that confirms the catalog count and detects missing IDs.
- Phase 1 may proceed after the research contract is documented; each later
  behavior phase must add its per-card tests before moving to the next phase.

### Phase 1: Canonical card data

- Add typed mechanic/effect unions and the versioned 108-card source table.
- Add the MySQL schema, seed import, loader, and startup readiness validation.
- Correct kind, display name, target mask, count, flying state, and baseline
  stats for every card.
- Add child-only entity templates and tower troop profiles.
- Regenerate backend/frontend tables and update catalog seed/mapping.
- Expose mechanics through `/content/cards` for frontend display without making
  the frontend authoritative.
- Add tests for count, unique IDs, legal deck filtering, tower exclusion, and
  backend/frontend parity.

### Phase 2: Core entity and status engine

- Extend `SimUnit` with runtime effects and parent/child metadata.
- Implement shields, stun, freeze, slow, rage, invisibility, knockback,
  healing, reflection, and status expiry.
- Correct generic target masks, flying/ground collision, deployment rules, and
  splash targeting.
- Preserve deterministic ordering and the existing 10 Hz protocol.

### Phase 3: Projectile, spell, and area systems

- Implement delayed projectiles, line sweeps, pierce, chain, shotgun, pull,
  knockback, DOT fields, tower damage multipliers, and target ranking.
- Convert Fireball, Arrows, Zap, and the remaining 15 spells one by one from
  special cases to data-driven effects.
- Add one focused test per spell plus cross-spell status tests.

### Phase 4: Spawns, splits, carriers, and buildings

- Implement periodic spawners, death spawns, split chains, resource generators,
  carriers, eggs, siege buildings, minimum ranges, building lifetime, and
  tower-targeting exceptions.
- Implement every building one by one in the order listed above.
- Add bounded entity/cascade limits so Graveyard, Witch, and spawner decks
  cannot exceed the server's safety budget.

### Phase 5: Advanced troop behavior

- Implement charge/dash, ramping beams, jump attacks, hook/pull, burrow, line
  pierce, invisibility, shields, death bombs, and compound units.
- Implement every non-champion troop one by one and add fixture tests for each
  unique effect.
- Verify bridge movement and target priority after each movement mechanic.

### Phase 6: Champions and tower troops

- Add authenticated ability actions and server-side ability validation.
- Implement champion ability state, costs, cooldowns, latest-placement rules,
  clone restrictions, and one ability test per champion.
- Attach the four tower troop profiles to crown towers and test Cannoneer,
  Dagger Duchess, Royal Chef, and Tower Princess independently.

### Phase 7: Frontend and AI mirrors

- Extend frontend card metadata and card info UI to show actual targets,
  effects, spawn count, and tower-troop classification.
- Update placement previews for miner/drill/barrels and invalid zones.
- Update AI card evaluation and move selection to understand building targets,
  spells, spawners, and champion abilities without duplicating server logic.

### Phase 8: Full verification and balance pass

- Run a per-card test matrix: deploy, target selection, attack/effect, death or
  expiry, and tower interaction where applicable.
- Run interaction tests for every status against troops, buildings, towers,
  flying units, cloned units, and children.
- Run backend tests, frontend typecheck/build, AI tests, live socket tests, and
  Playwright battle tests.
- Record balance deviations and source/version assumptions in a test report;
  do not silently tune data while claiming exact mechanics.

## 8. Acceptance Criteria

- All 108 catalog IDs have an explicit data record and a documented mechanic.
- No card falls back to a rarity/archetype-only mechanic; every record has a
  validated database mechanic row.
- Tower troops cannot be played from a normal hand and do affect crown-tower
  behavior when selected as a profile.
- Every card has an individual deterministic test, even when it shares an
  effect primitive with another card.
- Effects resolve on the authoritative server and are represented in the wire
  snapshot or event stream when the client needs to render them.
- Entity counts, status durations, spawn cascades, and projectile paths are
  bounded and deterministic.
- Existing baseline engine tests continue to pass unless a documented,
  source-backed mechanic correction intentionally changes their expectation.
- Backend and frontend card tables remain mechanically and structurally in
  sync.

## 9. Known Research Caveats

- The live game now contains more cards, evolutions, heroes, and balance changes
  than this repository's 108-entry catalog. This branch does not silently add
  newer records; it implements the repository scope first.
- Public stat tables disagree by game version and tournament-standard level.
  Mechanics are more stable than numbers, so numeric data must carry a source
  version and be tested separately from behavior.
- Champion abilities require a protocol action that the current shared socket
  contract does not define. The ability implementation phase must add that
  contract additively and validate it server-side.
- The current project uses an 8-card hand/deck protocol, while current live
  Clash Royale deck UI may expose special slots. This plan does not change that
  protocol without a separate design decision.
