/**
 * backend/tests/card-matrix.test.ts — the per-card verification matrix.
 *
 * One row per card of the 108-card catalogue (docs/CARD_MECHANICS_PLAN.md §5).
 * Every row is checked three ways:
 *
 *   1. DATA      the catalogue row and the database mechanics row still match
 *                the plan (type, attack pattern, targeting, movement, count,
 *                flying, the child templates).
 *   2. DEPLOY    the engine really produces the entities the plan describes
 *                (the squad size, the composite children, the unit flags).
 *   3. PROBE     the card's special mechanic fires (a spell damages, a status
 *                lands, a child spawns, a unit dashes, a chain hits, ...).
 *
 * Rows that carry a `gap` are the cards whose plan behaviour the engine does
 * NOT implement yet (the inert status kinds, the pull knockback, the effect
 * delays). Their probe asserts the CURRENT behaviour and the gap is tracked
 * in docs/CARD_MECHANICS_PLAN.md §6 - closing a gap must update this file.
 *
 * Run: npm test (tsx --test) from backend/ - the mechanics fall back to the
 * checked-in seed JSON when MySQL is not configured.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { hydrateMechanicsFromMysql, hydrateSpawnTemplatesFromMysql } from "../src/mysql.js";
import { createGame, playCard, tickGame, type EngineState, type SimUnit } from "../src/game/engine.js";
import { CARDS, validateDeck } from "../src/game/cards.js";
import { forceInHand } from "./deckHelpers.js";

type CardType = "troop" | "spell" | "building" | "tower";

interface CardRow {
  id: string;
  type: CardType;
  /** The attack pattern declared in the mechanics row. */
  attack: string;
  /** The targeting mask declared in the mechanics row. */
  targeting: string;
  /** The movement kind declared in the mechanics row (null for spells). */
  movement: string | null;
  /** Units of the card's own id that appear when it is deployed. */
  own: number;
  /** Children spawned on deploy (composite cards). */
  deployChildren?: Record<string, number>;
  /** Children spawned when the card dies (splits, releases). */
  deathChildren?: Record<string, number>;
  /** Children spawned periodically while the card lives. */
  periodicChildren?: Record<string, number>;
  /** The unit flies. */
  flying?: boolean;
  /** Tower troop: a tower profile, never playable from the hand. */
  towerTroop?: boolean;
  /** Plan behaviour the engine does not implement yet (plan §6). */
  gap?: string;
}

/** The 108 catalogue cards, in the order of docs/CARD_MECHANICS_PLAN.md §5. */
const MATRIX: CardRow[] = [
  { id: "archer-queen", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 1, gap: "champion ability (a later protocol extension - the plan requires the base troop to deploy and attack)" },
  { id: "archers", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 2 },
  { id: "arrows", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "baby-dragon", type: "troop", attack: "splash", targeting: "air+ground", movement: "flying", own: 1, flying: true },
  { id: "balloon", type: "troop", attack: "single", targeting: "buildings", movement: "flying", own: 1, flying: true },
  { id: "bandit", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1 },
  { id: "barbarian-barrel", type: "spell", attack: "none", targeting: "ground", movement: null, own: 0, deathChildren: { "barbarian": 1 } },
  { id: "barbarian-hut", type: "building", attack: "none", targeting: "none", movement: "ground", own: 1, periodicChildren: { "barbarian": 3 } },
  { id: "barbarians", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 5 },
  { id: "bats", type: "troop", attack: "single", targeting: "air+ground", movement: "flying", own: 5, flying: true },
  { id: "battle-ram", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1, deathChildren: { "barbarian": 2 } },
  { id: "bomb-tower", type: "building", attack: "splash", targeting: "ground", movement: "ground", own: 1 },
  { id: "bomber", type: "troop", attack: "splash", targeting: "ground", movement: "ground", own: 1 },
  { id: "boss-bandit", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, gap: "champion ability (a later protocol extension)" },
  { id: "bowler", type: "troop", attack: "pierce", targeting: "ground", movement: "ground", own: 1 },
  { id: "cannon", type: "building", attack: "single", targeting: "ground", movement: "ground", own: 1 },
  { id: "cannoneer", type: "tower", attack: "single", targeting: "air+ground", movement: null, own: 1, towerTroop: true },
  { id: "clone", type: "spell", attack: "none", targeting: "friendly", movement: null, own: 0 },
  { id: "dagger-duchess", type: "tower", attack: "single", targeting: "air+ground", movement: null, own: 1, towerTroop: true },
  { id: "dark-prince", type: "troop", attack: "splash", targeting: "ground", movement: "ground", own: 1 },
  { id: "dart-goblin", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "earthquake", type: "spell", attack: "none", targeting: "ground", movement: null, own: 0 },
  { id: "electro-dragon", type: "troop", attack: "chain", targeting: "air+ground", movement: "flying", own: 1, flying: true },
  { id: "electro-wizard", type: "troop", attack: "chain", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "elite-barbarians", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 2 },
  { id: "elixir-collector", type: "building", attack: "none", targeting: "none", movement: "ground", own: 1 },
  { id: "elixir-golem", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1, deathChildren: { "elixir-golemite": 2 } },
  { id: "executioner", type: "troop", attack: "pierce", targeting: "air+ground", movement: "ground", own: 1, gap: "the pierce 'returning' second pass is not implemented" },
  { id: "fire-spirit", type: "troop", attack: "suicide", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "fireball", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "firecracker", type: "troop", attack: "splash", targeting: "air+ground", movement: "ground", own: 1, gap: "not in the plan document (data only)" },
  { id: "fisherman", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1 },
  { id: "flying-machine", type: "troop", attack: "single", targeting: "air+ground", movement: "flying", own: 1, flying: true },
  { id: "freeze", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "furnace", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 1, periodicChildren: { "fire-spirit": 1 } },
  { id: "giant", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1 },
  { id: "giant-skeleton", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, gap: "the onDeath delayMs (fuse) is not implemented" },
  { id: "giant-snowball", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "goblin-barrel", type: "spell", attack: "none", targeting: "all", movement: null, own: 0, deployChildren: { "goblin": 3 } },
  { id: "goblin-cage", type: "building", attack: "none", targeting: "none", movement: "ground", own: 1, deathChildren: { "goblin-brawler": 1 } },
  { id: "goblin-curse", type: "spell", attack: "none", targeting: "all", movement: null, own: 0, gap: "the curse status is inert - the enemies are not turned into goblins" },
  { id: "goblin-demolisher", type: "troop", attack: "splash", targeting: "ground", movement: "ground", own: 1 },
  { id: "goblin-drill", type: "building", attack: "none", targeting: "none", movement: "burrow", own: 1, deployChildren: { "goblin": 1 }, deathChildren: { "goblin": 2 }, periodicChildren: { "goblin": 1 } },
  { id: "goblin-gang", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 0, deployChildren: { "goblin": 3, "spear-goblin": 3 } },
  { id: "goblin-giant", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1, deployChildren: { "spear-goblin": 2 } },
  { id: "goblin-hut", type: "building", attack: "none", targeting: "none", movement: "ground", own: 1, periodicChildren: { "spear-goblin": 1 } },
  { id: "goblins", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 4 },
  { id: "goblinstein", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 1, deployChildren: { "goblinstein-monster": 1 }, gap: "champion ability (a later protocol extension)" },
  { id: "golden-knight", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, gap: "champion ability (a later protocol extension)" },
  { id: "golem", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1, deathChildren: { "golemite": 2 } },
  { id: "graveyard", type: "spell", attack: "none", targeting: "all", movement: null, own: 0, deployChildren: { "skeleton": 1 }, gap: "not in the plan document (data only)" },
  { id: "guards", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 3 },
  { id: "hog-rider", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1 },
  { id: "ice-golem", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1 },
  { id: "ice-spirit", type: "troop", attack: "suicide", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "ice-wizard", type: "troop", attack: "splash", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "inferno-dragon", type: "troop", attack: "beam", targeting: "air+ground", movement: "flying", own: 1, flying: true },
  { id: "inferno-tower", type: "building", attack: "beam", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "knight", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1 },
  { id: "lava-hound", type: "troop", attack: "single", targeting: "buildings", movement: "flying", own: 1, deathChildren: { "lava-pup": 6 }, flying: true },
  { id: "lightning", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "little-prince", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 1, gap: "champion ability (a later protocol extension)" },
  { id: "lumberjack", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, deathChildren: { "rage-field": 1 } },
  { id: "magic-archer", type: "troop", attack: "pierce", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "mega-knight", type: "troop", attack: "splash", targeting: "ground", movement: "ground", own: 1 },
  { id: "mighty-miner", type: "troop", attack: "beam", targeting: "ground", movement: "ground", own: 1, gap: "champion ability (a later protocol extension)" },
  { id: "miner", type: "troop", attack: "single", targeting: "ground", movement: "burrow", own: 1, gap: "the burrow teleport is a no-op - the miner appears at the drop point" },
  { id: "mini-pekka", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1 },
  { id: "minion-horde", type: "troop", attack: "single", targeting: "air+ground", movement: "flying", own: 6, flying: true },
  { id: "minions", type: "troop", attack: "single", targeting: "air+ground", movement: "flying", own: 3, flying: true },
  { id: "monk", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, gap: "champion ability (a later protocol extension)" },
  { id: "mortar", type: "building", attack: "splash", targeting: "ground", movement: "siege", own: 1 },
  { id: "mother-witch", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 1, gap: "the curse status never spawns the cursed hog" },
  { id: "musketeer", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "night-witch", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, deathChildren: { "bat": 1 }, periodicChildren: { "bat": 2 } },
  { id: "pekka", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1 },
  { id: "phoenix", type: "troop", attack: "single", targeting: "air+ground", movement: "flying", own: 1, deathChildren: { "phoenix-egg": 1 }, flying: true },
  { id: "poison", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "prince", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1 },
  { id: "princess", type: "troop", attack: "splash", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "rage", type: "spell", attack: "none", targeting: "friendly", movement: null, own: 0 },
  { id: "ram-rider", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1 },
  { id: "rascals", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 0, deployChildren: { "rascal-boy": 1, "rascal-girl": 2 } },
  { id: "rocket", type: "spell", attack: "none", targeting: "all", movement: null, own: 0, gap: "the travel delay (delayMs) is not implemented" },
  { id: "royal-chef", type: "tower", attack: "single", targeting: "air+ground", movement: null, own: 1, towerTroop: true },
  { id: "royal-delivery", type: "spell", attack: "none", targeting: "enemy", movement: null, own: 0, deployChildren: { "royal-recruit": 1 }, gap: "the drop delay (delayMs) is not implemented" },
  { id: "royal-ghost", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, gap: "the invisible status is inert - the ghost is never hidden" },
  { id: "royal-giant", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 1 },
  { id: "royal-hogs", type: "troop", attack: "single", targeting: "buildings", movement: "ground", own: 4 },
  { id: "royal-recruits", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 6 },
  { id: "skeleton-army", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 15 },
  { id: "skeleton-barrel", type: "troop", attack: "none", targeting: "buildings", movement: "flying", own: 1, deathChildren: { "skeleton": 7 }, flying: true },
  { id: "skeleton-king", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 1, gap: "champion ability (a later protocol extension)" },
  { id: "skeletons", type: "troop", attack: "single", targeting: "ground", movement: "ground", own: 3 },
  { id: "sparky", type: "troop", attack: "splash", targeting: "ground", movement: "ground", own: 1, gap: "the chargeUp status is inert - there is no stored shot" },
  { id: "spear-goblins", type: "troop", attack: "single", targeting: "air+ground", movement: "ground", own: 3 },
  { id: "tesla", type: "building", attack: "single", targeting: "air+ground", movement: "ground", own: 1, gap: "the buried/reveal statuses are inert - the tesla is never hidden" },
  { id: "the-log", type: "spell", attack: "none", targeting: "ground", movement: null, own: 0 },
  { id: "tombstone", type: "building", attack: "none", targeting: "none", movement: "ground", own: 1, deathChildren: { "skeleton": 4 }, periodicChildren: { "skeleton": 2 } },
  { id: "tornado", type: "spell", attack: "none", targeting: "enemy", movement: null, own: 0, gap: "the pull knockback is not implemented - the tornado pushes the units away" },
  { id: "tower-princess", type: "tower", attack: "single", targeting: "air+ground", movement: null, own: 1, towerTroop: true },
  { id: "valkyrie", type: "troop", attack: "splash", targeting: "ground", movement: "ground", own: 1 },
  { id: "void", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "witch", type: "troop", attack: "splash", targeting: "air+ground", movement: "ground", own: 1, periodicChildren: { "skeleton": 3 } },
  { id: "wizard", type: "troop", attack: "splash", targeting: "air+ground", movement: "ground", own: 1 },
  { id: "x-bow", type: "building", attack: "beam", targeting: "ground", movement: "siege", own: 1, gap: "the lockOn status is inert - the beam does not lock on" },
  { id: "zap", type: "spell", attack: "none", targeting: "all", movement: null, own: 0 },
  { id: "zappies", type: "troop", attack: "chain", targeting: "air+ground", movement: "ground", own: 3 },
];

const FILLER = ["knight", "archers", "musketeer", "fireball", "zap", "giant", "skeletons", "cannon"];
const RED_DECK = ["giant", "knight", "musketeer", "fireball", "archers", "zap", "skeletons", "cannon"];
/** Blue's safe staging spot (own half, clear of every tower footprint). */
const STAGE = { x: 9, y: 8 };
/** Where a pinned red target stands (out of the blue towers' reach). */
const TARGET = { x: 9, y: 12 };

function deckWith(cardId: string): string[] {
  const fillers = FILLER.filter((id) => id !== cardId).slice(0, 7);
  const deck = [cardId, ...fillers];
  assert.equal(deck.length, 8, `deck for ${cardId}`);
  return deck;
}

function scenario(cardId: string, tag: string): EngineState {
  const state = createGame(`matrix-${tag}-${cardId}`, deckWith(cardId), RED_DECK);
  // The crown towers shoot too: a measuring target inside their range would
  // take tower chip on top of the mechanic under test. Silence them.
  for (const tower of state.towers) tower.damage = 0;
  return state;
}

/** Play a card for a side with full elixir. */
function play(state: EngineState, side: "blue" | "red", cardId: string, x: number, y: number) {
  state.elixir[side] = 10;
  const handIndex = forceInHand(state, side, cardId);
  return playCard(state, side, { handIndex, x, y });
}

/**
 * A stationary red troop used as a measuring target. It never moves, never
 * attacks and never dies, so every hp delta is the mechanic under test.
 */
function pinRed(state: EngineState, x: number, y: number, hp = 1_000_000): SimUnit {
  const unit = {
    id: `pin-${state.units.length}`,
    cardId: "giant",
    owner: "red",
    level: 1,
    hp,
    maxHp: hp,
    x,
    y,
    flying: false,
    isBuilding: false,
    cooldown: 0,
    stunUntil: -1,
    frozenUntil: -1,
    slowUntil: -1,
    slowMultiplier: 1,
    rageUntil: -1,
    rageMultiplier: 1,
    readyAt: state.timeSec,
    damage: 0,
    hitSpeed: 1,
    range: 1.2,
    sightRange: 5.5,
    speed: 0,
    targets: "ground",
    splash: 0,
    dashReady: true,
    rampStage: 0,
  } as unknown as SimUnit;
  state.units.push(unit);
  return unit;
}

function countUnits(state: EngineState, cardId: string, owner?: "blue" | "red"): number {
  return state.units.filter((u) => u.cardId === cardId && u.hp > 0 && (owner === undefined || u.owner === owner)).length;
}

/**
 * The crown towers shoot too: a measuring target inside their range would
 * take tower chip on top of the mechanic under test. Silence them.
 */
function silenceTowers(state: EngineState): void {
  for (const tower of state.towers) tower.damage = 0;
}


/** Kill a deployed unit so its onDeath effects resolve. */
function kill(state: EngineState, unit: SimUnit): void {
  unit.hp = 0;
  tickGame(state);
}

describe("card matrix - data conformance", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  it("covers every catalogue card exactly once", () => {
    const ids = new Set(MATRIX.map((row) => row.id));
    assert.equal(ids.size, MATRIX.length, "the matrix must not repeat a card");
    const catalogue = Object.keys(CARDS).sort();
    assert.deepEqual([...ids].sort(), catalogue, "the matrix must cover the whole catalogue");
  });

  for (const row of MATRIX) {
    it(`${row.id} matches the catalogue and the mechanics row`, () => {
      const card = CARDS[row.id];
      assert.ok(card, `${row.id} must exist in the catalogue`);
      assert.equal(card.type, row.type, `${row.id} type`);
      const mechanics = card.mechanics;
      assert.ok(mechanics, `${row.id} must have a mechanics row`);
      assert.equal(mechanics.attack, row.attack, `${row.id} attack pattern`);
      assert.equal(mechanics.targeting, row.targeting, `${row.id} targeting`);
      assert.equal(mechanics.movement ?? null, row.movement, `${row.id} movement`);
      assert.equal(mechanics.towerTroop === true, row.towerTroop === true, `${row.id} tower troop`);
      assert.equal(card.flying === true, row.flying === true, `${row.id} flying`);
      if (row.type !== "spell" && row.type !== "tower") {
        if (row.own > 0) {
          assert.equal(card.count, row.own, `${row.id} squad size`);
        } else {
          // A composite card replaces itself with its children: the children
          // together replace the squad.
          const children = Object.values(row.deployChildren ?? {}).reduce((sum, n) => sum + n, 0);
          assert.equal(children, card.count, `${row.id} composite squad size`);
        }
      }
    });
  }
});

describe("card matrix - deploy behaviour", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  for (const row of MATRIX) {
    it(`${row.id} deploys into the entities the plan describes`, () => {
      const state = scenario(row.id, "deploy");

      if (row.towerTroop === true) {
        // Tower troops are profiles, never cards: the hand must reject them.
        const result = play(state, "blue", row.id, STAGE.x, STAGE.y);
        assert.equal(result.ok, false, `${row.id} must not be playable from the hand`);
        assert.equal(result.code, "CARD_REJECTED");
        assert.equal(countUnits(state, row.id), 0);
        const deckCheck = validateDeck([...FILLER.slice(0, 7), row.id]);
        assert.ok(deckCheck !== null, `${row.id} must not be deckable`);
        return;
      }

      const result = play(state, "blue", row.id, STAGE.x, STAGE.y);
      assert.equal(result.ok, true, `${row.id} must be playable: ${JSON.stringify(result)}`);

      if (row.type === "spell") {
        // A spell never leaves a unit of its own id behind.
        assert.equal(countUnits(state, row.id), 0, `${row.id} must not spawn units`);
        return;
      }

      const own = countUnits(state, row.id, "blue");
      assert.equal(own, row.own, `${row.id} must deploy ${row.own} unit(s)`);
      for (const unit of state.units.filter((u) => u.cardId === row.id && u.owner === "blue")) {
        assert.equal(unit.isBuilding, row.type === "building", `${row.id} building flag`);
        assert.equal(unit.flying, row.flying === true, `${row.id} flying flag`);
        if (row.type === "troop") {
          assert.equal(unit.targets, row.targeting, `${row.id} target mask`);
        }
      }

      for (const [childId, count] of Object.entries(row.deployChildren ?? {})) {
        if (row.id === "graveyard") {
          // The graveyard spell spawns its skeletons on a timer (a field).
          assert.ok(state.fields.length > 0, "graveyard must create a spawn field");
          continue;
        }
        assert.equal(countUnits(state, childId, "blue"), count, `${row.id} must deploy ${count} x ${childId}`);
      }
    });
  }
});

describe("card matrix - mechanic probes", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  // --- spells -------------------------------------------------------------

  it("arrows: the volley damages every troop in the area", () => {
    const state = scenario("arrows", "probe");
        silenceTowers(state);
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "arrows", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "arrows must damage the target");
  });

  it("barbarian-barrel: the roll releases exactly one barbarian", () => {
    const state = scenario("barbarian-barrel", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "barbarian-barrel", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the barrel must hit the ground troop in its lane");
    assert.equal(countUnits(state, "barbarian", "blue"), 1, "the barrel releases exactly one barbarian");
  });

  it("clone: the spell copies the friendly troops around it", () => {
    const state = scenario("clone", "probe");
    const knight = play(state, "blue", "knight", STAGE.x, STAGE.y);
    assert.equal(knight.ok, true);
    const original = state.units.find((u) => u.cardId === "knight" && u.owner === "blue");
    assert.ok(original);
    const result = play(state, "blue", "clone", original.x, original.y);
    assert.equal(result.ok, true);
    const clones = state.units.filter((u) => u.isClone === true);
    assert.equal(clones.length, 1, "clone must copy the friendly troop");
    assert.equal(clones[0].cardId, "knight");
    assert.equal(clones[0].hp, 1, "a clone starts with one hit point");
  });

  it("earthquake: the ground shakes for three seconds", () => {
    const state = scenario("earthquake", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "earthquake", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the earthquake must damage the target");
    assert.ok(state.fields.length > 0, "the earthquake must keep ticking");
  });

  it("fireball: the tower takes the reduced damage", () => {
    const state = scenario("fireball", "probe");
    const tower = state.towers.find((t) => t.owner === "red" && t.kind === "princess");
    assert.ok(tower);
    const before = tower.hp;
    const result = play(state, "blue", "fireball", tower.x, tower.y);
    assert.equal(result.ok, true);
    assert.ok(tower.hp < before, "the fireball must damage the tower");
    assert.ok(before - tower.hp < tower.maxHp / 4, "the tower damage must use the reduced multiplier");
  });

  it("freeze: the area freezes the enemies it hits", () => {
    const state = scenario("freeze", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "freeze", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the freeze must damage the target");
    assert.ok(target.frozenUntil > state.timeSec, "the target must be frozen");
  });

  it("giant-snowball: the hit knocks the enemies back and slows them", () => {
    const state = scenario("giant-snowball", "probe");
    // Off-centre: a knockback needs a direction (a target exactly on the
    // impact point would not move).
    const target = pinRed(state, TARGET.x + 0.6, TARGET.y);
    const before = target.hp;
    const xBefore = target.x;
    const result = play(state, "blue", "giant-snowball", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the snowball must damage the target");
    assert.ok(target.slowUntil > state.timeSec, "the target must be slowed");
    assert.ok(Math.abs(target.x - xBefore) > 0.1, "the target must be knocked back");
  });

  it("goblin-barrel: three goblins drop out of the barrel", () => {
    const state = scenario("goblin-barrel", "probe");
    const result = play(state, "blue", "goblin-barrel", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.equal(countUnits(state, "goblin", "blue"), 3);
  });

  it("goblin-curse: the cursed area keeps damaging (the curse itself is a known gap)", () => {
    const state = scenario("goblin-curse", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "goblin-curse", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the cursed area must damage the target");
    assert.ok(state.fields.length > 0, "the curse must keep ticking");
  });

  it("lightning: the highest-hp target is struck and stunned", () => {
    const state = scenario("lightning", "probe");
    const weak = pinRed(state, TARGET.x, TARGET.y, 5_000);
    const strong = pinRed(state, TARGET.x + 1, TARGET.y, 50_000);
    const result = play(state, "blue", "lightning", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(strong.hp < 50_000, "lightning must damage a target");
    assert.ok(strong.stunUntil > state.timeSec, "the struck target must be stunned");
    // The chain takes the biggest target first, so it must have taken at
    // least as much damage as the smaller one.
    assert.ok(50_000 - strong.hp >= 5_000 - weak.hp, "lightning ranks the targets by hp");
  });

  it("poison: the poison keeps damaging over time", () => {
    const state = scenario("poison", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "poison", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the poison must damage the target");
    const afterCast = target.hp;
    for (let i = 0; i < 12; i++) tickGame(state);
    assert.ok(target.hp < afterCast, "the poison must keep damaging on its timer");
  });

  it("rage: the friendly troops around it are buffed", () => {
    const state = scenario("rage", "probe");
    const knight = play(state, "blue", "knight", STAGE.x, STAGE.y);
    assert.equal(knight.ok, true);
    const unit = state.units.find((u) => u.cardId === "knight" && u.owner === "blue");
    assert.ok(unit);
    const result = play(state, "blue", "rage", unit.x, unit.y);
    assert.equal(result.ok, true);
    assert.ok(unit.rageUntil > state.timeSec, "the friendly troop must be raging");
  });

  it("rocket: the rocket damages the tower (its travel delay is a known gap)", () => {
    const state = scenario("rocket", "probe");
    const tower = state.towers.find((t) => t.owner === "red" && t.kind === "princess");
    assert.ok(tower);
    const before = tower.hp;
    const result = play(state, "blue", "rocket", tower.x, tower.y);
    assert.equal(result.ok, true);
    assert.ok(tower.hp < before, "the rocket must damage the tower");
  });

  it("royal-delivery: the package drops a royal recruit", () => {
    const state = scenario("royal-delivery", "probe");
    const result = play(state, "blue", "royal-delivery", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.equal(countUnits(state, "royal-recruit", "blue"), 1);
  });

  it("the-log: the log rolls the lane and hits the ground troops", () => {
    const state = scenario("the-log", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "the-log", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the log must hit the ground troop in its lane");
  });

  it("tornado: the vortex keeps ticking and shoves the units (the pull is a known gap)", () => {
    const state = scenario("tornado", "probe");
    // Off-centre: a knockback needs a direction.
    const target = pinRed(state, TARGET.x + 0.6, TARGET.y);
    const before = target.hp;
    const xBefore = target.x;
    const result = play(state, "blue", "tornado", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the tornado must damage the target");
    assert.ok(state.fields.length > 0, "the tornado must keep ticking");
    assert.ok(Math.abs(target.x - xBefore) > 0.1, "the tornado must displace the units");
  });

  it("void: the void deletes the units it swallows", () => {
    const state = scenario("void", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "void", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the void must damage the target");
    assert.ok(state.fields.length > 0, "the void must keep ticking");
  });

  it("zap: the zap stuns the units it hits", () => {
    const state = scenario("zap", "probe");
    const target = pinRed(state, TARGET.x, TARGET.y);
    const before = target.hp;
    const result = play(state, "blue", "zap", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    assert.ok(target.hp < before, "the zap must damage the target");
    assert.ok(target.stunUntil > state.timeSec, "the target must be stunned");
  });

  // --- troops: death effects ---------------------------------------------

  const deathProbes: Array<{ id: string; child?: string; count?: number; damage?: boolean; note?: string }> = [
    { id: "balloon", damage: true },
    { id: "bomb-tower", damage: true },
    { id: "giant-skeleton", damage: true },
    { id: "goblin-demolisher", damage: true },
    { id: "ice-golem", damage: true },
    { id: "golem", child: "golemite", count: 2, damage: true },
    { id: "battle-ram", child: "barbarian", count: 2 },
    { id: "lava-hound", child: "lava-pup", count: 6 },
    { id: "elixir-golem", child: "elixir-golemite", count: 2 },
    { id: "lumberjack", child: "rage-field", count: 1 },
    { id: "goblin-cage", child: "goblin-brawler", count: 1 },
    { id: "phoenix", child: "phoenix-egg", count: 1 },
    { id: "skeleton-barrel", child: "skeleton", count: 7, damage: true },
    { id: "tombstone", child: "skeleton", count: 4 },
    { id: "night-witch", child: "bat", count: 1 },
  ];

  for (const probe of deathProbes) {
    it(`${probe.id}: dying releases what the plan describes`, () => {
      const state = scenario(probe.id, "death");
      const deployed = play(state, "blue", probe.id, STAGE.x, STAGE.y);
      assert.equal(deployed.ok, true, `${probe.id} must be playable`);
      const unit = state.units.find((u) => u.cardId === probe.id && u.owner === "blue");
      assert.ok(unit, `${probe.id} must be deployed`);

      const victim = probe.damage === true ? pinRed(state, unit.x, unit.y) : null;
      const hpBefore = victim === null ? 0 : victim.hp;
      kill(state, unit);

      if (probe.child !== undefined) {
        assert.equal(
          countUnits(state, probe.child, "blue"),
          probe.count ?? 1,
          `${probe.id} must release ${probe.count ?? 1} x ${probe.child}`,
        );
      }
      if (victim !== null) {
        assert.ok(victim.hp < hpBefore, `${probe.id} must damage the units around its death`);
      }
    });
  }

  it("elixir-golem: the golem chain pays elixir to the opponent", () => {
    const state = scenario("elixir-golem", "death");
    const deployed = play(state, "blue", "elixir-golem", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const golem = state.units.find((u) => u.cardId === "elixir-golem" && u.owner === "blue");
    assert.ok(golem);
    // Measure the payout itself: set the wallets right before the death.
    state.elixir.blue = 5;
    state.elixir.red = 5;
    kill(state, golem);
    assert.equal(countUnits(state, "elixir-golemite", "blue"), 2);
    // The opponent of the dead golem receives the elixir (the passive regen
    // runs too, so compare with a tolerance).
    assert.ok(state.elixir.red > 6, `the opponent must receive the elixir (red=${state.elixir.red})`);
    assert.ok(state.elixir.blue <= 5.1, `the owner must not receive elixir (blue=${state.elixir.blue})`);
  });

  // --- troops: periodic spawners ----------------------------------------

  const periodicProbes: Array<{ id: string; child: string; count: number; ticks: number }> = [
    { id: "barbarian-hut", child: "barbarian", count: 3, ticks: 160 },
    { id: "furnace", child: "fire-spirit", count: 1, ticks: 80 },
    { id: "goblin-hut", child: "spear-goblin", count: 1, ticks: 30 },
    { id: "goblin-drill", child: "goblin", count: 1, ticks: 40 },
    { id: "witch", child: "skeleton", count: 3, ticks: 80 },
    { id: "night-witch", child: "bat", count: 2, ticks: 60 },
    { id: "tombstone", child: "skeleton", count: 2, ticks: 50 },
  ];

  for (const probe of periodicProbes) {
    it(`${probe.id}: the periodic spawner releases ${probe.child}`, () => {
      const state = scenario(probe.id, "periodic");
      const deployed = play(state, "blue", probe.id, STAGE.x, STAGE.y);
      assert.equal(deployed.ok, true, `${probe.id} must be playable`);
      for (let i = 0; i < probe.ticks; i++) tickGame(state);
      assert.ok(
        countUnits(state, probe.child, "blue") >= probe.count,
        `${probe.id} must release ${probe.count} x ${probe.child}`,
      );
    });
  }

  it("elixir-collector: the collector pumps elixir to its owner", () => {
    const state = scenario("elixir-collector", "periodic");
    const deployed = play(state, "blue", "elixir-collector", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    state.elixir.blue = 5;
    for (let i = 0; i < 135; i++) tickGame(state);
    assert.ok(state.elixir.blue > 5, "the collector must pump elixir to its owner");
  });

  it("graveyard: the spell keeps raising skeletons", () => {
    const state = scenario("graveyard", "periodic");
    const result = play(state, "blue", "graveyard", TARGET.x, TARGET.y);
    assert.equal(result.ok, true);
    for (let i = 0; i < 40; i++) tickGame(state);
    assert.ok(countUnits(state, "skeleton", "blue") > 1, "the graveyard must keep spawning skeletons");
  });

  // --- troops: shields, dashes, chains, ramps ----------------------------

  const shieldProbes = ["guards", "royal-recruits", "dark-prince"];
  for (const id of shieldProbes) {
    it(`${id}: the deployed troops carry a shield`, () => {
      const state = scenario(id, "shield");
      const deployed = play(state, "blue", id, STAGE.x, STAGE.y);
      assert.equal(deployed.ok, true);
      const units = state.units.filter((u) => u.cardId === id && u.owner === "blue");
      assert.ok(units.length > 0);
      for (const unit of units) {
        assert.ok((unit.shieldHp ?? 0) > 0, `${id} must shield its units`);
      }
    });
  }

  const dashProbes = ["bandit", "prince"];
  for (const id of dashProbes) {
    it(`${id}: the charge closes the distance to the target`, () => {
      const state = scenario(id, "dash");
      const deployed = play(state, "blue", id, 17, 9.5);
      assert.equal(deployed.ok, true);
      const unit = state.units.find((u) => u.cardId === id && u.owner === "blue");
      assert.ok(unit);
      const target = pinRed(state, 17, 14);
      tickGame(state);
      const gap = Math.hypot(unit.x - target.x, unit.y - target.y);
      assert.ok(gap <= unit.range + 0.001, `${id} must reach the target (gap=${gap})`);
    });
  }

  // The rams only ever chase BUILDINGS, so their charge is measured against
  // a tower: the enemy princess is moved next to the ram so the charge can
  // trigger inside the sight range.
  const buildingDashProbes = ["battle-ram", "ram-rider"];
  for (const id of buildingDashProbes) {
    it(`${id}: the charge closes the distance to the tower`, () => {
      const state = scenario(id, "dash");
      const deployed = play(state, "blue", id, 3.5, 13);
      assert.equal(deployed.ok, true);
      const unit = state.units.find((u) => u.cardId === id && u.owner === "blue");
      assert.ok(unit);
      const tower = state.towers.find((t) => t.owner === "red" && t.kind === "princess");
      assert.ok(tower);
      tower.y = 17;
      tower.x = 3.5;
      tickGame(state);
      const gap = Math.hypot(unit.x - tower.x, unit.y - tower.y);
      assert.ok(gap <= unit.range + 0.5, `${id} must reach the tower (gap=${gap})`);
    });
  }

  const chainProbes = ["electro-dragon", "electro-wizard", "zappies"];
  for (const id of chainProbes) {
    it(`${id}: the chain hits more than one target`, () => {
      const state = scenario(id, "chain");
      const deployed = play(state, "blue", id, STAGE.x, STAGE.y);
      assert.equal(deployed.ok, true);
      const first = pinRed(state, STAGE.x, STAGE.y + 2);
      const second = pinRed(state, STAGE.x + 1.5, STAGE.y + 2);
      const before = first.hp + second.hp;
      for (let i = 0; i < 6; i++) tickGame(state);
      assert.ok(first.hp + second.hp < before, `${id} must damage the chained targets`);
    });
  }

  const rampProbes = ["inferno-dragon", "inferno-tower", "mighty-miner"];
  for (const id of rampProbes) {
    it(`${id}: the beam escalates while it stays locked on`, () => {
      const state = scenario(id, "ramp");
      const deployed = play(state, "blue", id, STAGE.x, STAGE.y);
      assert.equal(deployed.ok, true);
      const unit = state.units.find((u) => u.cardId === id && u.owner === "blue");
      assert.ok(unit);
      // Close enough to shoot from the first tick.
      const target = pinRed(state, STAGE.x, STAGE.y + 1.2);
      const hits: number[] = [];
      let previous = target.hp;
      for (let i = 0; i < 8; i++) {
        unit.cooldown = 0;
        tickGame(state);
        hits.push(previous - target.hp);
        previous = target.hp;
      }
      const dealt = hits.filter((hit) => hit > 0);
      assert.ok(dealt.length > 0, `${id} must deal damage`);
      assert.ok((unit.rampStage ?? 0) >= 2, `${id} must ramp up (stage=${unit.rampStage})`);
      assert.ok(
        dealt[dealt.length - 1] > dealt[0],
        `${id} must escalate (${hits.join(", ")})`,
      );
    });
  }

  it("fire-spirit: the spirit leaps onto the target and dies with it", () => {
    const state = scenario("fire-spirit", "suicide");
    const deployed = play(state, "blue", "fire-spirit", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const spirit = state.units.find((u) => u.cardId === "fire-spirit" && u.owner === "blue");
    assert.ok(spirit);
    const target = pinRed(state, STAGE.x, STAGE.y + 2);
    const before = target.hp;
    tickGame(state);
    assert.equal(spirit.hp, 0, "the spirit must die on impact");
    assert.ok(target.hp < before, "the spirit must damage the target");
  });

  it("ice-spirit: the spirit freezes the target and dies with it", () => {
    const state = scenario("ice-spirit", "suicide");
    const deployed = play(state, "blue", "ice-spirit", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const spirit = state.units.find((u) => u.cardId === "ice-spirit" && u.owner === "blue");
    assert.ok(spirit);
    const target = pinRed(state, STAGE.x, STAGE.y + 2);
    tickGame(state);
    assert.equal(spirit.hp, 0, "the spirit must die on impact");
    assert.ok(target.frozenUntil > state.timeSec, "the ice spirit must freeze the target");
  });

  it("fisherman: the hook drags the enemy troop into melee range", () => {
    const state = scenario("fisherman", "hook");
    const deployed = play(state, "blue", "fisherman", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const fisher = state.units.find((u) => u.cardId === "fisherman" && u.owner === "blue");
    assert.ok(fisher);
    const target = pinRed(state, STAGE.x, STAGE.y + 3);
    const before = Math.hypot(fisher.x - target.x, fisher.y - target.y);
    for (let i = 0; i < 4; i++) tickGame(state);
    const after = Math.hypot(fisher.x - target.x, fisher.y - target.y);
    assert.ok(after < before, "the hook must pull the target closer");
  });

  it("miner: the miner may be dropped on the enemy half", () => {
    const state = scenario("miner", "burrow");
    const result = play(state, "blue", "miner", 14.5, 26);
    assert.equal(result.ok, true, "the miner must be deployable anywhere");
    assert.equal(state.units[0].y, 26);
  });

  it("goblin-drill: the drill may be dropped on the enemy half", () => {
    const state = scenario("goblin-drill", "burrow");
    const result = play(state, "blue", "goblin-drill", 14.5, 26);
    assert.equal(result.ok, true, "the goblin drill must be deployable anywhere");
    const drill = state.units.find((u) => u.cardId === "goblin-drill");
    assert.ok(drill);
    assert.equal(drill.y, 26);
  });

  // --- known gaps: the plan behaviour the engine does not implement yet --

  it("royal-ghost: the ghost is visible to the enemy (invisible is a known gap)", () => {
    const state = scenario("royal-ghost", "gap");
    const deployed = play(state, "blue", "royal-ghost", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const ghost = state.units.find((u) => u.cardId === "royal-ghost" && u.owner === "blue");
    assert.ok(ghost);
    assert.equal((ghost as unknown as { invisibleUntil?: number }).invisibleUntil, undefined);
  });

  it("mother-witch: the cursed hog is never spawned (curse is a known gap)", () => {
    const state = scenario("mother-witch", "gap");
    const deployed = play(state, "blue", "mother-witch", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const witch = state.units.find((u) => u.cardId === "mother-witch" && u.owner === "blue");
    assert.ok(witch);
    pinRed(state, witch.x, witch.y + 1);
    for (let i = 0; i < 12; i++) tickGame(state);
    assert.equal(countUnits(state, "cursed-hog", "red"), 0, "the curse does not spawn the hog yet");
  });

  it("sparky: there is no stored shot (chargeUp is a known gap)", () => {
    const state = scenario("sparky", "gap");
    const deployed = play(state, "blue", "sparky", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const sparky = state.units.find((u) => u.cardId === "sparky" && u.owner === "blue");
    assert.ok(sparky);
    const target = pinRed(state, STAGE.x, STAGE.y + 2);
    const before = target.hp;
    for (let i = 0; i < 8; i++) tickGame(state);
    assert.ok(target.hp < before, "sparky still damages its target");
    assert.equal((sparky as unknown as { chargedShot?: boolean }).chargedShot, undefined);
  });

  it("tesla: the building is never hidden (buried is a known gap)", () => {
    const state = scenario("tesla", "gap");
    const deployed = play(state, "blue", "tesla", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const tesla = state.units.find((u) => u.cardId === "tesla" && u.owner === "blue");
    assert.ok(tesla);
    assert.equal((tesla as unknown as { buriedUntil?: number }).buriedUntil, undefined);
  });

  it("x-bow: the beam does not lock on (lockOn is a known gap)", () => {
    const state = scenario("x-bow", "gap");
    const deployed = play(state, "blue", "x-bow", STAGE.x, STAGE.y);
    assert.equal(deployed.ok, true);
    const bow = state.units.find((u) => u.cardId === "x-bow" && u.owner === "blue");
    assert.ok(bow);
    assert.equal((bow as unknown as { lockedTargetId?: string }).lockedTargetId, undefined);
  });
});
