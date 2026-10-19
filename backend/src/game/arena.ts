/**
 * backend/src/game/arena.ts — arena geometry + towers (GAME_DESIGN.md §§5–6).
 *
 * Pure TS: no socket/redis/node imports. Deterministic — constants + math.
 *
 * Grid: 18 cols (x 0–17) × 32 rows (y 0–31), 1 tile = 1 unit.
 * Origin (0,0) top-left = Blue (P1). Center (9.0, 16).
 */

export const ARENA_W = 18;
export const ARENA_H = 32;
export const ARENA_MAX_X = 18; // deploy bounds are continuous [0,18]x[0,32]
export const ARENA_MAX_Y = 32;

/** River band rows y = 15–16 inclusive (2 tiles tall, full width). §5.2 */
export const RIVER_Y0 = 15;
export const RIVER_Y1_EXCLUSIVE = 17; // y in [15,17) is river

/** Bridges (2 tiles wide each). §5.2 */
export const BRIDGE_LEFT = { x0: 3, x1: 4, centerX: 3.5 } as const;
export const BRIDGE_RIGHT = { x0: 14, x1: 15, centerX: 14.5 } as const;
export const LANE_LEFT_X = 3.5;
export const LANE_RIGHT_X = 14.5;
export const CENTER_X = 9;

/** Deploy rows. §5.3 */
export const BLUE_DEPLOY_MAX_Y = 14; // Blue normal: y 0–14
export const RED_DEPLOY_MIN_Y = 17; // Red normal: y 17–31
/** Pocket extension after taking an enemy princess: 4 tiles. §5.3 */
export const POCKET_DEPTH = 4;
export const BLUE_POCKET_MAX_Y = 20; // Blue pocket: y 17–20 (taken side)
export const RED_POCKET_MIN_Y = 11; // Red pocket: y 11–14 (taken side)

/** Towers — §6.1. Princess 1400 HP / 112.5 DPS, King 2400 HP / 100 DPS. */
export const PRINCESS_HP = 1400;
export const PRINCESS_DAMAGE = 90;
export const PRINCESS_HIT_SPEED = 0.8;
export const PRINCESS_RANGE = 7.5;

export const KING_HP = 2400;
export const KING_DAMAGE = 100;
export const KING_HIT_SPEED = 1.0;
export const KING_RANGE = 7.0;

export type TowerKind = "king" | "princess";
export type PlayerSide = "blue" | "red";

export interface TowerSpawn {
  id: string;
  kind: TowerKind;
  owner: PlayerSide;
  x: number;
  y: number;
}

/** Tower positions (tile centers). §5.4 */
export const TOWER_SPAWNS: TowerSpawn[] = [
  { id: "blue-king", kind: "king", owner: "blue", x: 9, y: 3.5 },
  { id: "blue-princess-left", kind: "princess", owner: "blue", x: 3.5, y: 6.5 },
  { id: "blue-princess-right", kind: "princess", owner: "blue", x: 14.5, y: 6.5 },
  { id: "red-king", kind: "king", owner: "red", x: 9, y: 27.5 },
  { id: "red-princess-left", kind: "princess", owner: "red", x: 3.5, y: 24.5 },
  { id: "red-princess-right", kind: "princess", owner: "red", x: 14.5, y: 24.5 },
];

/** Pocket state: which enemy princess towers the deployer has destroyed. */
export interface Pocket {
  leftTaken: boolean; // enemy princess on x<9 side destroyed
  rightTaken: boolean; // enemy princess on x>=9 side destroyed
}

export const NO_POCKET: Pocket = { leftTaken: false, rightTaken: false };

export function isOnRiver(y: number): boolean {
  return y >= RIVER_Y0 && y < RIVER_Y1_EXCLUSIVE;
}

export function isOnBridge(x: number, y: number): boolean {
  if (!isOnRiver(y)) return false;
  const inLeft = x >= BRIDGE_LEFT.x0 && x < BRIDGE_LEFT.x1 + 1;
  const inRight = x >= BRIDGE_RIGHT.x0 && x < BRIDGE_RIGHT.x1 + 1;
  return inLeft || inRight;
}

/** Nearest bridge lane center for a given x (troop pathing). */
export function nearestBridgeX(x: number): number {
  return Math.abs(x - LANE_LEFT_X) <= Math.abs(x - LANE_RIGHT_X)
    ? LANE_LEFT_X
    : LANE_RIGHT_X;
}

export function isInArena(x: number, y: number): boolean {
  return x >= 0 && x <= ARENA_MAX_X && y >= 0 && y <= ARENA_MAX_Y;
}

/**
 * Troop/building deploy legality (§5.3 + §11.2).
 * - Own half only: Blue y 0–14, Red y 17–31.
 * - Pocket: +4 tiles into enemy half on the taken lane side
 *   (Blue y ≤ 20, Red y ≥ 11; side split at x = 9).
 * - Never river (y 15–16), never outside arena.
 * - Spells are NOT checked here — they may target anywhere in arena.
 * - Tower-footprint exclusion is checked in engine (needs live towers).
 */
export function isInDeployZone(
  side: PlayerSide,
  x: number,
  y: number,
  pocket: Pocket = NO_POCKET,
): boolean {
  if (!isInArena(x, y)) return false;
  if (isOnRiver(y)) return false;

  const leftSide = x < 9;
  const pocketOpen = leftSide ? pocket.leftTaken : pocket.rightTaken;

  if (side === "blue") {
    if (y <= BLUE_DEPLOY_MAX_Y) return true;
    if (pocketOpen && y <= BLUE_POCKET_MAX_Y) return true;
    return false;
  }
  // red
  if (y >= RED_DEPLOY_MIN_Y) return true;
  if (pocketOpen && y >= RED_POCKET_MIN_Y) return true;
  return false;
}

/**
 * 1×1 tower footprint exclusion (§5.3): no deploys within 0.5 tiles of a
 * standing tower center (Chebyshev 1×1 tile).
 */
export function isOnTowerFootprint(
  x: number,
  y: number,
  towers: Array<{ x: number; y: number; destroyed: boolean }>,
): boolean {
  for (const t of towers) {
    if (t.destroyed) continue;
    if (Math.abs(x - t.x) <= 0.5 && Math.abs(y - t.y) <= 0.5) return true;
  }
  return false;
}

export function towerStatsFor(kind: TowerKind): {
  hp: number;
  damage: number;
  hitSpeed: number;
  range: number;
} {
  return kind === "king"
    ? {
        hp: KING_HP,
        damage: KING_DAMAGE,
        hitSpeed: KING_HIT_SPEED,
        range: KING_RANGE,
      }
    : {
        hp: PRINCESS_HP,
        damage: PRINCESS_DAMAGE,
        hitSpeed: PRINCESS_HIT_SPEED,
        range: PRINCESS_RANGE,
      };
}
