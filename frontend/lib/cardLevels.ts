"use client";

import { getCardLevels, type CardLevelStats } from "./api";

export interface OverlayLevelStats {
  level: number;
  hitPoints: number;
  damage: number;
  dps: number;
  hitSpeedSec: number;
  speedLabel: string;
  rangeTiles: number;
  targets: string;
  unitCount: number;
  radiusTiles?: number;
  towerDamage?: number;
}

const cache = new Map<string, CardLevelStats[]>();

/** Fetch and cache all 16 level rows for a card. O(1) after first load. */
export async function loadCardLevels(cardId: string, baseUrl?: string): Promise<CardLevelStats[]> {
  const hit = cache.get(cardId);
  if (hit !== undefined) return hit;
  const res = await getCardLevels(cardId, "ladder", 1, baseUrl);
  cache.set(cardId, res.levels);
  return res.levels;
}

function speedLabel(speed: number): string {
  if (speed <= 0) return "static";
  if (speed >= 1.3) return "very fast";
  if (speed >= 1.1) return "fast";
  if (speed >= 0.8) return "medium";
  return "slow";
}

/** Convert the resolved database row into the overlay's display shape. */
export function overlayStatsFor(levels: readonly CardLevelStats[], level: number): OverlayLevelStats | undefined {
  if (levels.length === 0) return undefined;
  const row = levels[Math.max(0, Math.min(levels.length - 1, level - 1))];
  if (row === undefined) return undefined;
  return {
    level: row.level,
    hitPoints: row.hitPoints,
    damage: row.damage,
    dps: Math.round(row.dps * 10) / 10,
    hitSpeedSec: Math.round((row.hitSpeedMs / 1000) * 100) / 100,
    speedLabel: speedLabel(row.moveSpeed),
    rangeTiles: row.range,
    targets: row.targets,
    unitCount: row.count,
    ...(row.radius > 0 ? { radiusTiles: row.radius } : {}),
    ...(row.towerDamage !== undefined && row.towerDamage > 0 ? { towerDamage: row.towerDamage } : {}),
  };
}

/** Clear the cache (used after a balance/stat-version change). */
export function clearCardLevelCache(): void {
  cache.clear();
}
