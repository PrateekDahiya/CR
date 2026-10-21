/**
 * frontend/lib/cardAliases.ts — child/spawned-unit identity + glyph fallback.
 *
 * Spawned children come from `infra/mysql/spawn_templates.json` and use
 * SINGULAR ids (`barbarian`, `skeleton`, `spear-goblin`), while the playable
 * catalog and the downloaded art use the deck-card ids (`barbarians`,
 * `skeletons`, `spear-goblins`). Without this mapping a Barbarian Hut spawned a
 * perfectly good Barbarian that rendered as "??" because
 * `/cards/barbarian.png` does not exist.
 *
 * Rules:
 *  - `CHILD_CARD_ALIAS` maps a spawned-child id to the catalog card whose art
 *    represents it. Only entries whose art actually exists are listed.
 *  - `unitGlyph` gives every id a visible glyph so an entity is NEVER drawn as
 *    an unresolved "??". Cards with no art fall back to a kind-appropriate
 *    glyph rather than an unknown marker.
 */

/** Spawned-child id -> playable catalog id (art slug). */
export const CHILD_CARD_ALIAS: Readonly<Record<string, string>> = {
  barbarian: "barbarians",
  skeleton: "skeletons",
  goblin: "goblins",
  "spear-goblin": "spear-goblins",
  bat: "bats",
  "royal-recruit": "royal-recruits",
};

/**
 * Cards whose database mechanics declare `movement: "siege"`.
 *
 * Siege buildings may be placed forward on the enemy half (mirrors the server
 * rule in `engine.ts`). Kept here so the client can mirror it without loading
 * the mechanics table; `tests/phase15.spec.ts` asserts this matches
 * `infra/mysql/card_mechanics.json` so it cannot drift.
 */
export const SIEGE_CARD_IDS: ReadonlySet<string> = new Set(["mortar", "x-bow"]);

export const siegeCardIds: ReadonlySet<string> = SIEGE_CARD_IDS;

/**
 * Cards whose database mechanics declare `movement: "burrow"`.
 *
 * Burrowers (the Miner, the Goblin Drill) may be dropped anywhere in the
 * arena - they travel underground - so the client must accept the enemy half
 * exactly like the server does (`engine.ts` `isBurrowPlacement`).
 */
export const BURROW_CARD_IDS: ReadonlySet<string> = new Set(["miner", "goblin-drill"]);

export const burrowCardIds: ReadonlySet<string> = BURROW_CARD_IDS;

/**
 * Cards that are tower-troop profiles, never hand cards. They must be excluded
 * from deck building and rejected by the server.
 */
export const TOWER_TROOP_IDS: ReadonlySet<string> = new Set([
  "tower-princess",
  "cannoneer",
  "dagger-duchess",
  "royal-chef",
]);

export function isTowerTroopId(cardId: string): boolean {
  return TOWER_TROOP_IDS.has(cardId);
}

/** Resolve the art slug for any entity id (spawned child or deck card). */
export function resolveCardArtId(cardId: string): string {
  return CHILD_CARD_ALIAS[cardId] ?? cardId;
}

/**
 * Per-id glyphs. Deck cards first, then spawned children that have no art of
 * their own (Golemite, Lava Pup, ...), so every spawned entity is legible.
 */
const GLYPH: Readonly<Record<string, string>> = {
  // --- troops ---
  knight: "⚔️",
  archers: "🏹",
  "archer-queen": "🏹",
  giant: "🗿",
  "royal-giant": "🗿",
  skeletons: "💀",
  "skeleton-army": "💀",
  musketeer: "🔫",
  "baby-dragon": "🐲",
  "mini-pekka": "🔪",
  pekka: "🔪",
  golem: "🪨",
  "mega-knight": "🪨",
  "giant-skeleton": "💀",
  barbarians: "🪓",
  goblins: "🗡️",
  "goblin-giant": "🗡️",
  "elite-barbarians": "🪓",
  "dark-prince": "🛡️",
  "royal-ghost": "👻",
  prince: "🐴",
  guards: "🛡️",
  rascal: "👦",
  monk: "🥋",
  "golden-knight": "🛡️",
  "little-prince": "🎖️",
  "skeleton-king": "💀",
  goblinstein: "👹",
  witch: "🧙‍♀️",
  "mother-witch": "🧙‍♀️",
  "night-witch": "🧛‍♀️",
  valkyrie: "⚒️",
  wizard: "🧙",
  "ice-wizard": "🧊",
  "electro-wizard": "⚡",
  bowler: "🎳",
  executioner: "🪓",
  "magic-archer": "🏹",
  "dart-goblin": "🎯",
  zappies: "🔋",
  sparky: "🔌",
  princess: "👑",
  cannon: "🏯",
  "hog-rider": "🐗",
  miner: "⛏️",
  "mighty-miner": "⛏️",
  "battle-ram": "🐏",
  "ram-rider": "🐏",
  balloon: "🎈",
  "lava-hound": "🐕",
  "inferno-dragon": "☄️",
  "inferno-tower": "🗼",
  "goblin-demolisher": "💣",
  goblinbarrel: "🛢️",
  fisherman: "🎣",
  lumberjack: "🪓",
  bandit: "🥷",
  "boss-bandit": "🥷",
  "royal-hogs": "🐗",
  "royal-recruits": "🛡️",
  phoenix: "🔥",
  "ice-golem": "🧊",
  "elixir-golem": "🧪",
  goblinbarrelspell: "🛢️",

  // --- swarm / spawned children (art aliases live above) ---
  bats: "🦇",
  minions: "👻",
  "minion-horde": "👻",
  "spear-goblins": "🔱",
  "fire-spirit": "🔥",
  "firecracker": "🎆",
  "ice-spirit": "❄️",

  // --- spawned children with no catalog art of their own ---
  barbarian: "🪓",
  skeleton: "💀",
  goblin: "🗡️",
  "spear-goblin": "🔱",
  bat: "🦇",
  "royal-recruit": "🛡️",
  golemite: "🪨",
  "elixir-golemite": "🧪",
  "elixir-blob": "💧",
  "lava-pup": "🐕",
  "cursed-hog": "🐗",
  "goblin-brawler": "👺",
  "goblinstein-monster": "👹",
  guardienne: "🛡️",
  "phoenix-egg": "🥚",
  "rage-field": "🔥",
  "ram-rider-rider": "🏹",
  "rascal-boy": "👦",
  "rascal-girl": "👧",

  // --- buildings ---
  "barbarian-hut": "🛖",
  "goblin-hut": "🛖",
  tombstone: "🪦",
  furnace: "♨️",
  "bomb-tower": "🗼",
  tesla: "⚡",
  mortar: "🥄",
  "x-bow": "🎯",
  "goblin-cage": "🪤",
  "goblin-drill": "🕳️",
  "elixir-collector": "🧪",

  // --- spells ---
  fireball: "🔥",
  arrows: "➶",
  zap: "⚡",
  rocket: "🚀",
  poison: "☠️",
  lightning: "⚡",
  "the-log": "🪵",
  "giant-snowball": "❄️",
  "barbarian-barrel": "🛢️",
  "goblin-barrel": "🛢️",
  "goblin-curse": "🧌",
  graveyard: "⚰️",
  freeze: "🧊",
  earthquake: "🌋",
  tornado: "🌪️",
  void: "🕳️",
  rage: "🔥",
  clone: "👥",
  "royal-delivery": "📦",
};

/** Kind-appropriate glyph when an id has no explicit entry above. */
function genericGlyph(cardId: string): string {
  if (cardId.includes("spell")) return "✨";
  return "⚔️";
}

/**
 * Glyph for any entity id. Never returns the unresolved marker, so a spawned
 * child always renders something recognisable.
 */
export function unitGlyph(cardId: string): string {
  return GLYPH[cardId] ?? genericGlyph(cardId);
}