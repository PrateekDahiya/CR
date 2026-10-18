// MySQL content store (Phase 10, MEMORY#22).
// Aiven MySQL `cr` via env ONLY (never commit creds): DB_HOST/DB_USER/DB_PASS/
// DB_NAME/DB_PORT/DB_SSL. mysql2 is OPTIONAL (dynamic require) so tsc/build +
// `npm test` pass without install; memory/local fallback mirrors GAME_DESIGN §1.
// All ops O(1) pool + O(c) roster reads (c=12). Big-O per function (MEMORY#20).

import { CARDS, type CardDef } from "./game/cards.js";

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

export interface CatalogEntry {
  name: string;
  cardType: string;
  elixir: number;
  rarity: string;
  playable: boolean;
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

// Local catalog fallback: the 12 playable cards (full ~108 needs MySQL seed_catalog.py).
// O(c) c=12 derived from canonical CARDS. Facts mirror GAME_DESIGN section 1.
const LOCAL_CATALOG: CatalogEntry[] = Object.values(CARDS).map((c) => ({
  name: c.id,
  cardType: c.type,
  elixir: c.cost,
  rarity: c.rarity,
  playable: true,
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
      const [rows] = await p.query("SELECT name,card_type,elixir,rarity,playable FROM card_catalog ORDER BY elixir,name");
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
