/**
 * @cr/shared — shared types/protocol between frontend and backend.
 * Phase 1 STUB — shape locked loosely; full numbers + events spec'd in Phase 2 (docs/GAME_DESIGN.md)
 * and enforced by authoritative server in Phase 3. Keep backward-compatible additions only.
 */

/** Card archetype. Phase 2 will enumerate the real card list. */
export type CardType = 'troop' | 'spell' | 'building';

/** Which tower slot. Each player owns 1 king + 2 princess towers. */
export type TowerKind = 'king' | 'princess';

/** Player side in a 1v1 match. */
export type PlayerSide = 'blue' | 'red';

/** Minimal 2D position (arena units defined in Phase 2). */
export interface Vec2 {
  x: number;
  y: number;
}

/** A playable card (deck definition + in-hand metadata). */
export interface Card {
  id: string; // e.g. 'knight' | 'archers' | 'fireball'
  name: string; // display name, e.g. 'Knight'
  type: CardType;
  elixirCost: number; // 1-10
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  /** Stub stat block — Phase 2 fills real HP/damage/radius/speed per card. */
  damage?: number;
  hitPoints?: number;
  range?: number;
  radius?: number;
  count?: number; // troops spawned on play
  durationMs?: number; // spells / buildings
}

/** A tower entity on the arena. */
export interface Tower {
  id: string; // e.g. 'blue-king', 'red-princess-left'
  kind: TowerKind;
  owner: PlayerSide;
  hitPoints: number;
  maxHitPoints: number;
  position: Vec2;
  destroyed: boolean;
}

/** A deployed unit (troop) instance — server-authoritative in Phase 3+. */
export interface Unit {
  id: string; // server-assigned instance id
  cardId: string; // links to Card.id
  owner: PlayerSide;
  hitPoints: number;
  maxHitPoints: number;
  position: Vec2;
  targetId?: string; // tower or unit id being attacked
}

/** Authoritative snapshot broadcast at 10-20Hz (Phase 3 tick). */
export interface GameState {
  matchId: string;
  tick: number; // monotonically increasing server tick
  serverTimeMs: number; // server clock for interpolation
  elixir: Record<PlayerSide, number>; // 0-10, regen in Phase 3
  towers: Tower[];
  units: Unit[];
  crowns: Record<PlayerSide, number>;
  winner?: PlayerSide | 'draw';
  endsAtMs?: number; // overtime / timer end
}

/**
 * Socket.io event map (client<->server). Payloads are stubs — Phase 2 protocol
 * section is normative; Phase 3 server validates every client event (anti-cheat).
 */
export interface SocketEvents {
  // --- client -> server ---
  'match:join': { matchId: string; playerId: string; deck: string[] };
  'match:leave': { matchId: string; playerId: string };
  'card:play': { matchId: string; playerId: string; cardId: string; at: Vec2; handIndex: number };
  'emote:send': { matchId: string; playerId: string; emoteId: string }; // reserved, Phase 5
  // --- server -> client ---
  'match:found': { matchId: string; opponentId: string };
  'match:start': { matchId: string; state: GameState };
  'state:update': GameState;
  'match:end': { matchId: string; winner: PlayerSide | 'draw'; crowns: Record<PlayerSide, number> };
  'error:game': { code: string; message: string };
}
