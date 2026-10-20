/**
 * @cr/shared — shared types/protocol between frontend and backend.
 * Phase 1 STUB — shape locked loosely; full numbers + events spec'd in Phase 2 (docs/GAME_DESIGN.md)
 * and enforced by authoritative server in Phase 3. Keep backward-compatible additions only.
 */

/** Card archetype. Phase 2 will enumerate the real card list. */
export type CardType = 'troop' | 'spell' | 'building' | 'tower';

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
  /** True when this snapshot's HP loss is only building lifetime wear-down. */
  decayOnly?: boolean;
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
  cardLevels?: Record<PlayerSide, Record<string, number>>;
  towerTroopId?: Record<PlayerSide, string | undefined>;
  statVersion?: number;
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

// --- Phase 2 additions (GAME_DESIGN.md normative; additive only — nothing above renamed/removed) ---

/** Normative per-card stat block (fills Phase-1 stub optionals; all new keys optional at use site). */
export interface CardStats {
  hitPoints: number;
  damage: number;
  dps?: number; // damage / hitSpeed convenience
  range: number; // tiles; melee ≈ 0.8-1.2
  sightRange: number; // aggro distance
  moveSpeed: number; // tiles/sec
  hitSpeed: number; // sec per attack
  elixirCost?: number;
  radius?: number; // splash / spawn radius
  count?: number; // troops spawned
  durationMs?: number; // spells/buildings (Cannon lifetime 30s lives here)
  targets?: 'ground' | 'air+ground' | 'buildings';
  stunMs?: number; // Zap 0.5s lives here
  deathBurst?: number; // Rock Golem 280 lives here
}

/** Complete database-resolved stat row for one card level. */
export interface CardLevelStats extends CardStats {
  cardId: string;
  level: number;
  mode: string;
  statVersion: number;
  hitPoints: number;
  damage: number;
  dps: number;
  hitSpeedMs: number;
  moveSpeed: number;
  towerDamage?: number;
  deathBurst?: number;
  deathBurstRadius?: number;
  flying?: boolean;
  attackPattern?: string;
  source?: string;
  approximation?: boolean;
}

/** Immutable level selection carried into a match snapshot. */
export interface ResolvedCardStats {
  cardId: string;
  level: number;
  mode: string;
  statVersion: number;
  stats: CardLevelStats;
}

/** Card with optional normative stats — old `Card` imports still compile. */
export interface CardWithStats extends Card {
  stats?: CardStats;
  elixirCost: number; // re-declared, still 1-10
  arena?: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Canonical `card:play` deploy intent (handIndex authoritative; cardId/at back-compat). */
export interface DeployRequest {
  matchId: string;
  playerId: string;
  handIndex: number; // 0..3
  x: number; // [0,18]
  y: number; // [0,32]
  cardId?: string; // back-compat echo of Card.id
  at?: Vec2; // back-compat alias for {x,y}
  clientTick?: number; // for server reconciliation / stale rejection
}

/** Canonical `state:update` snapshot (goal shorthand resolved: tick/entities/elixir). */
export interface ServerTick extends GameState {
  // tick     -> GameState.tick
  // entities -> GameState.towers + GameState.units
  // elixir   -> GameState.elixir
}
export type EntitiesSnapshot = Pick<GameState, 'towers' | 'units'>;

/** Refined card:play payload (intersection keeps legacy shape assignable). */
export type CardPlayPayload = DeployRequest & { cardId?: string; at?: Vec2 };

/** Socket map extension — every key in SocketEvents is kept (Omit avoids conflicting overrides). */
export interface SocketEventsV2 extends Omit<SocketEvents, 'card:play' | 'state:update'> {
  // client -> server (new canonical)
  'queue:join': { playerId: string; deck: string[]; levels?: Record<string, number>; towerTroopId?: string };
  'queue:leave': { playerId: string };
  'deck:select': { playerId: string; deck: string[]; levels?: Record<string, number>; towerTroopId?: string };
  // server -> client (new canonical)
  'queue:matched': { matchId: string; opponentId: string; side: PlayerSide; serverTimeMs: number };
  'error': { code: string; message: string; matchId?: string };
  // refined payloads
  'card:play': CardPlayPayload;
  'state:update': ServerTick;
}

/** Synchronous ack for client→server intents (async failures use error/error:game twins). */
export interface Ack {
  ok: boolean;
  position?: number;
  error?: { code: string; message: string };
}
