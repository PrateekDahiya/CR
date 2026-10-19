/**
 * Runtime shape for mechanics loaded from the card database.
 *
 * This file deliberately contains no card ids, card names, or mechanic
 * mappings. The database owns those records; TypeScript only validates the
 * shape consumed by the authoritative engine.
 */

export type AttackPattern =
  | "single"
  | "splash"
  | "pierce"
  | "chain"
  | "shotgun"
  | "beam"
  | "suicide"
  | "none";

export type EffectKind =
  | "damage"
  | "areaDamage"
  | "status"
  | "knockback"
  | "heal"
  | "spawn"
  | "split"
  | "clone"
  | "teleport"
  | "dash"
  | "ramp"
  | "pierce"
  | "chain"
  | "levelUp"
  | "elixir";

export interface EffectSpec {
  kind: EffectKind;
  target?: "enemy" | "friendly" | "ground" | "air" | "building" | "tower" | "all";
  amount?: number;
  radius?: number;
  durationMs?: number;
  intervalMs?: number;
  count?: number;
  childId?: string;
  multiplier?: number;
  maxTargets?: number;
  [key: string]: unknown;
}

export interface CardMechanicSpec {
  attack?: AttackPattern;
  targeting?: "ground" | "air+ground" | "buildings" | "all" | "friendly" | "enemy" | "none";
  movement?: "ground" | "flying" | "burrow" | "siege";
  onDeploy?: EffectSpec[];
  onAttack?: EffectSpec[];
  onHit?: EffectSpec[];
  onDeath?: EffectSpec[];
  periodic?: EffectSpec[];
  ability?: EffectSpec[];
  towerTroop?: boolean;
  version: number;
}

function effectList(value: unknown): EffectSpec[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is EffectSpec => {
    return typeof item === "object" && item !== null && typeof (item as { kind?: unknown }).kind === "string";
  });
}

/** Parse and validate one JSON row returned by MySQL. */
export function parseCardMechanicSpec(row: Record<string, unknown>): CardMechanicSpec {
  const attack = row.attack_pattern;
  const targeting = row.targeting;
  const movement = row.movement;
  const parsed = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  };
  return {
    version: Number(row.version ?? 1),
    ...(typeof attack === "string" ? { attack: attack as AttackPattern } : {}),
    targeting: typeof targeting === "string" ? targeting as CardMechanicSpec["targeting"] : "all",
    ...(typeof movement === "string" ? { movement: movement as CardMechanicSpec["movement"] } : {}),
    onDeploy: effectList(parsed(row.on_deploy)),
    onAttack: effectList(parsed(row.on_attack)),
    onHit: effectList(parsed(row.on_hit)),
    onDeath: effectList(parsed(row.on_death)),
    periodic: effectList(parsed(row.periodic)),
    ability: effectList(parsed(row.ability)),
    ...(row.tower_troop === true || row.tower_troop === 1 || row.tower_troop === "1"
      ? { towerTroop: true }
      : {}),
  };
}
