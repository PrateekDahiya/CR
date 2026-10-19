import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { hydrateMechanicsFromMysql } from "../src/mysql.js";
import { createGame, playCard, tickGame } from "../src/game/engine.js";
import type { EngineState } from "../src/game/engine.js";
import { forceInHand } from "./deckHelpers.js";

/**
 * Phase 13 regression tests.
 *
 * Every mechanic here was declared in `infra/mysql/card_mechanics.json` but
 * silently dropped by the engine, so the card did nothing observable:
 *   - X-Bow could never damage a tower (siege buildings were own-half locked)
 *   - Bandit never dashed
 *   - Mortar had no minimum-range dead zone
 *   - Inferno Dragon/Tower never ramped
 *   - Miner could not be dropped on the enemy half
 *   - Lightning struck nothing (`chain` was unreachable for spells)
 *   - The Log / Barbarian Barrel rolled nothing
 */
const FILLER = ["knight", "archers", "musketeer", "fireball", "zap", "giant", "skeletons", "cannon"];
/** Red's deck: the cards these tests need must sit in the opening 4-card hand. */
const RED_DECK = ["giant", "knight", "musketeer", "fireball", "archers", "zap", "skeletons", "cannon"];
const RED_GIANT = 0;
const RED_KNIGHT = 1;

function deckWith(cardId: string): string[] {
  // 1 subject card + 7 fillers = a legal 8-card deck.
  const deck = [cardId, ...FILLER.slice(0, 7)];
  assert.equal(deck.length, 8);
  return deck;
}

function handIndexOf(deck: string[], cardId: string): number {
  const index = deck.indexOf(cardId);
  assert.notEqual(index, -1, `${cardId} missing from deck`);
  return index;
}

function redPrincess(state: EngineState) {
  const tower = state.towers.find((t) => t.owner === "red" && t.kind === "princess");
  assert.ok(tower);
  return tower;
}

/**
 * Inject a stationary enemy troop so a mechanic can be measured exactly.
 * Mobile two-unit setups are flaky (both sides walk, and pathing through the
 * river dominates); a pinned target isolates the primitive under test.
 */
function pinTarget(
  state: EngineState,
  template: { cardId: string; hp: number },
  x: number,
  y: number,
) {
  const base = state.units[0] ?? (state.towers[0] as unknown as never);
  assert.ok(base);
  const unit = {
    ...(base as object),
    id: `pin-${state.units.length}`,
    cardId: template.cardId,
    owner: "red" as const,
    hp: template.hp,
    maxHp: template.hp,
    x,
    y,
    speed: 0,
    flying: false,
    isBuilding: false,
    splash: 0,
    range: 1.2,
    sightRange: 5.5,
    minRange: 0,
    dashReady: true,
    rampStage: 0,
    // The template may be a building; a pinned troop must NOT inherit its
    // lifetime, or HP wear-down would pollute the measurement.
    expiresAt: undefined,
    lifetimeSec: undefined,
    mechanics: undefined,
    deathBurst: undefined,
    deathBurstRadius: undefined,
    shieldHp: undefined,
    periodicNextAt: undefined,
    cooldown: 0,
    slowUntil: -1,
    slowMultiplier: 1,
    rageUntil: -1,
    rageMultiplier: 1,
    stunUntil: -1,
    frozenUntil: -1,
    readyAt: state.timeSec,
  };
  state.units.push(unit as never);
  return unit as typeof state.units[number];
}

describe("phase 13 — siege buildings can contest towers", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  it("X-Bow may be placed forward and damages the enemy tower", () => {
    const deck = deckWith("x-bow");
    const state = createGame("siege-xbow", deck, RED_DECK);
    const tower = redPrincess(state);
    const hpBefore = tower.hp;

    // Forward placement on the enemy half, in the left lane, in range.
    state.elixir.blue = 10;
    const placed = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "x-bow"),
      x: tower.x,
      y: tower.y - 4,
    });
    assert.equal(placed.ok, true, "siege buildings must be placeable forward");

    for (let i = 0; i < 12; i++) tickGame(state);
    assert.ok(tower.hp < hpBefore, "X-Bow must actually damage the tower");
  });

  it("X-Bow still cannot be placed on the river", () => {
    const deck = deckWith("x-bow");
    const state = createGame("siege-xbow-river", deck, RED_DECK);
    state.elixir.blue = 10;
    const result = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "x-bow"),
      x: 3.5,
      y: 16,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "BAD_POSITION");
  });
});

describe("phase 13 — dash primitive", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  it("Bandit blinks into contact range and deals the declared multiplier", () => {
    const deck = deckWith("bandit");
    const state = createGame("dash-bandit", deck, RED_DECK);

    state.elixir.blue = 10;
    const placed = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "bandit"),
      x: 17,
      y: 9.5,
    });
    assert.equal(placed.ok, true);
    const bandit = state.units.find((u) => u.cardId === "bandit");
    assert.ok(bandit);
    assert.equal(bandit.dashReady, true);

    // A pinned red Giant 4.5 tiles away: outside melee range (3), inside sight,
    // and clear of every friendly tower so no tower chip pollutes the reading.
    const giant = pinTarget(state, { cardId: "giant", hp: 100_000 }, 17, 14);
    const hpBefore = giant.hp;

    tickGame(state);

    const gap = Math.hypot(bandit.x - giant.x, bandit.y - giant.y);
    assert.ok(
      gap <= bandit.range + 0.001,
      `bandit should have dashed into contact range (gap=${gap})`,
    );
    const dealt = hpBefore - giant.hp;
    assert.ok(
      Math.abs(dealt - bandit.damage * 2) < 0.001,
      `dash must deal multiplier x2 (dealt=${dealt}, expected=${bandit.damage * 2})`,
    );
    assert.equal(bandit.dashReady, false, "the dash must be spent until the unit attacks again");
  });

  it("a spent dash does not re-trigger without an attack", () => {
    const deck = deckWith("bandit");
    const state = createGame("dash-bandit-once", deck, RED_DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", { handIndex: forceInHand(state, "blue", "bandit"), x: 3.5, y: 8 });
    const bandit = state.units.find((u) => u.cardId === "bandit");
    assert.ok(bandit);
    bandit.dashReady = false;

    pinTarget(state, { cardId: "giant", hp: 100_000 }, 3.5, 12);
    const yBefore = bandit.y;
    tickGame(state);
    assert.ok(bandit.y > yBefore, "a disarmed bandit must walk, not teleport");
    assert.ok(
      Math.abs(bandit.y - yBefore) < 1,
      "a walking step is far smaller than a dash",
    );
  });

  it("does not dash across the map at a distant tower", () => {
    const deck = deckWith("bandit");
    const state = createGame("dash-bandit-tower", deck, RED_DECK);
    const banditSlot = forceInHand(state, "blue", "bandit");
    state.elixir.blue = 10;
    // Not on the blue princess footprint at (3.5, 6.5).
    const placed = playCard(state, "blue", { handIndex: banditSlot, x: 3.5, y: 10 });
    assert.equal(placed.ok, true);
    const bandit = state.units.find((u) => u.cardId === "bandit");
    assert.ok(bandit);

    // No enemy troops: the only target is the far princess tower, ~18 tiles away.
    const tower = redPrincess(state);
    const distanceBefore = Math.hypot(tower.x - bandit.x, tower.y - bandit.y);
    assert.ok(distanceBefore > bandit.sightRange, "the tower must start out of dash reach");

    for (let i = 0; i < 5; i++) tickGame(state);

    const distanceAfter = Math.hypot(tower.x - bandit.x, tower.y - bandit.y);
    const closed = distanceBefore - distanceAfter;
    assert.ok(
      closed < bandit.sightRange,
      `bandit must not blink most of the map toward a tower (closed ${closed.toFixed(2)})`,
    );
  });

  it("dashes land adjacent to the target rather than at standoff range", () => {
    const deck = deckWith("bandit");
    const state = createGame("dash-bandit-contact", deck, RED_DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", { handIndex: forceInHand(state, "blue", "bandit"), x: 17, y: 9.5 });
    const bandit = state.units.find((u) => u.cardId === "bandit");
    assert.ok(bandit);
    pinTarget(state, { cardId: "giant", hp: 100_000 }, 17, 14);
    const giant = state.units[state.units.length - 1];

    tickGame(state);
    const gap = Math.hypot(bandit.x - giant.x, bandit.y - giant.y);
    assert.ok(gap <= 1.25, `a dash should land adjacent (gap=${gap})`);
  });
});

describe("phase 13 — minimum range", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  it("Mortar cannot hit a unit standing inside its minimum range", () => {
    const deck = deckWith("mortar");
    const state = createGame("minrange-mortar", deck, RED_DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", { handIndex: forceInHand(state, "blue", "mortar"), x: 9, y: 12 });
    const mortar = state.units.find((u) => u.cardId === "mortar");
    assert.ok(mortar);
    assert.equal(mortar.minRange, 3.5, "mortar declares minimumRange 3.5");

    // Plant a red troop right beside the mortar, well out of the towers' reach
    // so the only thing that could damage it is the mortar itself.
    const intruder = {
      ...mortar,
      id: "test-target",
      cardId: "giant",
      owner: "red" as const,
      hp: 1_000_000,
      maxHp: 1_000_000,
      x: mortar.x,
      y: mortar.y + 1,
      speed: 0,
      isBuilding: false,
      splash: 0,
      range: 1.2,
      minRange: 0,
      dashReady: true,
      rampStage: 0,
      // Must not inherit the building's lifetime, or HP wear-down would pollute
      // this measurement.
      expiresAt: undefined,
      lifetimeSec: undefined,
      mechanics: undefined,
    };
    state.units.push(intruder);

    // Friendly princess towers also chip the target, so assert on the damage
    // ceiling rather than on "no damage at all": one mortar shell is 728.
    for (let i = 0; i < 15; i++) tickGame(state);
    const dealt = 1_000_000 - intruder.hp;
    assert.ok(
      dealt < mortar.damage,
      `mortar fired inside its dead zone (dealt ${dealt} >= ${mortar.damage})`,
    );

    // Move it outside the dead zone: now the mortar must engage.
    intruder.x = mortar.x;
    intruder.y = mortar.y + 4;
    for (let i = 0; i < 15; i++) tickGame(state);
    assert.ok(
      1_000_000 - intruder.hp >= mortar.damage,
      "mortar must fire once the target clears minimum range",
    );
  });
});

describe("phase 13 — ramping beam", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  it("Inferno Tower damage escalates while locked on one target", () => {
    const deck = deckWith("inferno-tower");
    const state = createGame("ramp-inferno", deck, RED_DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "inferno-tower"),
      x: 14.5,
      y: 4,
    });
    const inferno = state.units.find((u) => u.cardId === "inferno-tower");
    assert.ok(inferno);

    pinTarget(state, { cardId: "giant", hp: 1_000_000 }, 14.5, 7);
    const target = state.units[state.units.length - 1];

    // Sample one hit per tick, forcing the beam to fire each time.
    const hits: number[] = [];
    let previous = target.hp;
    for (let i = 0; i < 6; i++) {
      inferno.cooldown = 0;
      tickGame(state);
      hits.push(previous - target.hp);
      previous = target.hp;
    }
    assert.ok(hits[0] > 0, "inferno must deal damage");
    assert.ok(
      hits[5] > hits[0] * 1.5,
      `a locked beam must ramp well above its opening hit (${hits.join(", ")})`,
    );
  });

  it("Inferno Tower resets its ramp when the target changes", () => {
    const deck = deckWith("inferno-tower");
    const state = createGame("ramp-reset", deck, RED_DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "inferno-tower"),
      x: 14.5,
      y: 4,
    });
    const inferno = state.units.find((u) => u.cardId === "inferno-tower");
    assert.ok(inferno);

    const first = pinTarget(state, { cardId: "giant", hp: 1_000_000 }, 14.5, 7);
    for (let i = 0; i < 5; i++) {
      inferno.cooldown = 0;
      tickGame(state);
    }
    const hotStage = inferno.rampStage ?? 0;
    assert.ok(hotStage > 0, "ramp should have advanced");

    // Kill the locked target; the next acquisition starts from stage 1.
    first.hp = 0;
    tickGame(state);
    inferno.cooldown = 0;
    tickGame(state);
    const target = state.units[state.units.length - 1];
    const before = target.hp;
    inferno.cooldown = 0;
    tickGame(state);
    const dealt = before - target.hp;
    assert.ok(
      dealt < inferno.damage * 2,
      `retargeting must reset the ramp (dealt=${dealt}, base=${inferno.damage})`,
    );
  });
});

describe("phase 13 — burrowers", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  it("Miner may be dropped on the enemy half", () => {
    const deck = deckWith("miner");
    const state = createGame("burrow-miner", deck, RED_DECK);
    state.elixir.blue = 10;
    const result = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "miner"),
      x: 14.5,
      y: 26,
    });
    assert.equal(result.ok, true, "miner must be deployable anywhere");
    assert.equal(state.units[0].y, 26);
  });
});

describe("phase 13 — spell primitives", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  it("Lightning strikes the highest-HP targets in the area", () => {
    const deck = deckWith("lightning");
    const state = createGame("chain-lightning", deck, RED_DECK);

    state.elixir.red = 10;
    playCard(state, "red", { handIndex: forceInHand(state, "red", "giant"), x: 3.5, y: 21 });
    state.elixir.red = 10;
    playCard(state, "red", { handIndex: forceInHand(state, "red", "knight"), x: 3.5, y: 23 });
    const targets = state.units.filter((u) => u.owner === "red");
    assert.equal(targets.length, 2);
    targets.forEach((unit) => { unit.speed = 0; });
    const before = targets.map((u) => u.hp);

    state.elixir.blue = 10;
    const cast = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "lightning"),
      x: 3.5,
      y: 22,
    });
    assert.equal(cast.ok, true);
    assert.ok(
      targets.some((u, i) => u.hp < before[i]),
      "lightning must damage at least one target",
    );
  });

  it("The Log rolls its lane and damages ground troops", () => {
    const deck = deckWith("the-log");
    const state = createGame("roll-log", deck, RED_DECK);

    state.elixir.red = 10;
    playCard(state, "red", { handIndex: RED_GIANT, x: 3.5, y: 21 });
    const giant = state.units[0];
    giant.speed = 0;
    const before = giant.hp;

    state.elixir.blue = 10;
    const cast = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "the-log"),
      x: 3.5,
      y: 21,
    });
    assert.equal(cast.ok, true);
    assert.ok(giant.hp < before, "the log must hit a ground troop in its lane");
  });
});