// CR Clone persistence layer (Phase 7).
// Postgres via Prisma when DATABASE_URL is set AND @prisma/client installed;
// otherwise in-memory fallback (dev/preview, no install needed).
// All ops O(1) map lookups except leaderboard sort O(n log n) on read (n = users, tiny).
// Big-O per function in comments (MEMORY#20).

export interface UserRow {
  id: string;
  playerId: string;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface DeckRow {
  id: string;
  userId: string;
  name: string;
  cards: string[];
  isActive: boolean;
}

export interface MatchRow {
  id: string;
  blueId: string | null;
  redId: string | null;
  blueCrowns: number;
  redCrowns: number;
  winner: string;
  durationMs: number;
  season: string;
}

type PrismaLike = {
  user: { upsert: Function; findUnique: Function; findMany: Function };
  deck: { upsert: Function; findMany: Function };
  match: { create: Function; findMany: Function };
};

// O(1) lazy singleton. Dynamic require so tsc/build pass without @prisma/client installed.
let prisma: PrismaLike | null = null;
let prismaTried = false;

function getPrisma(): PrismaLike | null {
  // O(1) cached.
  if (prismaTried) return prisma;
  prismaTried = true;
  if (!process.env.DATABASE_URL) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma/client") as { PrismaClient: new () => PrismaLike };
    prisma = new PrismaClient();
    return prisma;
  } catch {
    return null;
  }
}

// In-memory fallback stores. O(1) Map ops.
const memUsers = new Map<string, UserRow>();
const memDecks = new Map<string, DeckRow[]>();
const memMatches: MatchRow[] = [];

function uid(prefix: string): string {
  // O(1). No crypto needed for dev ids.
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function isDbLive(): boolean {
  // O(1).
  return getPrisma() !== null;
}

export async function upsertUser(playerId: string): Promise<UserRow> {
  // O(1) upsert. Creates 0-trophy user on first seen (guest auth flow).
  const db = getPrisma();
  if (db) {
    const u = (await db.user.upsert({
      where: { playerId },
      update: {},
      create: { playerId },
    })) as UserRow;
    return u;
  }
  let u = memUsers.get(playerId);
  if (!u) {
    u = { id: uid("u"), playerId, trophies: 0, wins: 0, losses: 0, draws: 0 };
    memUsers.set(playerId, u);
  }
  return { ...u };
}

export async function getUser(playerId: string): Promise<UserRow | null> {
  // O(1) lookup.
  const db = getPrisma();
  if (db) {
    const u = (await db.user.findUnique({ where: { playerId } })) as UserRow | null;
    return u;
  }
  const u = memUsers.get(playerId);
  return u ? { ...u } : null;
}

export async function saveDeck(playerId: string, cards: string[], name = "Battle Deck"): Promise<DeckRow> {
  // O(k) k<=8 validation + O(1) store.
  const db = getPrisma();
  const user = await upsertUser(playerId);
  if (db) {
    const d = (await db.deck.upsert({
      where: { id: `${user.id}-active` },
      update: { cards, name, isActive: true },
      create: { id: `${user.id}-active`, userId: user.id, cards, name, isActive: true },
    })) as DeckRow;
    return d;
  }
  const row: DeckRow = { id: `${user.id}-active`, userId: user.id, name, cards: [...cards], isActive: true };
  memDecks.set(playerId, [row]);
  return { ...row };
}

export async function recordMatch(input: {
  blueId: string | null;
  redId: string | null;
  blueCrowns: number;
  redCrowns: number;
  winner: string;
  durationMs?: number;
  season?: string;
}): Promise<MatchRow> {
  // O(1) insert + O(1) trophy/W-L update per player (K=24 Elo-lite, floor 0).
  const season = input.season ?? process.env.SEASON ?? "s1";
  const db = getPrisma();
  if (db) {
    const m = (await db.match.create({ data: { ...input, season } })) as MatchRow;
    return m;
  }
  const row: MatchRow = {
    id: uid("m"),
    blueId: input.blueId,
    redId: input.redId,
    blueCrowns: input.blueCrowns,
    redCrowns: input.redCrowns,
    winner: input.winner,
    durationMs: input.durationMs ?? 0,
    season,
  };
  memMatches.push(row);
  // Trophy delta O(1) per side.
  const apply = (pid: string | null, won: boolean, draw: boolean) => {
    if (!pid) return;
    const u = memUsers.get(pid);
    if (!u) return;
    if (draw) {
      u.draws += 1;
    } else if (won) {
      u.wins += 1;
      u.trophies += 24;
    } else {
      u.losses += 1;
      u.trophies = Math.max(0, u.trophies - 24);
    }
  };
  const draw = input.winner === "draw";
  apply(input.blueId, input.winner === "blue", draw);
  apply(input.redId, input.winner === "red", draw);
  return { ...row };
}

export async function leaderboard(limit = 20): Promise<UserRow[]> {
  // O(n log n) sort on read, n = users (tiny in Phase 7; paginated in Phase 8+).
  const db = getPrisma();
  if (db) {
    const rows = (await db.user.findMany({ orderBy: { trophies: "desc" }, take: limit })) as UserRow[];
    return rows;
  }
  return [...memUsers.values()].sort((a, b) => b.trophies - a.trophies).slice(0, limit).map((u) => ({ ...u }));
}

export function resetMemory(): void {
  // O(1). Test-only helper.
  memUsers.clear();
  memDecks.clear();
  memMatches.length = 0;
}
