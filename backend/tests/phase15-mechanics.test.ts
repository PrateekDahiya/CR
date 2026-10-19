import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hydrateMechanicsFromMysql, hydrateSpawnTemplatesFromMysql } from "../src/mysql.js";
import { createGame, playCard, tickGame } from "../src/game/engine.js";
import { CARDS, getCard, getSpawnTemplate, validateDeck } from "../src/game/cards.js";
import { forceInHand } from "./deckHelpers.js";

const repoRoot = path.resolve(__dirname, "..", "..");
const MECHANICS = JSON.parse(
  readFileSync(path.join(repoRoot, "infra", "mysql", "card_mechanics.json"), "utf8"),
) as Record<string, Record<string, unknown>>;
const TEMPLATES = JSON.parse(
  readFileSync(path.join(repoRoot, "infra", "mysql", "spawn_templates.json"), "utf8"),
) as Record<string, Record<string, unknown>>;

const FILLER = ["knight", "archers", "musketeer", "fireball", "zap", "giant", "skeletons", "cannon"];
const RED_DECK = ["giant", "knight", "musketeer", "fireball", "archers", "zap", "skeletons", "cannon"];

function deckWith(cardId: string): string[] {
  const deck = [cardId, ...FILLER.slice(0, 7)];
  assert.equal(deck.length, 8);
  return deck;
}

function pinRedTroop(
  state: ReturnType<typeof createGame>,
  x: number,
  y: number,
  hp = 100_000,
) {
  const base = state.units[0];
  const unit = {
    ...(base as object),
    id: `pin-${state.units.length}`,
    cardId: "giant",
    owner: "red" as const,
    hp,
    maxHp: hp,
    x,
    y,
    speed: 0,
    isBuilding: false,
    splash: 0,
    range: 1.2,
    sightRange: 5.5,
    minRange: 0,
    dashReady: true,
    rampStage: 0,
    expiresAt: undefined,
    lifetimeSec: undefined,
    mechanics: undefined,
  };
  state.units.push(unit as never);
  return unit as ReturnType<typeof createGame>["units"][number];
}

describe("15.1 siege buildings damage towers", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  for (const siegeId of ["mortar", "x-bow"]) {
    it(`${siegeId} placed forward damages the enemy princess tower`, () => {
      const state = createGame(`siege-${siegeId}`, deckWith(siegeId), RED_DECK);
      const tower = state.towers.find((t) => t.owner === "red" && t.kind === "princess");
      assert.ok(tower);
      const hpBefore = tower.hp;

      state.elixir.blue = 10;
      const placed = playCard(state, "blue", {
        handIndex: forceInHand(state, "blue", siegeId),
        x: tower.x,
        y: tower.y - 4,
      });
      assert.equal(placed.ok, true, `${siegeId} must be placeable forward`);

      for (let i = 0; i < 12; i++) tickGame(state);
      assert.ok(tower.hp < hpBefore, `${siegeId} must damage the tower`);
    });
  }

  it("client siege list matches the database movement field", () => {
    const fromDb = Object.entries(MECHANICS)
      .filter(([, record]) => record.movement === "siege")
      .map(([id]) => id)
      .sort();
    // Mirrors frontend SIEGE_CARD_IDS; keeps client and server in agreement.
    assert.deepEqual(fromDb, ["mortar", "x-bow"]);
  });
});

describe("15.2 spirits jump and die", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  for (const spiritId of ["fire-spirit", "ice-spirit"]) {
    it(`${spiritId} leaps onto its target, deals damage once and dies`, () => {
      const state = createGame(`suicide-${spiritId}`, deckWith(spiritId), RED_DECK);
      state.elixir.blue = 10;
      const placed = playCard(state, "blue", {
        handIndex: forceInHand(state, "blue", spiritId),
        x: 13.5,
        y: 10,
      });
      assert.equal(placed.ok, true);
      const spirit = state.units.find((u) => u.cardId === spiritId);
      assert.ok(spirit, `${spiritId} deployed`);
      const startX = spirit.x;
      const startY = spirit.y;

      // A target far outside melee range: the spirit must still reach it.
      // A target inside sight (5.5) but outside the spirit's melee reach: it
      // must leap rather than walk.
      const target = pinRedTroop(state, 13.5, 14);
      const hpBefore = target.hp;
      assert.ok(Math.hypot(target.x - startX, target.y - startY) > spirit.range);

      tickGame(state);

      assert.equal(spirit.hp, 0, `${spiritId} must die on impact`);
      assert.ok(target.hp < hpBefore, `${spiritId} must deal its damage`);
      // It landed on the target rather than walking.
      assert.ok(
        Math.hypot(spirit.x - target.x, spirit.y - target.y) < 0.01,
        `${spiritId} must end on the target`,
      );
    });

    it(`${spiritId} never attacks twice`, () => {
      const state = createGame(`suicide-once-${spiritId}`, deckWith(spiritId), RED_DECK);
      state.elixir.blue = 10;
      playCard(state, "blue", {
        handIndex: forceInHand(state, "blue", spiritId),
        x: 13.5,
        y: 10,
      });
      pinRedTroop(state, 13.5, 14);
      let spawns = 0;
      for (let i = 0; i < 10; i++) {
        const before = state.units.length;
        tickGame(state);
        if (state.units.length > before) spawns++;
      }
      assert.equal(spawns, 0, "a spent spirit must not respawn or act again");
      assert.equal(state.units.filter((u) => u.cardId === spiritId).length, 0);
    });
  }

  it("Ice Spirit freezes what it hits", () => {
    const state = createGame("suicide-freeze", deckWith("ice-spirit"), RED_DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "ice-spirit"),
      x: 13.5,
      y: 10,
    });
    const target = pinRedTroop(state, 13.5, 14);
    tickGame(state);
    assert.ok(target.stunUntil > state.timeSec, "ice spirit must freeze its victim");
  });
});

describe("15.3 barbarian barrel", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  it("rolls its lane, damages ground troops and releases one Barbarian", () => {
    const state = createGame("barrel-roll", deckWith("barbarian-barrel"), RED_DECK);
    state.elixir.blue = 10;
    const cast = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "barbarian-barrel"),
      x: 3.5,
      y: 20,
    });
    assert.equal(cast.ok, true);

    const target = pinRedTroop(state, 3.5, 20);
    const hpBefore = target.hp;
    // The barrel rolls from the caster's side through the lane.
    tickGame(state);

    assert.ok(target.hp < hpBefore, "the barrel must damage troops in its lane");
    const released = state.units.filter((u) => u.cardId === "barbarian");
    assert.equal(released.length, 1, "the barrel must release exactly one barbarian");
    assert.equal(released[0]?.owner, "blue");
  });

  it("still releases a Barbarian when nothing blocks it", () => {
    const state = createGame("barrel-open", deckWith("barbarian-barrel"), RED_DECK);
    state.elixir.blue = 10;
    const cast = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "barbarian-barrel"),
      x: 8.5,
      y: 6,
    });
    assert.equal(cast.ok, true);
    tickGame(state);
    assert.equal(state.units.filter((u) => u.cardId === "barbarian").length, 1);
  });
});

describe("15.4 tower troops are not playable", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
  });

  const towerTroops = Object.values(CARDS).filter((c) => c.type === "tower");

  it("the catalog still contains the four tower troops", () => {
    assert.deepEqual(
      towerTroops.map((c) => c.id).sort(),
      ["cannoneer", "dagger-duchess", "royal-chef", "tower-princess"],
    );
    for (const tower of towerTroops) assert.equal(tower.cost, 0);
  });

  it("playCard rejects a tower troop", () => {
    const state = createGame("tower-reject", deckWith("cannon"), RED_DECK);
    state.elixir.blue = 10;
    state.hands.blue[0] = "cannoneer";
    const result = playCard(state, "blue", { handIndex: 0, x: 9, y: 5 });
    assert.equal(result.ok, false);
    assert.equal(result.code, "CARD_REJECTED");
    assert.equal(state.units.length, 0);
  });

  it("a deck containing a tower troop is invalid", () => {
    const result = validateDeck(deckWith("cannoneer"));
    assert.ok(result !== null, "validateDeck must reject a tower troop");
    assert.equal(result?.code, "BAD_DECK");
    assert.match(String(result?.message), /tower troop/);
    assert.equal(validateDeck(deckWith("cannon")), null, "a normal deck is still valid");
  });
});

describe("15.5 elixir golem chain", () => {
  before(async () => {
    await hydrateMechanicsFromMysql();
    await hydrateSpawnTemplatesFromMysql();
  });

  it("the Golem and both child stages seek buildings only", () => {
    assert.equal(MECHANICS["elixir-golem"]?.targeting, "buildings");
    assert.equal(TEMPLATES["elixir-golemite"]?.targets, "buildings");
    assert.equal(TEMPLATES["elixir-blob"]?.targets, "buildings");
  });

  it("a Golemite ignores troops and walks to the tower", () => {
    const state = createGame("elixir-golemite", deckWith("elixir-golem"), RED_DECK);
    state.elixir.blue = 10;
    const placed = playCard(state, "blue", {
      handIndex: forceInHand(state, "blue", "elixir-golem"),
      x: 13.5,
      y: 10,
    });
    assert.equal(placed.ok, true);
    const golem = state.units.find((u) => u.cardId === "elixir-golem");
    assert.ok(golem);
    golem.hp = 0;
    tickGame(state);

    const golemite = state.units.find((u) => u.cardId === "elixir-golemite");
    assert.ok(golemite, "the golem must split into golemites");
    assert.equal(golemite.targets, "buildings", "golemites must not attack troops");

    // Put a red troop right next to it. Blue's own princess towers can chip it, so
    // assert on a damage ceiling rather than "no damage at all": one Golemite
    // hit is its (single-target) damage.
    const troop = pinRedTroop(state, golemite.x, golemite.y + 1);
    const before = troop.hp;
    const golemiteHit = golemite.damage;
    for (let i = 0; i < 10; i++) tickGame(state);
    const dealt = before - troop.hp;
    assert.ok(
      dealt < golemiteHit * 2,
      `golemites must walk past troops (took ${dealt}, two hits would be ${golemiteHit * 2})`,
    );
  });

  it("a Blob pays elixir to the OPPONENT when it dies", () => {
    const state = createGame("elixir-payout", deckWith("elixir-golem"), RED_DECK);
    state.elixir.blue = 10;
    playCard(state, "blue", { handIndex: forceInHand(state, "blue", "elixir-golem"), x: 13.5, y: 10 });
    const golem = state.units.find((u) => u.cardId === "elixir-golem");
    assert.ok(golem);
    golem.hp = 0;
    tickGame(state);
    const golemite = state.units.find((u) => u.cardId === "elixir-golemite");
    assert.ok(golemite);
    golemite.hp = 0;
    tickGame(state);

    const blob = state.units.find((u) => u.cardId === "elixir-blob");
    assert.ok(blob, "golemites split into blobs");
    const blueBefore = state.elixir.blue;
    const redBefore = state.elixir.red;
    blob.hp = 0;
    tickGame(state);

    // Red gains the payout. Blue also ticks up from ordinary elixir regen
    // (~0.036/tick), so compare deltas rather than absolutes.
    const regenPerTick = 10 / 28;
    assert.ok(
      state.elixir.red - redBefore >= 1 - regenPerTick,
      `the opponent must gain elixir (blue=${state.elixir.blue}, red=${state.elixir.red})`,
    );
    assert.ok(
      state.elixir.blue - blueBefore < 1,
      `the owner must not gain the payout (blue ${blueBefore} -> ${state.elixir.blue})`,
    );
  });

  it("the templates declare the payout", () => {
    assert.ok(Array.isArray(TEMPLATES["elixir-golemite"]?.onDeath));
    assert.ok(Array.isArray(TEMPLATES["elixir-blob"]?.onDeath));
    assert.ok(getSpawnTemplate("elixir-blob") !== undefined);
  });
});

describe("15.6 targeting audit", () => {
  it("air-capable troops can reach air", () => {
    for (const id of ["bowler", "valkyrie", "sparky", "little-prince"]) {
      assert.equal(MECHANICS[id]?.targeting, "air+ground", `${id} must reach air`);
    }
  });

  it("the Miner hits buildings and troops", () => {
    assert.equal(MECHANICS["miner"]?.targeting, "all");
  });

  it("building-seekers stay on buildings", () => {
    for (const id of ["giant", "royal-giant", "hog-rider", "golem", "lava-hound"]) {
      assert.equal(MECHANICS[id]?.targeting, "buildings", `${id} must seek buildings`);
    }
  });

  it("every card the audit flags as self-destructing really declares suicide", () => {
    for (const id of ["fire-spirit", "ice-spirit"]) {
      assert.equal(MECHANICS[id]?.attack, "suicide");
      assert.equal(getCard(id)?.type, "troop");
    }
  });
});