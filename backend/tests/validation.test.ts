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
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, playCard } from '../src/game/engine.js';
import type { EngineState } from '../src/game/engine.js';
import { forceInHand } from './deckHelpers.js';
import { validateCardLevels, validatePosition, validateTowerTroopId } from '../src/net/validation.js';
import { hydrateMechanicsFromMysql } from '../src/mysql.js';

// The placement class (burrow / siege) lives in the card mechanics, so the
// rules have to be hydrated before the position checks run.
before(async () => {
  await hydrateMechanicsFromMysql();
});

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

describe('level selection validation', () => {
  it('fills omitted deck levels with level 1', () => {
    const result = validateCardLevels({ knight: 7 }, BLUE_DECK);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.levels.knight, 7);
      assert.equal(result.levels.giant, 1);
      assert.equal(Object.keys(result.levels).length, 8);
    }
  });

  it('rejects invalid, out-of-deck, and tower troop selections', () => {
    assert.equal(validateCardLevels({ knight: 0 }, BLUE_DECK).ok, false);
    assert.equal(validateCardLevels({ miner: 4 }, BLUE_DECK).ok, false);
    assert.equal(validateTowerTroopId('tower-princess').ok, true);
    assert.equal(validateTowerTroopId('knight').ok, false);
  });

  it('allows the selected tower-troop level alongside deck levels', () => {
    const selected = validateCardLevels({ 'tower-princess': 5 }, BLUE_DECK, 'tower-princess');
    assert.equal(selected.ok, true);
    const rejected = validateCardLevels({ 'tower-princess': 5 }, BLUE_DECK);
    assert.equal(rejected.ok, false);
  });

  it('keeps validated levels as an immutable match-start snapshot', () => {
    const state = createGame('level-snapshot', BLUE_DECK, RED_DECK, {
      blueCardLevels: { knight: 9 },
      redCardLevels: { giant: 11 },
      blueTowerTroopId: 'tower-princess',
      redTowerTroopId: 'cannoneer',
    });
    assert.equal(state.cardLevels.blue.knight, 9);
    assert.equal(state.cardLevels.red.giant, 11);
    assert.equal(state.towerTroopId.blue, 'tower-princess');
    assert.equal(state.statVersion, 1);

    state.elixir.blue = 10;
    state.hands.blue[0] = 'knight';
    const placed = playCard(state, 'blue', { handIndex: 0, x: 9, y: 5 });
    assert.equal(placed.ok, true);
    assert.ok((state.units[0]?.maxHp ?? 0) > 1450, 'combat spawn must use the resolved level row');
  });
});

let gameSeq = 1000;
/** Phase 14: the opening hand is shuffled, so position tests must pick a
 *  non-spell slot (deploy-zone rules apply to troops/buildings, not spells). */
function deploySlot(state: EngineState, side: 'blue' | 'red' = 'blue'): number {
  const idx = state.hands[side].findIndex((id) => id !== 'fireball' && id !== 'zap' && id !== 'arrows');
  assert.ok(idx !== -1, 'blue hand must contain a deployable card');
  return idx;
}
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
      const r = playCard(s, 'blue', { handIndex: deploySlot(s), x, y });
      assert.equal(r.ok, false, `expected rejection for (${x},${y})`);
      assert.equal((r as { code: string }).code, 'BAD_POSITION');
      assertNoMutation(s, 'blue', before);
    });
  }

  it('rejects river deploy (y 15–16) with BAD_POSITION', () => {
    const s = newGame();
    s.elixir.blue = 10;
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: deploySlot(s), x: 9, y: 15.5 });
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
    const r = playCard(s, 'red', { handIndex: deploySlot(s, 'red'), x: 9, y: 5 });
    assert.equal(r.ok, false, 'red troop on blue half must be rejected (§5.3)');
    assert.equal((r as { code: string }).code, 'BAD_POSITION');
    assertNoMutation(s, 'red', before);
  });
});

describe('validation — the net layer agrees with the engine on the placement class', () => {
  // Regression: the net layer used to reject a burrow drop on the opponent's
  // half ("position outside your deploy zone") while the engine allowed it,
  // so the Miner could never be dropped on the enemy side.
  it('allows a burrower (the miner) on the opponent half', () => {
    const blue = validatePosition('blue', 9, 25, 'miner');
    assert.equal(blue.ok, true, 'the miner travels underground: any half is legal');
    const red = validatePosition('red', 9, 5, 'miner');
    assert.equal(red.ok, true, 'the miner travels underground: any half is legal');
  });

  it('allows a siege building (the mortar) on the opponent half', () => {
    assert.equal(validatePosition('blue', 9, 25, 'mortar').ok, true);
    assert.equal(validatePosition('red', 9, 5, 'x-bow').ok, true);
  });

  it('still rejects a burrower on the river', () => {
    const onRiver = validatePosition('blue', 9, 15.5, 'miner');
    assert.equal(onRiver.ok, false);
    assert.equal(onRiver.code, 'BAD_POSITION');
  });

  it('still rejects an ordinary troop on the opponent half', () => {
    const onEnemyHalf = validatePosition('blue', 9, 25, 'knight');
    assert.equal(onEnemyHalf.ok, false);
    assert.equal(onEnemyHalf.code, 'BAD_POSITION');
  });

  it('lets a spell be cast anywhere', () => {
    assert.equal(validatePosition('blue', 9, 25, 'fireball').ok, true);
    assert.equal(validatePosition('red', 9, 5, 'arrows').ok, true);
  });

  it('plays the miner on the opponent half through the engine too', () => {
    const s = newGame();
    s.elixir.blue = 10;
    const slot = forceInHand(s, 'blue', 'miner');
    const r = playCard(s, 'blue', { handIndex: slot, x: 9, y: 25 });
    assert.equal(r.ok, true, 'the engine must accept the burrow drop');
    const miner = s.units.find((u) => u.cardId === 'miner');
    assert.ok(miner, 'the miner must spawn');
    assert.equal(miner?.y, 25);
  });
});

describe('validation — insufficient elixir (GAME_DESIGN §11.1)', () => {
  it('rejects with NO_ELIXIR when broke and deducts nothing', () => {
    const s = newGame();
    s.elixir.blue = 0; // below every card cost (pool is 1–6 per §1)
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: deploySlot(s), x: 9, y: 5 });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'NO_ELIXIR');
    assertNoMutation(s, 'blue', before);
  });

  it('rejects when elixir covers only part of the cost (1 vs knight 3)', () => {
    const s = newGame();
    s.elixir.blue = 1; // knight costs 3 elixir
    const slot = forceInHand(s, 'blue', 'knight');
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: slot, x: 9, y: 5 });
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
      const slot = forceInHand(s, 'blue', 'skeletons');
      const r = playCard(s, 'blue', { handIndex: slot, x: 9, y: 5 });
      assert.equal(r.ok, true, `setup play ${i} should succeed`);
    }
s.elixir.blue = 10;
    // Set the card up BEFORE the snapshot so the no-mutation assertion only
    // covers the rejected play itself.
    const slot = forceInHand(s, 'blue', 'skeletons');
    const before = snapshot(s, 'blue');
    const r = playCard(s, 'blue', { handIndex: slot, x: 9, y: 5 });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'RATE_LIMITED');
    assertNoMutation(s, 'blue', before);
  });
});
