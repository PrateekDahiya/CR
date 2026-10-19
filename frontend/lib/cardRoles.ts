/**
 * frontend/lib/cardRoles.ts — centralized card classification (Phase 14).
 *
 * Strategic roles live here, deliberately separated from structural types.
 * `CardInfo.type` stays the structural kind (`troop | spell | building | tower`);
 * `tags` describe how a card is used, because one card fills several roles
 * (Golem is `tank` + `win_condition`; Baby Dragon is `ranged` + `splash`).
 *
 * Classification is an explicit, reviewable mapping keyed by canonical card id
 * (never by display name), so a missing entry is a loud dev error rather than a
 * silently mis-tagged deck. `validateCardRoles()` enforces that.
 *
 * Mandatory deck roles (see `deckValidation.ts`):
 *   building | big_spell | small_spell | tank | ranged | splash | win_condition
 *
 * Rules encoded in the validators below:
 *   - `splash` is satisfied by a damage-dealing troop or attacking building.
 *     An area spell carries `splash_spell` instead and cannot fill `splash`.
 *   - `tank` is a genuinely durable frontline unit. `mini_tank` never satisfies
 *     the mandatory tank slot.
 *   - `ranged` means "attacks from a distance" and is independent of
 *     `anti_air`, which means "can target flying units".
 *   - Expensive is not the same as a tank, and being able to hit a tower is not
 *     the same as being a win condition.
 */

/** The seven roles every generated deck must cover. */
export const MANDATORY_ROLES = [
  "building",
  "big_spell",
  "small_spell",
  "tank",
  "ranged",
  "splash",
  "win_condition",
] as const;

export type MandatoryRole = (typeof MANDATORY_ROLES)[number];

/**
 * The role vocabulary and the canonical per-card mapping live in
 * `shared/card-roles.json` so the frontend (player Random Deck button) and the
 * backend (AI deck generation) obey one table. It is generated from the
 * ROLE_MAP block below by `python scripts/generate_role_table.py`.
 */
import ROLE_TABLE from "../../shared/card-roles.json";

/** Authored role vocabulary; exported to JSON by `scripts/generate_role_table.py`. */
const AUTHORED_CARD_ROLES = [
  // --- mandatory deck roles ---
  "building",
  "big_spell",
  "small_spell",
  "tank",
  "ranged",
  "splash",
  "win_condition",
  // --- combat and defence ---
  "mini_tank",
  "anti_air",
  "tank_killer",
  "high_single_target_dps",
  "swarm",
  "swarm_counter",
  "defensive",
  "offensive_support",
  "defensive_support",
  "counter_push",
  "splash_spell",
  // --- gameplay and strategy ---
  "cycle",
  "support",
  "bait",
  "control",
  "reset",
  "siege",
  "bridge_spam",
  "utility",
  "pressure",
  "air_unit",
  "ground_unit",
  "spell",
] as const;

export const CARD_ROLES = ROLE_TABLE.roles as readonly string[];

export type CardRole = (typeof ROLE_TABLE.roles)[number];

const ROLE_SET: ReadonlySet<string> = new Set(ROLE_TABLE.roles);

/** Runtime table (shared JSON). `AUTHORED_ROLE_MAP` below is the edit surface. */
const ROLE_MAP: Record<string, readonly CardRole[]> = ROLE_TABLE.cardRoles as Record<
  string,
  readonly CardRole[]
>;
/**
 * Canonical role mapping for the whole catalog, keyed by canonical card id.
 *
 * EDIT `AUTHORED_CARD_ROLES` and `AUTHORED_ROLE_MAP` below, then run
 * `python scripts/generate_role_table.py` to refresh `shared/card-roles.json`
 * (imported by the frontend here and by the backend for AI deck generation).
 *
 * Anything absent here fails `validateCardRoles()` — a new card must be
 * classified before it can enter a generated deck. Tower troops are excluded
 * on purpose: they are selected outside the hand and never occupy a deck slot.
 */
const AUTHORED_ROLE_MAP: Record<string, readonly CardRole[]> = {
  // ---------------- COMMON ----------------
  archers: ["ranged", "anti_air", "swarm", "cycle", "support", "ground_unit"],
  "barbarian-hut": ["building", "defensive_support", "swarm", "ground_unit"],
  barbarians: ["mini_tank", "swarm", "swarm_counter", "cycle", "ground_unit"],
  bats: ["mini_tank", "swarm", "anti_air", "air_unit", "cycle"],
  bomber: ["ranged", "splash", "swarm_counter", "ground_unit"],
  goblins: ["mini_tank", "swarm", "cycle", "ground_unit"],
  "ice-spirit": ["cycle", "support", "ground_unit", "utility", "reset"],
  knight: ["mini_tank", "defensive", "ground_unit", "cycle"],
  "minion-horde": ["swarm", "air_unit", "anti_air"],
  minions: ["swarm", "air_unit", "anti_air"],
  "royal-recruits": ["swarm", "defensive_support", "ground_unit"],
  skeletons: ["swarm", "cycle", "ground_unit"],
  "skeleton-barrel": ["win_condition", "siege", "bait", "ground_unit", "utility"],
  "spear-goblins": ["ranged", "anti_air", "swarm", "ground_unit"],

  arrows: ["small_spell", "spell", "swarm_counter", "air_unit", "utility"],
  "giant-snowball": ["small_spell", "spell", "splash_spell", "control", "air_unit"],
  "the-log": ["small_spell", "spell", "control", "ground_unit", "utility"],
  zap: ["small_spell", "spell", "reset", "utility"],
  rage: ["small_spell", "spell", "support", "control"],

  cannon: ["building", "defensive", "ground_unit"],
  "fire-spirit": ["cycle", "splash", "swarm_counter", "ground_unit"],
  "goblin-cage": ["building", "defensive_support", "ground_unit"],
  "goblin-hut": ["building", "defensive_support", "swarm", "ground_unit"],
  tombstone: ["building", "defensive_support", "swarm", "ground_unit"],
  "barbarian-barrel": ["small_spell", "spell", "bait", "ground_unit"],
  "goblin-curse": ["small_spell", "spell", "splash_spell", "control"],

  // ---------------- RARE ----------------
  "dart-goblin": ["ranged", "anti_air", "ground_unit", "high_single_target_dps"],
  "elite-barbarians": ["mini_tank", "swarm_counter", "high_single_target_dps", "ground_unit"],
  firecracker: ["swarm", "splash", "anti_air", "air_unit"],
  fisherman: ["ranged", "control", "ground_unit", "utility"],
  "goblin-drill": ["building", "win_condition", "siege", "pressure", "ground_unit"],
  "ice-golem": ["tank", "defensive", "control", "ground_unit"],
  "mini-pekka": ["tank_killer", "high_single_target_dps", "defensive", "ground_unit"],
  "skeleton-army": ["swarm", "cycle", "ground_unit"],
  witch: ["ranged", "splash", "swarm_counter", "support", "ground_unit"],
  zappies: ["ranged", "anti_air", "reset", "ground_unit", "support"],
  "elixir-collector": ["building", "defensive_support", "utility", "ground_unit"],
  furnace: ["building", "defensive_support", "splash", "ground_unit"],
  mortar: ["building", "siege", "splash", "win_condition", "pressure", "ground_unit"],
  tesla: ["building", "defensive", "anti_air", "ground_unit"],
  clone: ["spell", "utility", "counter_push", "support"],
  freeze: ["spell", "control", "reset", "utility"],

  // ---------------- EPIC ----------------
  "baby-dragon": ["ranged", "splash", "anti_air", "air_unit", "support"],
  balloon: ["win_condition", "air_unit", "siege", "pressure"],
  bowler: ["ranged", "splash", "anti_air", "counter_push", "ground_unit"],
  "dark-prince": ["tank", "splash", "mini_tank", "defensive", "ground_unit"],
  "electro-dragon": ["ranged", "splash", "anti_air", "air_unit", "swarm_counter"],
  executioner: ["ranged", "high_single_target_dps", "anti_air", "ground_unit"],
  "giant-skeleton": ["tank", "defensive", "ground_unit"],
  "goblin-giant": ["tank", "win_condition", "support", "ground_unit"],
  golem: ["tank", "win_condition", "defensive", "ground_unit"],
  guards: ["mini_tank", "defensive", "swarm", "ground_unit"],
  pekka: ["tank_killer", "high_single_target_dps", "ground_unit"],
  prince: ["mini_tank", "defensive", "counter_push", "ground_unit"],
  "royal-giant": ["tank", "win_condition", "ranged", "pressure", "ground_unit"],
  "royal-hogs": ["win_condition", "swarm", "pressure", "ground_unit"],
  valkyrie: ["splash", "anti_air", "swarm_counter", "mini_tank", "ground_unit"],
  wizard: ["ranged", "splash", "anti_air", "swarm_counter", "ground_unit"],

  earthquake: ["spell", "splash_spell", "control"],
  "goblin-barrel": ["spell", "bait", "utility"],
  poison: ["big_spell", "spell", "splash_spell", "control"],
  "royal-delivery": ["spell", "utility", "pressure"],

  // ---------------- LEGENDARY ----------------
  bandit: ["high_single_target_dps", "tank_killer", "mini_tank", "ground_unit"],
  "electro-wizard": ["ranged", "anti_air", "reset", "splash", "ground_unit"],
  "flying-machine": ["ranged", "anti_air", "air_unit"],
  "inferno-dragon": ["ranged", "high_single_target_dps", "anti_air", "air_unit"],
  "lumberjack": ["mini_tank", "swarm_counter", "ground_unit"],
  "magic-archer": ["ranged", "high_single_target_dps", "anti_air", "ground_unit"],
  "mega-knight": ["tank", "splash", "tank_killer", "defensive", "ground_unit"],
  "mother-witch": ["ranged", "splash", "support", "air_unit"],
  "night-witch": ["swarm_counter", "support", "anti_air", "ground_unit"],
  phoenix: ["mini_tank", "anti_air", "air_unit"],
  "ram-rider": ["tank", "win_condition", "defensive", "ground_unit"],
  "royal-ghost": ["splash", "anti_air", "mini_tank", "ground_unit"],
  sparky: ["ranged", "splash", "high_single_target_dps", "anti_air", "ground_unit"],

  // ---------------- CHAMPIONS ----------------
  "archer-queen": ["ranged", "anti_air", "air_unit"],
  goblinstein: ["ranged", "splash", "anti_air"],
  "golden-knight": ["tank_killer", "high_single_target_dps", "mini_tank", "ground_unit"],
  "little-prince": ["ranged", "anti_air", "ground_unit"],
  "mighty-miner": ["high_single_target_dps", "tank_killer", "ground_unit"],
  monk: ["splash", "tank_killer", "anti_air", "ground_unit"],
  "skeleton-king": ["tank", "win_condition", "ground_unit"],

  // ---------------- BIG SPELLS ----------------
  fireball: ["big_spell", "spell", "splash_spell", "utility"],
  graveyard: ["big_spell", "spell", "splash_spell", "win_condition"],
  lightning: ["big_spell", "spell", "utility"],
  rocket: ["big_spell", "spell", "splash_spell", "utility"],
  tornado: ["big_spell", "spell", "splash_spell", "control", "air_unit"],
  void: ["big_spell", "spell", "splash_spell", "utility"],

  // ---------------- RARE TROOPS / BUILDINGS ----------------
  giant: ["tank", "win_condition", "defensive", "pressure", "ground_unit"],
  "hog-rider": ["win_condition", "pressure", "ground_unit", "bait"],
  "ice-wizard": ["ranged", "splash", "anti_air", "control", "air_unit"],
  "elixir-golem": ["tank", "defensive", "ground_unit"],
  "goblin-gang": ["swarm", "cycle", "ground_unit"],
  "battle-ram": ["win_condition", "siege", "bait", "ground_unit"],
  "bomb-tower": ["building", "defensive", "splash", "ground_unit"],
  "inferno-tower": ["building", "defensive", "anti_air", "high_single_target_dps"],
  "goblin-demolisher": ["ranged", "splash", "anti_air", "swarm_counter", "ground_unit"],
  "x-bow": ["building", "siege", "win_condition", "pressure", "splash"],
  "lava-hound": ["tank", "win_condition", "air_unit", "defensive"],
  "boss-bandit": ["tank_killer", "high_single_target_dps", "mini_tank", "ground_unit"],
  miner: ["win_condition", "high_single_target_dps", "siege", "ground_unit"],
  musketeer: ["ranged", "anti_air", "high_single_target_dps", "defensive", "ground_unit"],
  princess: ["ranged", "splash", "anti_air", "high_single_target_dps", "air_unit"],
  rascals: ["mini_tank", "ranged", "swarm", "splash", "ground_unit"],
};

/** Tags for a card id, or an empty list when the card is unknown. */
export function cardRoles(id: string): readonly CardRole[] {
  return ROLE_MAP[id] ?? [];
}

export function hasRole(id: string, role: CardRole): boolean {
  const tags = ROLE_MAP[id];
  return tags !== undefined && tags.includes(role);
}

/**
 * Structural "kind" helper used by the validators. Tower troops are never
 * playable deck cards.
 */
export type PlayableKind = "troop" | "spell" | "building";

export function isPlayableKind(type: string): type is PlayableKind {
  return type === "troop" || type === "spell" || type === "building";
}

/**
 * The mandatory `splash` role must be filled by a damage-dealing troop or an
 * attacking building. An area spell carries `splash_spell` and does not count.
 */
export function providesSplash(id: string, type: string): boolean {
  if (type === "spell") return false;
  return hasRole(id, "splash");
}

/** The mandatory `tank` role is a real frontline tank, never a `mini_tank`. */
export function providesTank(id: string): boolean {
  return hasRole(id, "tank");
}

export function providesRanged(id: string, type: string): boolean {
  if (type === "spell") return false;
  return hasRole(id, "ranged");
}

export function providesBuilding(id: string, type: string): boolean {
  return type === "building" || hasRole(id, "building");
}

export function providesWinCondition(id: string): boolean {
  return hasRole(id, "win_condition");
}

export function providesBigSpell(id: string, type: string): boolean {
  return type === "spell" && hasRole(id, "big_spell");
}

export function providesSmallSpell(id: string, type: string): boolean {
  return type === "spell" && hasRole(id, "small_spell");
}

export interface RoleAuditIssue {
  cardId: string;
  code: "missing" | "unknown_tag" | "unknown_card" | "empty";
  detail: string;
}

/**
 * Validate classification coverage against the real catalog.
 *
 * Surfaces (never swallows) missing classifications, invalid tag names,
 * unknown card ids and inconsistent metadata.
 */
export function validateCardRoles(
  catalog: ReadonlyArray<{ id: string; type: string }>,
): RoleAuditIssue[] {
  const issues: RoleAuditIssue[] = [];
  const known = new Set(catalog.map((card) => card.id));

  for (const [id, tags] of Object.entries(ROLE_MAP)) {
    if (!known.has(id)) {
      issues.push({
        cardId: id,
        code: "unknown_card",
        detail: `role mapping references "${id}", which is not in the catalog`,
      });
      continue;
    }
    if (tags.length === 0) {
      issues.push({ cardId: id, code: "empty", detail: `"${id}" has an empty role list` });
    }
    for (const tag of tags) {
      if (!ROLE_SET.has(tag)) {
        issues.push({
          cardId: id,
          code: "unknown_tag",
          detail: `"${id}" has tag "${tag}", which is not a known role`,
        });
      }
    }
  }

  for (const card of catalog) {
    if (!isPlayableKind(card.type)) continue; // tower troops are selected separately
    if (ROLE_MAP[card.id] === undefined) {
      issues.push({
        cardId: card.id,
        code: "missing",
        detail: `playable card "${card.id}" has no role classification`,
      });
    }
  }
  return issues;
}

export function classifiedCardIds(): string[] {
  return Object.keys(ROLE_MAP).sort();
}