/**
 * Replay recorder tests: the sampler keeps one frame per interval, the store
 * is bounded and the frames carry the towers + units of the match.
 *
 * O(u + t) per sampled frame. Run: npm test (tsx --test).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  finishReplay,
  getReplay,
  hasReplay,
  recordReplayFrame,
  resetReplays,
  REPLAY_INTERVAL_MS,
  type ReplaySnapshotSource,
} from "../src/replays.js";

function snapshot(units = 2): ReplaySnapshotSource {
  const list = [];
  for (let i = 0; i < units; i += 1) {
    list.push({
      id: `u${i}`,
      cardId: "knight",
      owner: i % 2 === 0 ? "blue" : "red",
      level: 5,
      hitPoints: 100 - i,
      maxHitPoints: 100,
      position: { x: 3 + i, y: 9 },
    });
  }
  return {
    towers: [
      {
        id: "blue-king",
        kind: "king",
        owner: "blue",
        hitPoints: 2400,
        maxHitPoints: 2400,
        position: { x: 9, y: 3.5 },
        destroyed: false,
      },
    ],
    units: list,
    crowns: { blue: 1, red: 0 },
    elixir: { blue: 5, red: 2 },
  };
}

beforeEach(() => {
  resetReplays();
});

describe("replay recorder", () => {
  it("samples one frame per interval and drops the fast ones", () => {
    const t0 = 1_000_000;
    recordReplayFrame("m1", snapshot(), t0);
    recordReplayFrame("m1", snapshot(), t0 + 10);
    recordReplayFrame("m1", snapshot(), t0 + REPLAY_INTERVAL_MS);
    const replay = getReplay("m1");
    assert.equal(replay?.frames.length, 2);
    assert.equal(replay?.frames[0].t, 0);
    assert.equal(replay?.frames[1].t, REPLAY_INTERVAL_MS);
  });

  it("stores the towers, the units and the crown score", () => {
    recordReplayFrame("m1", snapshot(3), 1_000_000);
    const frame = getReplay("m1")?.frames[0];
    assert.equal(frame?.towers.length, 1);
    assert.equal(frame?.towers[0].id, "blue-king");
    assert.equal(frame?.units.length, 3);
    assert.equal(frame?.units[0].id, "u0");
    assert.equal(frame?.units[1].owner, "red");
    assert.equal(frame?.crownsBlue, 1);
    assert.equal(frame?.elixirBlue, 5);
  });

  it("closes the replay with the winner", () => {
    recordReplayFrame("m1", snapshot(), 1_000_000);
    finishReplay("m1", "blue", 1_500_000);
    assert.equal(getReplay("m1")?.winner, "blue");
    assert.equal(getReplay("m1")?.endedAtMs, 1_500_000);
  });

  it("reports whether a match can be watched", () => {
    assert.equal(hasReplay("m1"), false);
    recordReplayFrame("m1", snapshot(), 1_000_000);
    assert.equal(hasReplay("m1"), true);
    assert.equal(hasReplay("m2"), false);
    assert.equal(getReplay("m2"), undefined);
  });
});
