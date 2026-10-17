// MySQL content store (Phase 10, MEMORY#22).
// Aiven MySQL `cr` via env ONLY (never commit creds): DB_HOST/DB_USER/DB_PASS/
// DB_NAME/DB_PORT/DB_SSL. mysql2 is OPTIONAL (dynamic require) so tsc/build +
// `npm test` pass without install; memory/local fallback mirrors GAME_DESIGN §1.
// All ops O(1) pool + O(c) roster reads (c=12). Big-O per function (MEMORY#20).

import { CARDS } from "./game/cards.js";

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

function localCards(): ContentCard[] {
  // O(c) c=12 from canonical engine table. Zero I/O fallback.
  return Object.values(CARDS).map((c) => ({
    name: c.id,
    displayName: c.name,
    cardType: c.type,
    elixir: c.cost,
    hp: c.hp,
    dps: Math.round(c.dps),
    speedLabel: c.speed === 0 ? "static" : c.speed >= 1.1 ? "fast" : c.speed >= 0.8 ? "med" : "slow",
    rangeTiles: c.range,
    targets: c.targets,
    unitCount: c.count,
    rarity: c.rarity,
  }));
}

const LOCAL_SPRITES: SpriteMeta[] = [
  { cardName: "knight", kind: "troop", atlasX: 0, atlasY: 0, w: 64, h: 64, placeholderEmoji: "⚔️", artPath: "assets/placeholders/knight.svg" },
  { cardName: "archers", kind: "troop", atlasX: 64, atlasY: 0, w: 64, h: 64, placeholderEmoji: "🏹", artPath: "assets/placeholders/archers.svg" },
  { cardName: "giant", kind: "troop", atlasX: 128, atlasY: 0, w: 64, h: 64, placeholderEmoji: "🗿", artPath: "assets/placeholders/giant.svg" },
  { cardName: "skeletons", kind: "troop", atlasX: 192, atlasY: 0, w: 64, h: 64, placeholderEmoji: "💀", artPath: "assets/placeholders/skeletons.svg" },
  { cardName: "musketeer", kind: "troop", atlasX: 0, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🔫", artPath: "assets/placeholders/musketeer.svg" },
  { cardName: "baby-dragon", kind: "troop", atlasX: 64, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🐲", artPath: "assets/placeholders/baby-dragon.svg" },
  { cardName: "mini-pekka", kind: "troop", atlasX: 128, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🔪", artPath: "assets/placeholders/mini-pekka.svg" },
  { cardName: "rock-golem", kind: "troop", atlasX: 192, atlasY: 64, w: 64, h: 64, placeholderEmoji: "🪨", artPath: "assets/placeholders/rock-golem.svg" },
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

export async function getContentCards(): Promise<{ cards: ContentCard[]; source: string }> {
  // O(c) rows. MySQL first, local fallback on any failure.
  const p = getPool();
  if (p) {
    try {
      const [rows] = await p.query(
        "SELECT name,card_type,elixir,hp,dps,speed_label,range_tiles,targets,unit_count,rarity FROM cards ORDER BY elixir,name"
      );
      const list = rows as Record<string, unknown>[];
      if (list.length > 0) {
        return {
          source: "mysql",
          cards: list.map((r) => ({
            name: String(r["name"]),
            displayName: String(r["name"]).split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ").replace("Mini Pekka", "Mini P.E.K.K.A").replace("Baby Dragon", "Baby Dragon"),
            cardType: String(r["card_type"]),
            elixir: Number(r["elixir"]),
            hp: Number(r["hp"]),
            dps: Number(r["dps"]),
            speedLabel: String(r["speed_label"] ?? ""),
            rangeTiles: Number(r["range_tiles"] ?? 0),
            targets: String(r["targets"] ?? ""),
            unitCount: Number(r["unit_count"] ?? 1),
            rarity: String(r["rarity"]),
          })),
        };
      }
    } catch {
      // fall through to local
    }
  }
  return { source: "local", cards: localCards() };
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
