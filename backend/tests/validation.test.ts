/**
 * validation.test.ts — server-side deploy validation / anti-cheat (no server needed).
 *
 * Covers docs/GAME_DESIGN.md §5.3 (deploy zones) + §11 (authoritative validation):
 *  - bad x/y (out of bounds, river, enemy half for troops) -> BAD_POSITION
 *  - insufficient elixir -> NO_ELIXIR
 *  - bad handIndex (incl. non-integer) -> BAD_HAND_INDEX
 *  - cardId echo mismatch -> CARD_REJECTED, stale tick -> STALE_TICK,
 *    6th rapid play -> RATE_LIMITED (§11.3–11.4)
 * Every rejection leaves elixir/units/towers/hands/crowns untouched
 * (§11: "no elixir deducted on reject", no mutation).
 *
 * Real engine API — see `engine.test.ts` header. Run: `npm test` from `backend/`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, playCard } from '../src/game/engine.js';
import type { EngineState } from '../src/game/engine.js';

const BLUE_DECK = [
  'knight',
  'archers',
  'fireball',
  'musketeer',
  'giant',
  'skeletons',
  'baby-dragon',
  'cannon',
];
const RED_DECK = [...BLUE_DECK];

let gameSeq = 1000;
function newGame(): EngineState {
  gameSeq += 1;
  return createGame(`validation-${gameSeq}`, BLUE_DECK, RED_DECK);
}

interface Snap {
  elixir: number;
  units: number;
  towersHp: number[];
  hands: string[];
  crowns: { blue: number; red: number };
}

function snapshot(state: EngineState, side: 'blue' | 'red'): Snap {
  return {
    elixir: state.elixir[side],
    units: state.units.length,
    towersHp: state.towers.map((t) => t.hp),
    hands: [...state.hands[side]],
    crowns: { ...state.crowns },
  };
}

function assertNoMutation(state: EngineState, side: 'blue' | 'red', before: Snap): void {
  assert.equal(state.elixir[side], before.elixir, 'rejected play must not deduct elixir');
  assert.equal(state.units.length, before.units, 'rejected play must not spawn units');
  assert.deepEqual(
    state.towers.map((t) => t.hp),
    before.towersHp,
    'rejected play must not damage towers',
  );
  assert.deepEqual(state.hands[side], before.hands, 'rejected play must not cycle the hand');
  assert.deepEqual(state.crowns, before.crowns, 'rejected play must not touch crowns');
}

describe('validation — bad x/y positions (GAME_DESIGN §§5.3/11.2)', () => {
  // Hand slot 0 = knight (troop): out-of-bounds is illegal for every card type.
  const badPoints: Array<[number, number, string]> = [
    [-1, 5, 'x < 0'],
    [19, 5, 'x > 18'],
    [9, -1, 'y < 0'],
    [9, 33, 'y > 32'],
    [99, 99, 'far out of bounds'],
  ];

  for (const [x, y, label] of badPoints) {
    it(`rejects out-of-bounds deploy (${label}) with BAD_POSITION`, () => {
      const s = newGame();
      s.elixir.blue = 10;
      const before = snapshot(s, 'blue');
      const r = playCard(s, 'blue', { handIndex: 0, x, y });
      assert.equal(r.ok, false, `expected rejection for (${x},${y})`);
      assert.equal((r as { code: string }).code, 'BAD_POSITION');
      assertNoMutation(s, 'blue', before);
    });
  }

  it('rejects river deploy (y 15–16) with BAD_POSITION', () => {
    const s = newGame();
    s.elixir.blue = 10;
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 15.5 });
    assert.equal(r.ok, false, 'river band is impassable except bridges (§5.2)');
    assert.equal((r as { code: string }).code, 'BAD_POSITION');
    assertNoMutation(s, 'blue', before);
  });

  it('rejects enemy-half troop deploy (blue knight at red y=25)', () => {
    const s = newGame();
    s.elixir.blue = 10;
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 25 });
    assert.equal(r.ok, false, 'blue troop on red half must be rejected (§5.3)');
    assert.equal((r as { code: string }).code, 'BAD_POSITION');
    assertNoMutation(s, 'blue', before);
  });

  it('rejects mirrored enemy-half troop deploy (red knight at blue y=5)', () => {
    const s = newGame();
    s.elixir.red = 10;
    const before = snapshot(s, 'red');
    const r = playCard(s, 'red', { handIndex: 0, x: 9, y: 5 });
    assert.equal(r.ok, false, 'red troop on blue half must be rejected (§5.3)');
    assert.equal((r as { code: string }).code, 'BAD_POSITION');
    assertNoMutation(s, 'red', before);
  });
});

describe('validation — insufficient elixir (GAME_DESIGN §11.1)', () => {
  it('rejects with NO_ELIXIR when broke and deducts nothing', () => {
    const s = newGame();
    s.elixir.blue = 0; // below every card cost (pool is 1–6 per §1)
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5 });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'NO_ELIXIR');
    assertNoMutation(s, 'blue', before);
  });

  it('rejects when elixir covers only part of the cost (1 vs knight 3)', () => {
    const s = newGame();
    s.elixir.blue = 1; // slot 0 = knight (3 elixir)
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5 });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'NO_ELIXIR');
    assertNoMutation(s, 'blue', before);
  });
});

describe('validation — bad handIndex (GAME_DESIGN §11.3)', () => {
  for (const badIndex of [-1, 4, 99, 1.5]) {
    it(`rejects handIndex=${badIndex} with BAD_HAND_INDEX`, () => {
      const s = newGame();
      s.elixir.blue = 10;
      const before = snapshot(s, 'blue');
      const r = playCard(s, 'blue', { handIndex: badIndex, x: 9, y: 5 });
      assert.equal(r.ok, false, `expected rejection for handIndex ${badIndex}`);
      assert.equal((r as { code: string }).code, 'BAD_HAND_INDEX');
      assertNoMutation(s, 'blue', before);
    });
  }

  it('rejects a mismatched cardId echo with CARD_REJECTED', () => {
    const s = newGame();
    s.elixir.blue = 10;
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5, cardId: 'giant' });
    assert.equal(r.ok, false, 'server resolves truth via handIndex (§12.4)');
    assert.equal((r as { code: string }).code, 'CARD_REJECTED');
    assertNoMutation(s, 'blue', before);
  });
});

describe('validation — clock/rate (GAME_DESIGN §11.4)', () => {
  it('rejects a stale clientTick outside the ±5 window with STALE_TICK', () => {
    const s = newGame();
    s.elixir.blue = 10;
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5, clientTick: s.tick + 99 });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'STALE_TICK');
    assertNoMutation(s, 'blue', before);
  });

  it('rejects the 6th rapid play with RATE_LIMITED (burst cap 5/s/side)', () => {
    const s = newGame();
    for (let i = 0; i < 5; i += 1) {
      s.elixir.blue = 10;
      const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5 });
      assert.equal(r.ok, true, `setup play ${i} should succeed`);
    }
    s.elixir.blue = 10;
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5 });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'RATE_LIMITED');
    assertNoMutation(s, 'blue', before);
  });
});
