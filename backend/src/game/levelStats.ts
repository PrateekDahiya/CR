import type { CardDef } from "./cards.js";

export interface LevelStats {
  cardId: string;
  level: number;
  mode: string;
  statVersion: number;
  hitPoints: number;
  damage: number;
  hitSpeedMs: number;
  dps: number;
  moveSpeed: number;
  range: number;
  sightRange: number;
  radius: number;
  count: number;
  durationMs: number;
  deployDelayMs: number;
  towerDamage?: number;
  deathBurst: number;
  deathBurstRadius: number;
  flying: boolean;
  targets: string;
  attackPattern: string;
  source: string;
  approximation: boolean;
}

const cache = new Map<string, LevelStats>();

function key(cardId: string, level: number, mode: string, statVersion: number): string {
  return `${cardId}:${level}:${mode}:${statVersion}`;
}

export function fallbackLevelStats(card: CardDef, level: number, mode = "ladder", statVersion = 1): LevelStats {
  const boundedLevel = Math.max(1, Math.min(16, Math.trunc(level)));
  // Prefer the exact level-11 wiki anchors; deriving from the rounded level-1
  // value accumulates enough drift to miss exact live-game values (e.g. 3053).
  const multiplier = Math.pow(1.1, boundedLevel - 11);
  const hitPoints = Math.round((card.hp11 ?? card.hp) * multiplier);
  const damage = Math.round((card.damage11 ?? card.damage) * multiplier);
  const hitSpeedMs = Math.round(card.hitSpeed * 1000);
  return {
    cardId: card.id,
    level: boundedLevel,
    mode,
    statVersion,
    hitPoints,
    damage,
    hitSpeedMs,
    dps: hitSpeedMs > 0 ? damage / (hitSpeedMs / 1000) : 0,
    moveSpeed: card.speed,
    range: card.range,
    sightRange: card.sightRange,
    radius: card.radius,
    count: card.count,
    durationMs: card.durationMs ?? 0,
    deployDelayMs: Math.round((card.deployDelaySec ?? 0) * 1000),
    ...(card.towerDamage !== undefined ? { towerDamage: Math.round(card.towerDamage * multiplier) } : {}),
    deathBurst: Math.round((card.deathBurst ?? 0) * multiplier),
    deathBurstRadius: card.deathBurstRadius ?? 0,
    flying: card.flying === true,
    targets: card.targets,
    attackPattern: card.mechanics?.attack ?? "single",
    source: "local level-normalization fallback",
    approximation: true,
  };
}

export function hydrateLevelStats(rows: readonly LevelStats[]): number {
  for (const row of rows) cache.set(key(row.cardId, row.level, row.mode, row.statVersion), row);
  return rows.length;
}

export function getLevelStats(card: CardDef, level = 1, mode = "ladder", statVersion = 1): LevelStats {
  return cache.get(key(card.id, level, mode, statVersion)) ?? fallbackLevelStats(card, level, mode, statVersion);
}
