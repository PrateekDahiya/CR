/**
 * backend/tests/game-modes.test.ts — game-mode registry + mode rules.
 *
 * The registry (backend/src/game/modes.ts) is the single source of truth for
 * match rules: the home picker reads it over REST, matchmaking partitions the
 * queue by mode, and the engine applies the resolved config.
 *
 * Covers:
 *  - registry contents (id / label / multiplier / start / cap) + strict parse
 *  - engine honours the mode: start elixir, cap and regen multiplier
 *  - Infinite Elixir (8x) regenerates 8x faster for the whole match
 *  - Takedown ends the match on the first tower destroyed
 */

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, playCard, tickGame } from "../src/game/engine.js";
import type { EngineState } from "../src/game/engine.js";
import {
  DEFAULT_GAME_MODE_ID,
  GAME_MODES,
  getGameMode,
  listGameModes,
  parseGameMode,
  resolveGameMode,
} from "../src/game/modes.js";
import { hydrateMechanicsFromMysql } from "../src/mysql.js";
import { forceInHand } from "./deckHelpers.js";

before(async () => {
  await hydrateMechanicsFromMysql();
});

const DECK = [
  "knight",
  "archers",
  "fireball",
  "musketeer",
  "giant",
  "skeletons",
  "baby-dragon",
  "cannon",
];

let seq = 0;
function newGame(modeId?: string): EngineState {
  seq += 1;
  return createGame(`modes-${seq}`, DECK, [...DECK], modeId === undefined ? undefined : { modeId });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
describe("game modes — registry", () => {
  it("exposes the standard, 2x, infinite-elixir and takedown modes", () => {
    const ids = GAME_MODES.map((m) => m.id);
    assert.ok(ids.includes("standard"));
    assert.ok(ids.includes("double-elixir"));
    assert.ok(ids.includes("infinite-elixir"));
    assert.ok(ids.includes("takedown"));
  });

  it("keeps every mode JSON-serialisable and fully described", () => {
    for (const mode of listGameModes()) {
      assert.equal(typeof mode.id, "string");
      assert.ok(mode.label.length > 0, `${mode.id} needs a label`);
      assert.ok(mode.description.length > 0, `${mode.id} needs a description`);
      assert.ok(mode.elixirRateMultiplier > 0, `${mode.id} needs a positive rate`);
      assert.ok(mode.startElixir >= 0 && mode.startElixir <= mode.elixirCap);
      assert.equal(JSON.parse(JSON.stringify(mode)).id, mode.id);
    }
  });

  it("starts every mode at 8 elixir (2026-10-20 request)", () => {
    for (const mode of GAME_MODES) {
      assert.equal(mode.startElixir, 8, `${mode.id} must start at 8 elixir`);
    }
  });

  it("resolves unknown ids to the default mode", () => {
    assert.equal(resolveGameMode("nope").id, DEFAULT_GAME_MODE_ID);
    assert.equal(resolveGameMode(undefined).id, DEFAULT_GAME_MODE_ID);
    assert.equal(getGameMode("infinite-elixir")?.elixirRateMultiplier, 8);
  });

  it("rejects unknown mode ids on strict parse (server authoritative)", () => {
    const bad = parseGameMode("not-a-mode");
    assert.equal(bad.ok, false);
    const good = parseGameMode("infinite-elixir");
    assert.equal(good.ok, true);
    assert.equal(good.ok ? good.mode.id : "", "infinite-elixir");
    const missing = parseGameMode(undefined);
    assert.equal(missing.ok, true);
    assert.equal(missing.ok ? missing.mode.id : "", DEFAULT_GAME_MODE_ID);
  });
});

// ---------------------------------------------------------------------------
// Engine honours the mode
// ---------------------------------------------------------------------------
describe("game modes — engine rules", () => {
  it("stores the resolved mode on the engine state", () => {
    const s = newGame("infinite-elixir");
    assert.equal(s.modeId, "infinite-elixir");
    assert.equal(s.mode.elixirRateMultiplier, 8);
    assert.equal(s.mode.elixirCap, 10);
  });

  it("starts both sides at the mode's start elixir", () => {
    const s = newGame("infinite-elixir");
    assert.equal(s.elixir.blue, 8);
    assert.equal(s.elixir.red, 8);
  });

  it("regenerates 8x faster in infinite elixir for the whole match", () => {
    const normal = newGame("standard");
    const fast = newGame("infinite-elixir");
    normal.elixir.blue = 0;
    fast.elixir.blue = 0;
    for (let i = 0; i < 28; i += 1) {
      tickGame(normal);
      tickGame(fast);
    }
    // 2.8s of standard time = 1 elixir; 8x mode = 8 elixir (capped at 10).
    assert.ok(Math.abs(normal.elixir.blue - 1) < 1e-6, `standard expected 1, got ${normal.elixir.blue}`);
    assert.ok(Math.abs(fast.elixir.blue - 8) < 1e-6, `infinite expected 8, got ${fast.elixir.blue}`);
  });

  it("keeps the infinite-elixir rate constant after the double window", () => {
    const s = newGame("infinite-elixir");
    s.timeSec = 150; // past the normal double-elixir window
    s.elixir.blue = 0;
    for (let i = 0; i < 28; i += 1) tickGame(s);
    assert.ok(Math.abs(s.elixir.blue - 8) < 1e-6, `expected 8, got ${s.elixir.blue}`);
  });

  it("regenerates 2x faster in the 2x-elixir mode", () => {
    const s = newGame("double-elixir");
    s.elixir.blue = 0;
    for (let i = 0; i < 28; i += 1) tickGame(s);
    assert.ok(Math.abs(s.elixir.blue - 2) < 1e-6, `expected 2, got ${s.elixir.blue}`);
  });

  it("caps elixir at the mode cap (10)", () => {
    const s = newGame("infinite-elixir");
    s.elixir.blue = 9.9;
    for (let i = 0; i < 40; i += 1) tickGame(s);
    assert.equal(s.elixir.blue, 10);
  });
});

// ---------------------------------------------------------------------------
// Takedown win condition
// ---------------------------------------------------------------------------
describe("game modes — takedown", () => {
  /** One fireball onto a nearly-dead enemy princess tower. */
  function strikePrincess(state: EngineState): void {
    const target = state.towers.find((t) => t.owner === "red" && t.kind === "princess" && t.x < 9);
    assert.ok(target);
    target.hp = 1;
    const slot = forceInHand(state, "blue", "fireball");
    state.elixir.blue = 10;
    const res = playCard(state, "blue", { handIndex: slot, x: target.x, y: target.y });
    assert.equal(res.ok, true, `fireball should land: ${res.ok ? "" : (res as { code: string }).code}`);
    tickGame(state);
  }

  it("ends the match when the first tower falls", () => {
    const s = newGame("takedown");
    assert.equal(s.mode.winCondition, "first-tower");
    strikePrincess(s);
    const target = s.towers.find((t) => t.owner === "red" && t.kind === "princess" && t.x < 9);
    assert.ok(target);
    assert.equal(target.destroyed, true, "the princess tower should fall");
    assert.equal(s.over, true, "takedown ends the match on the first tower");
    assert.equal(s.winner, "blue");
  });

  it("keeps the normal crowns rule in standard mode", () => {
    const s = newGame("standard");
    assert.equal(s.mode.winCondition, "crowns");
    strikePrincess(s);
    const target = s.towers.find((t) => t.owner === "red" && t.kind === "princess" && t.x < 9);
    assert.ok(target);
    assert.equal(target.destroyed, true);
    assert.equal(s.crowns.blue, 1);
    assert.equal(s.over, false, "one princess kill does not end a standard match");
  });
});
