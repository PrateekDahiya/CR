// MySQL content store (Phase 10, MEMORY#22).
// Aiven MySQL `cr` via env ONLY (never commit creds): DB_HOST/DB_USER/DB_PASS/
// DB_NAME/DB_PORT/DB_SSL. mysql2 is OPTIONAL (dynamic require) so tsc/build +
// `npm test` pass without install; memory/local fallback mirrors GAME_DESIGN §1.
// All ops O(1) pool + O(c) roster reads (c=108). Big-O per function (MEMORY#20).

import { CARDS, SPAWN_TEMPLATES, hydrateCardMechanics, hydrateSpawnTemplates, type CardDef } from "./game/cards.js";
import { parseCardMechanicSpec, type CardMechanicSpec } from "./game/cardMechanics.js";
import { fallbackLevelStats, hydrateLevelStats, type LevelStats } from "./game/levelStats.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ContentCard {
  name: string;
  displayName: string;
  cardType: string;
  elixir: number;
  hp: number;
  dps: number;
  speedLabel: string;
  rangeTiles: number;
  targets: string;
  unitCount: number;
  rarity: string;
  mechanics?: CardMechanicSpec;
}

export interface SpriteMeta {
  cardName: string;
  kind: string;
  atlasX: number;
  atlasY: number;
  w: number;
  h: number;
  placeholderEmoji: string;
  artPath: string;
}

export interface CatalogEntry {
  name: string;
  cardType: string;
  elixir: number;
  rarity: string;
  playable: boolean;
  hp: number;
  damage: number;
  dps: number;
  speed: number;
  range: number;
  sightRange: number;
  targets: string;
  count: number;
  radius: number;
  flying: boolean;
  towerDamage?: number;
}

export interface CardMechanicsContent {
  cardId: string;
  mechanics: CardMechanicSpec;
}

export type CardLevelStats = LevelStats;

function spawnTemplateFromRow(row: Record<string, unknown>): CardDef {
  return {
    id: String(row.template_id),
    name: String(row.template_id),
    type: "troop",
    cost: 0,
    rarity: "common",
    hp: Number(row.hp),
    damage: Number(row.damage),
    hitSpeed: Number(row.hit_speed_ms) / 1000,
    dps: Number(row.hit_speed_ms) > 0 ? Number(row.damage) / (Number(row.hit_speed_ms) / 1000) : 0,
    speed: Number(row.speed),
    range: Number(row.range_tiles),
    sightRange: Number(row.sight_range),
    targets: String(row.targets) as CardDef["targets"],
    count: Number(row.unit_count),
    radius: 0,
    flying: Number(row.flying) === 1,
    mechanics: parseCardMechanicSpec(row),
  };
}

function spawnTemplateFromSeed(id: string, value: Record<string, unknown>): CardDef {
  return {
    id,
    name: id,
    type: "troop",
    cost: 0,
    rarity: "common",
    hp: Number(value.hp),
    damage: Number(value.damage),
    hitSpeed: Number(value.hitSpeedMs) / 1000,
    dps: Number(value.hitSpeedMs) > 0 ? Number(value.damage) / (Number(value.hitSpeedMs) / 1000) : 0,
    speed: Number(value.speed),
    range: Number(value.range),
    sightRange: Number(value.sightRange),
    targets: String(value.targets) as CardDef["targets"],
    count: Number(value.count ?? 1),
    radius: 0,
    flying: value.flying === true,
    mechanics: {
      version: Number(value.version ?? 1),
      attack: typeof value.attack === "string" ? value.attack as CardMechanicSpec["attack"] : undefined,
      targeting: String(value.targets) as CardMechanicSpec["targeting"],
      movement: value.flying === true ? "flying" : "ground",
      onDeploy: Array.isArray(value.onDeploy) ? value.onDeploy as CardMechanicSpec["onDeploy"] : [],
      onAttack: Array.isArray(value.onAttack) ? value.onAttack as CardMechanicSpec["onAttack"] : [],
      onHit: Array.isArray(value.onHit) ? value.onHit as CardMechanicSpec["onHit"] : [],
      onDeath: Array.isArray(value.onDeath) ? value.onDeath as CardMechanicSpec["onDeath"] : [],
      periodic: Array.isArray(value.periodic) ? value.periodic as CardMechanicSpec["periodic"] : [],
      ability: [],
    },
  };
}

export interface MenuItem {
  label: string;
  route: string;
  icon: string;
  sortOrder: number;
}

type Pool = { query: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown]>; end: () => Promise<void> };

let pool: Pool | null = null;
let poolTried = false;

function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function getPool(): Pool | null {
  // O(1) cached singleton. Dynamic require keeps mysql2 optional.
  if (poolTried) return pool;
  poolTried = true;
  const host = env("DB_HOST");
  if (!host) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require("mysql2/promise") as { createPool: (o: unknown) => Pool };
    const ssl = env("DB_SSL", "true").toLowerCase() === "true";
    pool = mysql.createPool({
      host,
      user: env("DB_USER"),
      password: env("DB_PASS"),
      database: env("DB_NAME", "cr"),
      port: Number(env("DB_PORT", "27884")) || 27884,
      // Aiven enforces TLS; without a mounted ca.pem we skip chain verification
      // for dev (documented). Prod: mount ca.pem and set DB_SSL_CA path.
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000,
    });
    return pool;
  } catch {
    return null;
  }
}

export function isMysqlConfigured(): boolean {
  // O(1): env presence only, no I/O.
  return env("DB_HOST").length > 0;
}

export async function pingMysql(): Promise<boolean> {
  // O(1): single SELECT 1.
  const p = getPool();
  if (!p) return false;
  try {
    await p.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

function workspaceFile(name: string): string {
  const candidates = [
    resolve(process.cwd(), "infra", "mysql", name),
    resolve(process.cwd(), "..", "infra", "mysql", name),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) throw new Error(`database bootstrap file not found: ${name}`);
  return found;
}

function jsonFile(name: string): Record<string, Record<string, unknown>> {
  return JSON.parse(readFileSync(workspaceFile(name), "utf8")) as Record<string, Record<string, unknown>>;
}

/**
 * Create every MySQL table and seed the complete game content set. This is
 * idempotent and intentionally runs before mechanic hydration on startup.
 */
export async function ensureMysqlDatabase(): Promise<{ tables: boolean; cards: number; mechanics: number; spawns: number; cardStats: number; spawnStats: number }> {
  const p = getPool();
  if (!p) return { tables: false, cards: 0, mechanics: 0, spawns: 0, cardStats: 0, spawnStats: 0 };
  const schema = readFileSync(workspaceFile("schema.sql"), "utf8");
  const executableSchema = schema.replace(/^[ \t]*--[^\r\n]*(?:\r?\n|$)/gm, "");
  for (const statement of executableSchema.split(";")) {
    const sql = statement.trim();
    if (sql.length > 0) await p.query(sql);
  }
  // Upgrade databases created by the earlier Phase 10 schema in place.
  await p.query("ALTER TABLE cards MODIFY card_type ENUM('troop','spell','building','tower') NOT NULL");
  await p.query("ALTER TABLE cards MODIFY rarity ENUM('common','rare','epic','legendary','champion') NOT NULL");
  for (const column of [
    "hp INT NOT NULL DEFAULT 0",
    "damage INT NOT NULL DEFAULT 0",
    "hit_speed_ms INT NOT NULL DEFAULT 0",
    "dps DECIMAL(10,2) NOT NULL DEFAULT 0",
    "speed DECIMAL(8,3) NOT NULL DEFAULT 0",
    "range_tiles DECIMAL(6,2) NOT NULL DEFAULT 0",
    "sight_range DECIMAL(6,2) NOT NULL DEFAULT 0",
    "targets VARCHAR(16) NOT NULL DEFAULT ''",
    "unit_count TINYINT NOT NULL DEFAULT 0",
    "radius_tiles DECIMAL(6,2) NOT NULL DEFAULT 0",
    "flying TINYINT(1) NOT NULL DEFAULT 0",
    "tower_damage DECIMAL(10,2) NULL",
  ]) {
    try {
      await p.query(`ALTER TABLE card_catalog ADD COLUMN ${column}`);
    } catch (error) {
      const dbError = error as { code?: string; errno?: number };
      if (dbError.code !== "ER_DUP_FIELDNAME" && dbError.errno !== 1060) throw error;
    }
  }

  const cardRows = Object.values(CARDS);
  const mechanics = jsonFile("card_mechanics.json");
  const statVersion = 1;
  const mode = "ladder";
  const scale = (value: number, level: number): number => Math.round(value * Math.pow(1.1, level - 1));
  for (const card of cardRows) {
    await p.query(
      "INSERT INTO cards (name,card_type,elixir,hp,dmg_per_hit,hit_speed_ms,dps,speed_ms_per_tile,speed_label,range_tiles,range_kind,targets,unit_count,rarity,damage_vs_troops,damage_vs_towers,radius_tiles,stun_ms,lifetime_ms,deploy_delay_ms,death_burst,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE card_type=VALUES(card_type),elixir=VALUES(elixir),hp=VALUES(hp),dmg_per_hit=VALUES(dmg_per_hit),hit_speed_ms=VALUES(hit_speed_ms),dps=VALUES(dps),speed_ms_per_tile=VALUES(speed_ms_per_tile),range_tiles=VALUES(range_tiles),targets=VALUES(targets),unit_count=VALUES(unit_count),rarity=VALUES(rarity),damage_vs_troops=VALUES(damage_vs_troops),damage_vs_towers=VALUES(damage_vs_towers),radius_tiles=VALUES(radius_tiles),stun_ms=VALUES(stun_ms),lifetime_ms=VALUES(lifetime_ms),death_burst=VALUES(death_burst)",
      [card.id, card.type, card.cost, card.hp, card.damage, Math.round(card.hitSpeed * 1000), card.dps, Math.round(card.speed * 1000), card.speed === 0 ? "static" : "", card.range, card.range <= 1.2 ? "melee" : "ranged", card.targets, card.count, card.rarity, card.damage, card.towerDamage ?? 0, card.radius, Math.round((card.stunSec ?? 0) * 1000), card.durationMs ?? 0, Math.round((card.deployDelaySec ?? 0) * 1000), card.deathBurst ?? 0, "database catalog"],
    );
    await p.query(
      "INSERT INTO card_catalog (name,card_type,elixir,rarity,playable,note,hp,damage,hit_speed_ms,dps,speed,range_tiles,sight_range,targets,unit_count,radius_tiles,flying,tower_damage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE card_type=VALUES(card_type),elixir=VALUES(elixir),rarity=VALUES(rarity),playable=VALUES(playable),hp=VALUES(hp),damage=VALUES(damage),hit_speed_ms=VALUES(hit_speed_ms),dps=VALUES(dps),speed=VALUES(speed),range_tiles=VALUES(range_tiles),sight_range=VALUES(sight_range),targets=VALUES(targets),unit_count=VALUES(unit_count),radius_tiles=VALUES(radius_tiles),flying=VALUES(flying),tower_damage=VALUES(tower_damage)",
      [card.id, card.type, card.cost, card.rarity, 1, "full catalog card", card.hp, card.damage, Math.round(card.hitSpeed * 1000), card.dps, card.speed, card.range, card.sightRange, card.targets, card.count, card.radius, card.flying ? 1 : 0, card.towerDamage ?? null],
    );
    for (let level = 1; level <= 16; level += 1) {
      const levelDamage = scale(card.damage, level);
      const levelHp = scale(card.hp, level);
      const levelDeathBurst = scale(card.deathBurst ?? 0, level);
      const levelTowerDamage = card.towerDamage === undefined ? null : scale(card.towerDamage, level);
      const hitSpeedMs = Math.round(card.hitSpeed * 1000);
      await p.query(
        "INSERT INTO card_level_stats (card_id,level,mode,stat_version,hit_points,damage,hit_speed_ms,dps,move_speed,range_tiles,sight_range,radius_tiles,unit_count,duration_ms,deploy_delay_ms,tower_damage,death_burst,death_burst_radius,flying,targets,attack_pattern,source,is_approximation,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE hit_points=VALUES(hit_points),damage=VALUES(damage),hit_speed_ms=VALUES(hit_speed_ms),dps=VALUES(dps),move_speed=VALUES(move_speed),range_tiles=VALUES(range_tiles),sight_range=VALUES(sight_range),radius_tiles=VALUES(radius_tiles),unit_count=VALUES(unit_count),duration_ms=VALUES(duration_ms),deploy_delay_ms=VALUES(deploy_delay_ms),tower_damage=VALUES(tower_damage),death_burst=VALUES(death_burst),death_burst_radius=VALUES(death_burst_radius),flying=VALUES(flying),targets=VALUES(targets),attack_pattern=VALUES(attack_pattern),source=VALUES(source),is_approximation=VALUES(is_approximation),notes=VALUES(notes)",
        [card.id, level, mode, statVersion, levelHp, levelDamage, hitSpeedMs, hitSpeedMs > 0 ? levelDamage / (hitSpeedMs / 1000) : 0, card.speed, card.range, card.sightRange, card.radius, card.count, card.durationMs ?? 0, Math.round((card.deployDelaySec ?? 0) * 1000), levelTowerDamage, levelDeathBurst, card.deathBurstRadius ?? 0, card.flying ? 1 : 0, card.targets, mechanics[card.id]?.attack ?? "single", "generated catalog baseline", 1, "Phase 1 normalized seed approximation"],
      );
    }
    await p.query(
      "INSERT INTO sprites (card_name,kind,atlas_x,atlas_y,w,h,placeholder_emoji,art_path,art_note) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE kind=VALUES(kind),atlas_x=VALUES(atlas_x),atlas_y=VALUES(atlas_y),art_path=VALUES(art_path)",
      [card.id, card.type, (cardRows.indexOf(card) % 16) * 64, Math.floor(cardRows.indexOf(card) / 16) * 64, 64, 64, "", `assets/placeholders/${card.id}.svg`, "original placeholder - inspired by, not copied"],
    );
  }

  const cardIds = cardRows.map((card) => card.id);
  const cardIdPlaceholders = cardIds.map(() => "?").join(",");
  await p.query(`DELETE FROM cards WHERE name NOT IN (${cardIdPlaceholders})`, cardIds);
  await p.query(`DELETE FROM card_catalog WHERE name NOT IN (${cardIdPlaceholders})`, cardIds);
  await p.query("DELETE old_sprites FROM sprites old_sprites JOIN sprites newer_sprites ON old_sprites.card_name=newer_sprites.card_name AND old_sprites.id>newer_sprites.id");
  await p.query(`DELETE FROM sprites WHERE card_name NOT IN (${cardIdPlaceholders})`, cardIds);
  try {
    await p.query("ALTER TABLE sprites ADD UNIQUE KEY uq_sprites_card (card_name)");
  } catch (error) {
    const dbError = error as { code?: string; errno?: number };
    if (dbError.code !== "ER_DUP_KEYNAME" && dbError.errno !== 1061) throw error;
  }

  for (const menu of LOCAL_MENUS) {
    await p.query("INSERT INTO menus (label,route,icon,sort_order,parent) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE route=VALUES(route),icon=VALUES(icon),sort_order=VALUES(sort_order),parent=VALUES(parent)", [menu.label, menu.route, menu.icon, menu.sortOrder, null]);
  }

  for (const [cardId, value] of Object.entries(mechanics)) {
    await p.query(
      "INSERT INTO card_mechanics (card_id,version,attack_pattern,targeting,movement,tower_troop,on_deploy,on_attack,on_hit,on_death,periodic,ability) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version),attack_pattern=VALUES(attack_pattern),targeting=VALUES(targeting),movement=VALUES(movement),tower_troop=VALUES(tower_troop),on_deploy=VALUES(on_deploy),on_attack=VALUES(on_attack),on_hit=VALUES(on_hit),on_death=VALUES(on_death),periodic=VALUES(periodic),ability=VALUES(ability)",
      [cardId, Number(value.version ?? 1), value.attack ?? null, value.targeting ?? "all", value.movement ?? null, value.towerTroop === true ? 1 : 0, JSON.stringify(value.onDeploy ?? []), JSON.stringify(value.onAttack ?? []), JSON.stringify(value.onHit ?? []), JSON.stringify(value.onDeath ?? []), JSON.stringify(value.periodic ?? []), JSON.stringify(value.ability ?? [])],
    );
  }

  const spawns = jsonFile("spawn_templates.json");
  for (const [templateId, value] of Object.entries(spawns)) {
    await p.query(
      "INSERT INTO card_spawn_templates (template_id,version,hp,damage,hit_speed_ms,speed,range_tiles,sight_range,targets,unit_count,flying,attack_pattern,on_deploy,on_attack,on_hit,on_death,periodic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version),hp=VALUES(hp),damage=VALUES(damage),hit_speed_ms=VALUES(hit_speed_ms),speed=VALUES(speed),range_tiles=VALUES(range_tiles),sight_range=VALUES(sight_range),targets=VALUES(targets),unit_count=VALUES(unit_count),flying=VALUES(flying),attack_pattern=VALUES(attack_pattern),on_deploy=VALUES(on_deploy),on_attack=VALUES(on_attack),on_hit=VALUES(on_hit),on_death=VALUES(on_death),periodic=VALUES(periodic)",
      [templateId, Number(value.version ?? 1), value.hp, value.damage, value.hitSpeedMs, value.speed, value.range, value.sightRange, value.targets, value.count ?? 1, value.flying === true ? 1 : 0, value.attack ?? "single", JSON.stringify(value.onDeploy ?? []), JSON.stringify(value.onAttack ?? []), JSON.stringify(value.onHit ?? []), JSON.stringify(value.onDeath ?? []), JSON.stringify(value.periodic ?? [])],
    );
    for (let level = 1; level <= 16; level += 1) {
      const levelDamage = scale(Number(value.damage), level);
      const levelHp = scale(Number(value.hp), level);
      const hitSpeedMs = Number(value.hitSpeedMs);
      await p.query(
        "INSERT INTO spawn_template_level_stats (template_id,level,mode,stat_version,hit_points,damage,hit_speed_ms,dps,move_speed,range_tiles,sight_range,radius_tiles,unit_count,duration_ms,deploy_delay_ms,tower_damage,death_burst,death_burst_radius,flying,targets,attack_pattern,source,is_approximation,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE hit_points=VALUES(hit_points),damage=VALUES(damage),hit_speed_ms=VALUES(hit_speed_ms),dps=VALUES(dps),move_speed=VALUES(move_speed),range_tiles=VALUES(range_tiles),sight_range=VALUES(sight_range),radius_tiles=VALUES(radius_tiles),unit_count=VALUES(unit_count),duration_ms=VALUES(duration_ms),deploy_delay_ms=VALUES(deploy_delay_ms),tower_damage=VALUES(tower_damage),death_burst=VALUES(death_burst),death_burst_radius=VALUES(death_burst_radius),flying=VALUES(flying),targets=VALUES(targets),attack_pattern=VALUES(attack_pattern),source=VALUES(source),is_approximation=VALUES(is_approximation),notes=VALUES(notes)",
        [templateId, level, mode, statVersion, levelHp, levelDamage, hitSpeedMs, hitSpeedMs > 0 ? levelDamage / (hitSpeedMs / 1000) : 0, value.speed, value.range, value.sightRange, 0, value.count ?? 1, 0, 0, null, 0, 0, value.flying === true ? 1 : 0, value.targets, value.attack ?? "single", "spawn template baseline", 1, "Phase 1 normalized seed approximation"],
      );
    }
  }
  return { tables: true, cards: cardRows.length, mechanics: Object.keys(mechanics).length, spawns: Object.keys(spawns).length, cardStats: cardRows.length * 16, spawnStats: Object.keys(spawns).length * 16 };
}

function levelStatsFromRow(row: Record<string, unknown>, idColumn = "card_id"): CardLevelStats {
  return {
    cardId: String(row[idColumn]),
    level: Number(row.level),
    mode: String(row.mode),
    statVersion: Number(row.stat_version),
    hitPoints: Number(row.hit_points),
    damage: Number(row.damage),
    hitSpeedMs: Number(row.hit_speed_ms),
    dps: Number(row.dps),
    moveSpeed: Number(row.move_speed),
    range: Number(row.range_tiles),
    sightRange: Number(row.sight_range),
    radius: Number(row.radius_tiles),
    count: Number(row.unit_count),
    durationMs: Number(row.duration_ms),
    deployDelayMs: Number(row.deploy_delay_ms),
    ...(row.tower_damage === null || row.tower_damage === undefined ? {} : { towerDamage: Number(row.tower_damage) }),
    deathBurst: Number(row.death_burst),
    deathBurstRadius: Number(row.death_burst_radius),
    flying: Number(row.flying) === 1,
    targets: String(row.targets),
    attackPattern: String(row.attack_pattern),
    source: String(row.source),
    approximation: Number(row.is_approximation) === 1,
  };
}

/** Load all level rows once before rooms are allowed to create matches. */
export async function hydrateLevelStatsFromMysql(): Promise<{ loaded: number; source: string }> {
  const p = getPool();
  if (p) {
    const [rows] = await p.query(
      "SELECT card_id,level,mode,stat_version,hit_points,damage,hit_speed_ms,dps,move_speed,range_tiles,sight_range,radius_tiles,unit_count,duration_ms,deploy_delay_ms,tower_damage,death_burst,death_burst_radius,flying,targets,attack_pattern,source,is_approximation FROM card_level_stats",
    );
    const cardRows = (rows as Record<string, unknown>[]).map((row) => levelStatsFromRow(row));
    const [spawnRows] = await p.query(
      "SELECT template_id,level,mode,stat_version,hit_points,damage,hit_speed_ms,dps,move_speed,range_tiles,sight_range,radius_tiles,unit_count,duration_ms,deploy_delay_ms,tower_damage,death_burst,death_burst_radius,flying,targets,attack_pattern,source,is_approximation FROM spawn_template_level_stats",
    );
    const childRows = (spawnRows as Record<string, unknown>[]).map((row) => levelStatsFromRow(row, "template_id"));
    hydrateLevelStats([...cardRows, ...childRows]);
    return { loaded: cardRows.length + childRows.length, source: "mysql" };
  }
  const rows: LevelStats[] = [];
  for (const card of Object.values(CARDS)) {
    for (let level = 1; level <= 16; level += 1) rows.push(fallbackLevelStats(card, level));
  }
  for (const template of Object.values(SPAWN_TEMPLATES)) {
    for (let level = 1; level <= 16; level += 1) rows.push(fallbackLevelStats(template, level));
  }
  hydrateLevelStats(rows);
  return { loaded: rows.length, source: "fallback" };
}

/** Resolve one complete level row; the result is safe to snapshot into a match. */
export async function getCardStats(cardId: string, level = 1, mode = "ladder", statVersion = 1): Promise<CardLevelStats | null> {
  const card = CARDS[cardId];
  if (card === undefined) return null;
  const p = getPool();
  if (p) {
    const [rows] = await p.query(
      "SELECT card_id,level,mode,stat_version,hit_points,damage,hit_speed_ms,dps,move_speed,range_tiles,sight_range,radius_tiles,unit_count,duration_ms,deploy_delay_ms,tower_damage,death_burst,death_burst_radius,flying,targets,attack_pattern,source,is_approximation FROM card_level_stats WHERE card_id=? AND level=? AND mode=? AND stat_version=? LIMIT 1",
      [cardId, level, mode, statVersion],
    );
    const row = (rows as Record<string, unknown>[])[0];
    if (row !== undefined) return levelStatsFromRow(row);
  }
  return fallbackLevelStats(card, level, mode, statVersion);
}

export async function getCardLevelSeries(cardId: string, mode = "ladder", statVersion = 1): Promise<CardLevelStats[]> {
  const card = CARDS[cardId];
  if (card === undefined) return [];
  const p = getPool();
  if (p) {
    const [rows] = await p.query(
      "SELECT card_id,level,mode,stat_version,hit_points,damage,hit_speed_ms,dps,move_speed,range_tiles,sight_range,radius_tiles,unit_count,duration_ms,deploy_delay_ms,tower_damage,death_burst,death_burst_radius,flying,targets,attack_pattern,source,is_approximation FROM card_level_stats WHERE card_id=? AND mode=? AND stat_version=? ORDER BY level",
      [cardId, mode, statVersion],
    );
    const list = rows as Record<string, unknown>[];
    if (list.length > 0) return list.map((row) => levelStatsFromRow(row));
  }
  return Array.from({ length: 16 }, (_, index) => fallbackLevelStats(card, index + 1, mode, statVersion));
}

/**
 * Load the authoritative card behavior rows into the runtime card index.
 * O(n) over the 108-card catalog; the engine never queries MySQL in its tick.
 */
export async function hydrateMechanicsFromMysql(): Promise<{ loaded: number; source: string }> {
  const p = getPool();
  if (!p) return hydrateMechanicsFromSeedFile();
  try {
    const [rows] = await p.query(
      "SELECT card_id,version,attack_pattern,targeting,movement,tower_troop,on_deploy,on_attack,on_hit,on_death,periodic,ability FROM card_mechanics ORDER BY card_id",
    );
    const list = rows as Record<string, unknown>[];
    const records: Record<string, CardMechanicSpec> = {};
    for (const row of list) {
      const id = String(row.card_id);
      records[id] = parseCardMechanicSpec(row);
    }
    hydrateCardMechanics(records);
    return { loaded: Object.keys(records).length, source: "mysql" };
  } catch {
    return { loaded: 0, source: "unavailable" };
  }
}

export async function hydrateSpawnTemplatesFromMysql(): Promise<{ loaded: number; source: string }> {
  const p = getPool();
  if (!p) return hydrateSpawnTemplatesFromSeedFile();
  try {
    const [rows] = await p.query(
      "SELECT template_id,version,hp,damage,hit_speed_ms,speed,range_tiles,sight_range,targets,unit_count,flying,attack_pattern,on_deploy,on_attack,on_hit,on_death,periodic FROM card_spawn_templates ORDER BY template_id",
    );
    const records: Record<string, CardDef> = {};
    for (const row of rows as Record<string, unknown>[]) records[String(row.template_id)] = spawnTemplateFromRow(row);
    hydrateSpawnTemplates(records);
    return { loaded: Object.keys(records).length, source: "mysql" };
  } catch {
    return { loaded: 0, source: "unavailable" };
  }
}

function hydrateSpawnTemplatesFromSeedFile(): { loaded: number; source: string } {
  try {
    const path = resolve(process.cwd(), "..", "infra", "mysql", "spawn_templates.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, unknown>>;
    const records: Record<string, CardDef> = {};
    for (const [id, value] of Object.entries(raw)) records[id] = spawnTemplateFromSeed(id, value);
    hydrateSpawnTemplates(records);
    return { loaded: Object.keys(records).length, source: "seed-file" };
  } catch {
    return { loaded: 0, source: "unavailable" };
  }
}

/** Local development fallback uses the same checked-in data that seeds MySQL. */
function hydrateMechanicsFromSeedFile(): { loaded: number; source: string } {
  try {
    const path = resolve(process.cwd(), "..", "infra", "mysql", "card_mechanics.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, unknown>>;
    const records: Record<string, CardMechanicSpec> = {};
    for (const [id, value] of Object.entries(raw)) {
      records[id] = {
        version: Number(value.version ?? 1),
        attack: typeof value.attack === "string" ? value.attack as CardMechanicSpec["attack"] : undefined,
        targeting: typeof value.targeting === "string" ? value.targeting as CardMechanicSpec["targeting"] : "all",
        movement: typeof value.movement === "string" ? value.movement as CardMechanicSpec["movement"] : undefined,
        onDeploy: Array.isArray(value.onDeploy) ? value.onDeploy as CardMechanicSpec["onDeploy"] : [],
        onAttack: Array.isArray(value.onAttack) ? value.onAttack as CardMechanicSpec["onAttack"] : [],
        onHit: Array.isArray(value.onHit) ? value.onHit as CardMechanicSpec["onHit"] : [],
        onDeath: Array.isArray(value.onDeath) ? value.onDeath as CardMechanicSpec["onDeath"] : [],
        periodic: Array.isArray(value.periodic) ? value.periodic as CardMechanicSpec["periodic"] : [],
        ability: Array.isArray(value.ability) ? value.ability as CardMechanicSpec["ability"] : [],
        ...(value.towerTroop === true ? { towerTroop: true } : {}),
      };
    }
    hydrateCardMechanics(records);
    return { loaded: Object.keys(records).length, source: "seed-file" };
  } catch {
    return { loaded: 0, source: "unavailable" };
  }
}

export async function getCardMechanicsContent(): Promise<{
  mechanics: CardMechanicsContent[];
  source: string;
}> {
  const p = getPool();
  if (!p) return getSeedMechanicsContent();
  try {
    const [rows] = await p.query(
      "SELECT card_id,version,attack_pattern,targeting,movement,tower_troop,on_deploy,on_attack,on_hit,on_death,periodic,ability FROM card_mechanics ORDER BY card_id",
    );
    const list = rows as Record<string, unknown>[];
    return {
      source: "mysql",
      mechanics: list.map((row) => ({
        cardId: String(row.card_id),
        mechanics: parseCardMechanicSpec(row),
      })),
    };
  } catch {
    return { mechanics: [], source: "unavailable" };
  }
}

function getSeedMechanicsContent(): { mechanics: CardMechanicsContent[]; source: string } {
  try {
    const path = resolve(process.cwd(), "..", "infra", "mysql", "card_mechanics.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, unknown>>;
    return {
      source: "seed-file",
      mechanics: Object.entries(raw).map(([cardId, value]) => ({
        cardId,
        mechanics: {
          version: Number(value.version ?? 1),
          attack: typeof value.attack === "string" ? value.attack as CardMechanicSpec["attack"] : undefined,
          targeting: typeof value.targeting === "string" ? value.targeting as CardMechanicSpec["targeting"] : "all",
          movement: typeof value.movement === "string" ? value.movement as CardMechanicSpec["movement"] : undefined,
          onDeploy: Array.isArray(value.onDeploy) ? value.onDeploy as CardMechanicSpec["onDeploy"] : [],
          onAttack: Array.isArray(value.onAttack) ? value.onAttack as CardMechanicSpec["onAttack"] : [],
          onHit: Array.isArray(value.onHit) ? value.onHit as CardMechanicSpec["onHit"] : [],
          onDeath: Array.isArray(value.onDeath) ? value.onDeath as CardMechanicSpec["onDeath"] : [],
          periodic: Array.isArray(value.periodic) ? value.periodic as CardMechanicSpec["periodic"] : [],
          ability: Array.isArray(value.ability) ? value.ability as CardMechanicSpec["ability"] : [],
          ...(value.towerTroop === true ? { towerTroop: true } : {}),
        },
      })),
    };
  } catch {
    return { mechanics: [], source: "unavailable" };
  }
}

function localCards(): ContentCard[] {
  // O(n) n=108 from the canonical engine table. Zero I/O fallback.
  return Object.values(CARDS)
    .map((c) => cardToContent(c.id, c))
    .filter((c): c is ContentCard => c !== null);
}

const LOCAL_SPRITES: SpriteMeta[] = [
  { cardName: "knight", kind: "troop", atlasX: 0, atlasY: 0, w: 64, h: 64, placeholderEmoji: "⚔️", artPath: "assets/placeholders/knight.svg" },
  { cardName: "archers", kind: "troop", atlasX: 64, atlasY: 0, w: 64, h: 64, placeholderEmoji: "🏹", artPath: "assets/placeholders/archers.svg" },
  { cardName: "giant", kind: "troop", atlasX: 128, atlasY: 0, w: 64, h: 64, placeholderEmoji: "🗿", artPath: "assets/placeholders/giant.svg" },
  { cardName: "skeletons", kind: "troop", atlasX: 192, atlasY: 0, w: 64, h: 64, placeholderEmoji: "💀", artPath: "assets/placeholders/skeletons.svg" },
  { cardName: "musketeer", kind: "troop", atlasX: 0, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🔫", artPath: "assets/placeholders/musketeer.svg" },
  { cardName: "baby-dragon", kind: "troop", atlasX: 64, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🐲", artPath: "assets/placeholders/baby-dragon.svg" },
  { cardName: "mini-pekka", kind: "troop", atlasX: 128, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🔪", artPath: "assets/placeholders/mini-pekka.svg" },
  { cardName: "golem", kind: "troop", atlasX: 192, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🪨", artPath: "assets/placeholders/golem.svg" },
  { cardName: "fireball", kind: "spell", atlasX: 0, atlasY: 128, w: 64, h: 64, placeholderEmoji: "🔥", artPath: "assets/placeholders/fireball.svg" },
  { cardName: "arrows", kind: "spell", atlasX: 64, atlasY: 128, w: 64, h: 64, placeholderEmoji: "➶", artPath: "assets/placeholders/arrows.svg" },
  { cardName: "zap", kind: "spell", atlasX: 128, atlasY: 128, w: 64, h: 64, placeholderEmoji: "⚡", artPath: "assets/placeholders/zap.svg" },
  { cardName: "cannon", kind: "building", atlasX: 192, atlasY: 128, w: 64, h: 64, placeholderEmoji: "🏯", artPath: "assets/placeholders/cannon.svg" },
];

const LOCAL_MENUS: MenuItem[] = [
  { label: "Battle", route: "/battle", icon: "⚔️", sortOrder: 1 },
  { label: "Deck", route: "/deck", icon: "🃏", sortOrder: 2 },
  { label: "Clan", route: "/clan", icon: "🛡️", sortOrder: 3 },
  { label: "Shop", route: "/shop", icon: "🛒", sortOrder: 4 },
  { label: "Leaderboard", route: "/leaderboard", icon: "🏆", sortOrder: 5 },
  { label: "Profile", route: "/profile", icon: "👤", sortOrder: 6 },
  { label: "Lobby", route: "/lobby", icon: "🎮", sortOrder: 7 },
];

// Local catalog fallback: the complete generated 108-card catalog.
// O(c) c=108 derived from canonical CARDS.
const LOCAL_CATALOG: CatalogEntry[] = Object.values(CARDS).map((c) => ({
  name: c.id,
  cardType: c.type,
  elixir: c.cost,
  rarity: c.rarity,
  playable: true,
  hp: c.hp,
  damage: c.damage,
  dps: c.dps,
  speed: c.speed,
  range: c.range,
  sightRange: c.sightRange,
  targets: c.targets,
  count: c.count,
  radius: c.radius,
  flying: c.flying === true,
  ...(c.towerDamage !== undefined ? { towerDamage: c.towerDamage } : {}),
}));

export async function getContentCards(): Promise<{ cards: ContentCard[]; source: string }> {
  // Every catalog card is playable now: the canonical CARDS table (108 defs,
  // generated from the catalog by scripts/generate_card_table.py) is the single
  // source of stats. MySQL supplies the roster + source label.
  // O(n) over the catalog, n = 108.
  const catalog = await getCatalog();
  const names = catalog.catalog.map((c) => c.name);
  if (catalog.source === "mysql") {
    const cards = names
      .map((name) => cardToContent(name, CARDS[name]))
      .filter((c): c is ContentCard => c !== null);
    if (cards.length > 0) return { source: "mysql", cards };
  }
  return { source: "local", cards: localCards() };
}

/** Canonical engine def -> client ContentCard shape (null when unknown). O(1). */
function cardToContent(name: string, def: CardDef | undefined): ContentCard | null {
  if (def === undefined) return null;
  return {
    name: def.id,
    displayName: def.id
      .split("-")
      .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ")
      .replace("Mini Pekka", "Mini P.E.K.K.A"),
    cardType: def.type,
    elixir: def.cost,
    hp: def.hp,
    dps: Math.round(def.dps),
    speedLabel: def.speed === 0 ? "static" : def.speed >= 1.1 ? "fast" : def.speed >= 0.8 ? "med" : "slow",
    rangeTiles: def.range,
    targets: def.targets,
    unitCount: def.count,
    rarity: def.rarity,
    mechanics: def.mechanics,
  };
}

export async function getContentSprites(): Promise<{ sprites: SpriteMeta[]; source: string }> {
  // O(c) rows. Metadata only - never binary rips (MEMORY#22).
  const p = getPool();
  if (p) {
    try {
      const [rows] = await p.query("SELECT card_name,kind,atlas_x,atlas_y,w,h,placeholder_emoji,art_path FROM sprites ORDER BY card_name");
      const list = rows as Record<string, unknown>[];
      if (list.length > 0) {
        return {
          source: "mysql",
          sprites: list.map((r) => ({
            cardName: String(r["card_name"]),
            kind: String(r["kind"]),
            atlasX: Number(r["atlas_x"]),
            atlasY: Number(r["atlas_y"]),
            w: Number(r["w"]),
            h: Number(r["h"]),
            placeholderEmoji: String(r["placeholder_emoji"] ?? ""),
            artPath: String(r["art_path"] ?? ""),
          })),
        };
      }
    } catch {
      // fallback
    }
  }
  return { source: "local", sprites: LOCAL_SPRITES.map((s) => ({ ...s })) };
}

export async function getCatalog(): Promise<{ catalog: CatalogEntry[]; source: string }> {
  // O(n) n≈108 catalog rows. MySQL first, curated local fallback (same facts).
  const p = getPool();
  if (p) {
    try {
      const [rows] = await p.query("SELECT name,card_type,elixir,rarity,playable,hp,damage,dps,speed,range_tiles,sight_range,targets,unit_count,radius_tiles,flying,tower_damage FROM card_catalog ORDER BY elixir,name");
      const list = rows as Record<string, unknown>[];
      if (list.length > 0) {
        return {
          source: "mysql",
          catalog: list.map((r) => {
            const name = String(r["name"]);
            const def = CARDS[name];
            return {
              name,
              cardType: String(r["card_type"]),
              // Battle cost comes from the canonical table (tower troops are
              // catalogued at 0 elixir but cost 4 in a deck).
              elixir: def?.cost ?? Number(r["elixir"]),
              rarity: String(r["rarity"]),
              // Every catalog card has full stats now, so all are playable.
              playable: def !== undefined,
              hp: Number(r["hp"] ?? def?.hp ?? 0),
              damage: Number(r["damage"] ?? def?.damage ?? 0),
              dps: Number(r["dps"] ?? def?.dps ?? 0),
              speed: Number(r["speed"] ?? def?.speed ?? 0),
              range: Number(r["range_tiles"] ?? def?.range ?? 0),
              sightRange: Number(r["sight_range"] ?? def?.sightRange ?? 0),
              targets: String(r["targets"] ?? def?.targets ?? ""),
              count: Number(r["unit_count"] ?? def?.count ?? 0),
              radius: Number(r["radius_tiles"] ?? def?.radius ?? 0),
              flying: Number(r["flying"] ?? (def?.flying ? 1 : 0)) === 1,
              ...(r["tower_damage"] !== null && r["tower_damage"] !== undefined
                ? { towerDamage: Number(r["tower_damage"]) }
                : def?.towerDamage !== undefined ? { towerDamage: def.towerDamage } : {}),
            };
          }),
        };
      }
    } catch {
      // fallback
    }
  }
  return { source: "local", catalog: LOCAL_CATALOG.map((c) => ({ ...c })) };
}

export async function getContentMenus(): Promise<{ menus: MenuItem[]; source: string }> {
  // O(m) m=7 menu rows.
  const p = getPool();
  if (p) {
    try {
      const [rows] = await p.query("SELECT label,route,icon,sort_order FROM menus ORDER BY sort_order");
      const list = rows as Record<string, unknown>[];
      if (list.length > 0) {
        return {
          source: "mysql",
          menus: list.map((r) => ({
            label: String(r["label"]),
            route: String(r["route"]),
            icon: String(r["icon"] ?? ""),
            sortOrder: Number(r["sort_order"] ?? 0),
          })),
        };
      }
    } catch {
      // fallback
    }
  }
  return { source: "local", menus: LOCAL_MENUS.map((m) => ({ ...m })) };
}
