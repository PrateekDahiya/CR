/**
 * engine.test.ts — unit tests for the authoritative game engine (no server needed).
 *
 * Covers docs/GAME_DESIGN.md normative behavior:
 *  - §7  elixir regen (start 5, cap 10, 1 per 2.8s single / 1 per 1.4s double)
 *  - §11 playCard deducts elixir + validates (cost, hand cycle, cardId echo)
 *  - §6  tower damage + king activation (Princess 1400, King 2400, inactive king)
 *  - §8  win / crowns (princess = 1 crown, king = instant win + 3 crowns;
 *      0–0 full-HP at 3:00 goes to sudden-death overtime)
 *
 * Real engine API (`backend/src/game/engine.ts`, landed on this branch):
 *  - `createGame(matchId, blueDeck, redDeck, opts?) => EngineState`
 *  - `playCard(state, side, { handIndex, x, y, ... }) => { ok, cardId?, unitIds? } |
 *      { ok: false, code, message }` (codes: NO_ELIXIR / BAD_POSITION /
 *      BAD_HAND_INDEX / CARD_REJECTED / STALE_TICK / RATE_LIMITED)
 *  - `tickGame(state, dtSec = 0.1) => state` (10 Hz: elixir → move → combat →
 *      clock/win; dt clamped to (0, 0.5])
 *  - Constants: ELIXIR_START/CAP/SINGLE_SEC/DOUBLE_SEC, TICK_DT.
 * State shape: towers use `hp/maxHp/active/destroyed` + `x/y` (SimTower);
 * hands/decks/queue drive the CR-style 4-card rotation.
 *
 * Run: `npm test` from `backend/` (see `backend/tests/README.md`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  playCard,
  tickGame,
  ELIXIR_START,
  ELIXIR_CAP,
  ELIXIR_SINGLE_SEC,
  ELIXIR_DOUBLE_SEC,
} from '../src/game/engine.js';
import type { EngineState } from '../src/game/engine.js';

// ---------------------------------------------------------------------------
// Fixtures (GAME_DESIGN §4: 8 distinct cards, max 2 spells)
// ---------------------------------------------------------------------------
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

const SPELL_IDS = new Set(['fireball', 'arrows', 'zap']);

let gameSeq = 0;
function newGame(): EngineState {
  gameSeq += 1;
  return createGame(`test-${gameSeq}`, BLUE_DECK, RED_DECK);
}

function towerOf(state: EngineState, kind: 'king' | 'princess', owner: 'blue' | 'red') {
  const t = state.towers.find((tw) => tw.kind === kind && tw.owner === owner);
  assert.ok(t, `expected ${owner} ${kind} tower`);
  return t;
}

function tickTimes(state: EngineState, n: number, dt = 0.1): void {
  for (let i = 0; i < n; i += 1) tickGame(state, dt);
}

/** First hand slot holding a non-spell (for troop/combat plays). */
function troopSlot(state: EngineState, side: 'blue' | 'red'): number {
  const idx = state.hands[side].findIndex((id) => !SPELL_IDS.has(id));
  assert.ok(idx !== -1, `${side} hand should contain a troop`);
  return idx;
}

/** Staging deploy near the target lane; falls back to safe own-half on reject. */
function stageNear(
  state: EngineState,
  attacker: 'blue' | 'red',
  target: { x: number; y: number; owner: 'blue' | 'red'; kind: string },
): { x: number; y: number } {
  const leftSide = target.x < 9;
  const foePrincess = state.towers.find(
    (t) => t.owner === target.owner && t.kind === 'princess' && (t.x < 9) === leftSide,
  );
  const pocketOpen = foePrincess?.destroyed === true;
  const x = leftSide ? 3.5 : 13.5;
  // Pocket (§5.3): up to 4 tiles into enemy half once that side's princess falls.
  const y = attacker === 'blue' ? (pocketOpen && target.owner === 'red' ? 18 : 13) : pocketOpen && target.owner === 'blue' ? 14 : 19;
  return { x, y };
}

/**
 * Damage a tower through the public API only: fireball when available,
 * otherwise cycle a troop (which also walks in and DPSes). Advances the
 * clock between strikes so the 5-plays/sec burst window keeps sliding.
 */
function strikeUntilDestroyed(
  state: EngineState,
  attacker: 'blue' | 'red',
  kind: 'king' | 'princess',
  maxStrikes = 80,
): void {
  const target = towerOf(state, kind, attacker === 'blue' ? 'red' : 'blue');
  for (let n = 0; n < maxStrikes; n += 1) {
    if (target.destroyed || state.over) break;
    state.elixir[attacker] = 10;
    const fi = state.hands[attacker].indexOf('fireball');
    if (fi !== -1) {
      const r = playCard(state, attacker, { handIndex: fi, x: target.x, y: target.y });
      assert.equal(r.ok, true, `fireball strike should land: ${r.ok ? '' : (r as { code: string }).code}`);
    } else {
      const ti = troopSlot(state, attacker);
      const pos = stageNear(state, attacker, target);
      let r = playCard(state, attacker, { handIndex: ti, x: pos.x, y: pos.y });
      if (!r.ok) {
        // Pocket guess missed the engine's zone — retreat to safe own half.
        r = playCard(state, attacker, {
          handIndex: ti,
          x: pos.x,
          y: attacker === 'blue' ? 13 : 19,
        });
      }
      assert.equal(r.ok, true, `cycle troop should deploy: ${r.ok ? '' : (r as { code: string }).code}`);
    }
    tickTimes(state, 10); // 1s: slides the rate window, moves/combats units
  }
  assert.equal(target.destroyed, true, `expected ${target.owner} ${kind} destroyed`);
}

// ---------------------------------------------------------------------------
// §7 — elixir regen
// ---------------------------------------------------------------------------
describe('engine — elixir regen (GAME_DESIGN §7)', () => {
  it('locks the normative elixir constants', () => {
    assert.equal(ELIXIR_START, 5);
    assert.equal(ELIXIR_CAP, 10);
    assert.equal(ELIXIR_SINGLE_SEC, 2.8);
    assert.equal(ELIXIR_DOUBLE_SEC, 1.4);
  });

  it('starts at 5 elixir for both players', () => {
    const s = newGame();
    assert.equal(s.elixir.blue, 5);
    assert.equal(s.elixir.red, 5);
  });

  it('regenerates 1 elixir per 2.8s in single time', () => {
    const s = newGame();
    s.elixir.blue = 5;
    tickTimes(s, 28); // 28 x 0.1s = 2.8s
    assert.ok(Math.abs(s.elixir.blue - 6) < 1e-6, `expected ~6, got ${s.elixir.blue}`);
  });

  it('regenerates 1 elixir per 1.4s in double time (t >= 120s)', () => {
    const s = newGame();
    s.timeSec = 120; // double-elixir window (§7: last 60s + all OT)
    s.elixir.blue = 5;
    tickTimes(s, 14); // 14 x 0.1s = 1.4s
    assert.ok(Math.abs(s.elixir.blue - 6) < 1e-6, `expected ~6, got ${s.elixir.blue}`);
  });

  it('double time is ~2x faster than single time for the same dt', () => {
    const a = newGame();
    const b = newGame();
    a.elixir.blue = 0;
    b.elixir.blue = 0;
    b.timeSec = 120;
    tickTimes(a, 70); // 7s single -> 2.5
    tickTimes(b, 70); // 7s double -> 5
    assert.ok(Math.abs(a.elixir.blue - 2.5) < 1e-6, `single expected 2.5, got ${a.elixir.blue}`);
    assert.ok(Math.abs(b.elixir.blue - 5) < 1e-6, `double expected 5, got ${b.elixir.blue}`);
  });

  it('caps at 10 elixir (overflow is lost)', () => {
    const s = newGame();
    s.elixir.blue = 9.9;
    tickTimes(s, 28);
    assert.equal(s.elixir.blue, 10);
  });

  it('stays at 10 when already full', () => {
    const s = newGame();
    s.elixir.blue = 10;
    tickTimes(s, 100);
    assert.equal(s.elixir.blue, 10);
  });
});

// ---------------------------------------------------------------------------
// §11 — playCard deducts + validates
// ---------------------------------------------------------------------------
describe('engine — playCard deducts + cycles (GAME_DESIGN §11)', () => {
  it('deducts the card cost and spawns the unit on a legal own-half deploy', () => {
    const s = newGame();
    s.elixir.blue = 10;
    // Hand slot 0 = knight (troop, cost 3); queue head = giant.
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5 });
    assert.equal(r.ok, true);
    assert.equal((r as { cardId: string }).cardId, 'knight');
    assert.equal((r as { unitIds: string[] }).unitIds.length, 1);
    assert.equal(s.elixir.blue, 7);
    assert.equal(s.units.length, 1);
    assert.equal(s.units[0].cardId, 'knight');
    assert.equal(s.units[0].owner, 'blue');
    // CR rotation: played knight to queue back, giant into slot 0.
    assert.equal(s.hands.blue[0], 'giant');
  });

  it('red side deploys on its own half (y 17–31)', () => {
    const s = newGame();
    s.elixir.red = 10;
    const r = playCard(s, 'red', { handIndex: 0, x: 9, y: 26 });
    assert.equal(r.ok, true);
    assert.equal(s.elixir.red, 7);
  });

  it('rejects a mismatched cardId echo with CARD_REJECTED', () => {
    const s = newGame();
    s.elixir.blue = 10;
    const before = s.elixir.blue;
    const r = playCard(s, 'blue', { handIndex: 0, x: 9, y: 5, cardId: 'giant' });
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, 'CARD_REJECTED');
    assert.equal(s.elixir.blue, before, 'no elixir deducted on reject');
    assert.equal(s.units.length, 0, 'no spawn on reject');
  });
});

// ---------------------------------------------------------------------------
// §6 — tower damage + king activation
// ---------------------------------------------------------------------------
describe('engine — towers + king activation (GAME_DESIGN §6)', () => {
  it('initialises 6 towers: Princess 1400, King 2400, king starts INACTIVE', () => {
    const s = newGame();
    assert.equal(s.towers.length, 6);
    for (const side of ['blue', 'red'] as const) {
      const princesses = s.towers.filter((t) => t.kind === 'princess' && t.owner === side);
      assert.equal(princesses.length, 2, `expected 2 princess towers for ${side}`);
      for (const p of princesses) {
        assert.equal(p.hp, 1400);
        assert.equal(p.maxHp, 1400);
        assert.equal(p.destroyed, false);
        assert.equal(p.active, true);
      }
      const king = towerOf(s, 'king', side);
      assert.equal(king.hp, 2400);
      assert.equal(king.maxHp, 2400);
      assert.equal(king.active, false, `${side} king must start INACTIVE`);
    }
  });

  it('king activates permanently when it takes any damage (fireball chip)', () => {
    const s = newGame();
    const king = towerOf(s, 'king', 'blue');
    s.elixir.red = 10;
    // Red hand slot 2 = fireball (spell, cost 4, 280 vs towers).
    const r = playCard(s, 'red', { handIndex: 2, x: king.x, y: king.y });
    assert.equal(r.ok, true);
    assert.equal(king.hp, 2400 - 280);
    assert.equal(king.active, true, 'king must activate after taking damage (§6.2)');
    const redKing = towerOf(s, 'king', 'red');
    assert.equal(redKing.active, false, 'undamaged red king stays inactive');
  });

  it('a single fireball chips but does not destroy a princess (no crown yet)', () => {
    const s = newGame();
    const princess = towerOf(s, 'princess', 'red');
    s.elixir.blue = 10;
    const r = playCard(s, 'blue', { handIndex: 2, x: princess.x, y: princess.y });
    assert.equal(r.ok, true);
    assert.equal(princess.hp, 1400 - 280);
    assert.equal(princess.destroyed, false);
    assert.equal(s.crowns.blue, 0);
    assert.equal(s.crowns.red, 0);
  });

  it("destroying a princess grants a crown and activates that side's king", () => {
    const s = newGame();
    strikeUntilDestroyed(s, 'blue', 'princess');
    const redLeft = s.towers.find((t) => t.owner === 'red' && t.kind === 'princess' && t.x < 9);
    const redRight = s.towers.find((t) => t.owner === 'red' && t.kind === 'princess' && t.x >= 9);
    const destroyedCount = [redLeft, redRight].filter((t) => t?.destroyed).length;
    assert.equal(destroyedCount, 1, 'exactly one red princess should fall first');
    assert.equal(s.crowns.blue, 1, 'destroyer gains 1 crown');
    assert.equal(s.crowns.red, 0);
    assert.equal(towerOf(s, 'king', 'red').active, true, 'red king activates when a friendly princess falls (§6.2)');
    assert.equal(s.over, false, 'single princess kill does not end the match');
  });
});

// ---------------------------------------------------------------------------
// §8 — win / crowns + overtime trigger
// ---------------------------------------------------------------------------
describe('engine — win / crowns (GAME_DESIGN §8)', () => {
  it('king kill is an instant win with 3 crowns (king-snipe)', () => {
    const s = newGame();
    strikeUntilDestroyed(s, 'blue', 'king');
    const king = towerOf(s, 'king', 'red');
    assert.equal(king.destroyed, true);
    assert.equal(s.crowns.blue, 3, 'king kill grants 3 crowns (§8.2)');
    assert.equal(s.winner, 'blue', 'destroying the enemy king wins immediately');
    assert.equal(s.over, true);
  });

  it('0–0 with full HP at 3:00 goes to sudden-death overtime, then draws at 4:00', () => {
    const s = newGame();
    tickTimes(s, 1800); // 180s regulation
    assert.equal(s.over, false, 'tied full-HP game must not end at 180s');
    assert.equal(s.overtime, true, 'tie within epsilon triggers OT (§8.2)');
    assert.equal(s.winner, undefined);
    tickTimes(s, 600); // to the 240s hard cap
    assert.equal(s.over, true);
    assert.equal(s.winner, 'draw', 'scoreless OT ends level -> draw (§8.2.4)');
  });
});
