/**
 * backend/tests/elixir-pump.test.ts — the elixir-producing cards.
 *
 * "Elixir pump" in this game = the cards that GRANT elixir:
 *  - elixir-collector: a building that pumps 1 elixir every 13s to its owner.
 *  - elixir-golem / elixir-golemite / elixir-blob: on death they hand elixir
 *    to the opponent (the CR "elixir golem" chain).
 *
 * These must actually raise the elixir value (server-authoritative), and the
 * gain must respect the mode cap.
 */

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, tickGame } from "../src/game/engine.js";
import type { EngineState } from "../src/game/engine.js";
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
  return createGame(`pump-${seq}`, DECK, [...DECK], modeId === undefined ? undefined : { modeId });
}

/** Deploy a card for a side at a legal own-half position. */
function deploy(state: EngineState, side: "blue" | "red", cardId: string): void {
  const slot = forceInHand(state, side, cardId);
  state.elixir[side] = 10;
  const at = side === "blue" ? { x: 9, y: 5 } : { x: 9, y: 26 };
  const { playCard } = require("../src/game/engine.js") as typeof import("../src/game/engine.js");
  const res = playCard(state, side, { handIndex: slot, ...at });
  assert.equal(res.ok, true, `${cardId} should deploy: ${res.ok ? "" : (res as { code: string }).code}`);
}

describe("elixir pump", () => {
  it("the Elixir Collector pumps elixir to its owner", () => {
    const s = newGame();
    deploy(s, "blue", "elixir-collector");
    const before = s.elixir.blue;
    // 13s of ticks (one pump period + a bit).
    for (let i = 0; i < 140; i += 1) tickGame(s);
    assert.ok(
      s.elixir.blue > before,
      `collector must raise the owner's elixir (${before} -> ${s.elixir.blue})`,
    );
  });

  it("the Elixir Golem hands elixir to the opponent when it dies", () => {
    const s = newGame();
    deploy(s, "blue", "elixir-golem");
    const golem = s.units.find((u) => u.cardId === "elixir-golem");
    assert.ok(golem, "the elixir golem should be on the board");
    const redBefore = s.elixir.red;
    golem.hp = 0;
    tickGame(s);
    // The golem's on-death payout goes to the opponent (red).
    assert.ok(
      s.elixir.red > redBefore,
      `the opponent must gain elixir (${redBefore} -> ${s.elixir.red})`,
    );
  });

  it("the elixir gain never exceeds the mode cap", () => {
    const s = newGame("infinite-elixir");
    deploy(s, "blue", "elixir-collector");
    s.elixir.blue = 10;
    for (let i = 0; i < 200; i += 1) tickGame(s);
    assert.equal(s.elixir.blue, 10, "elixir must stay at the cap");
  });
});
