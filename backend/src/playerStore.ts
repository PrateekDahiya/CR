/**
 * MySQL persistence for player accounts, profiles, and decks.
 *
 * Reads happen once at startup (hydrate). Writes are fire-and-forget upserts so
 * the synchronous game store keeps O(1) mutations while progress survives a
 * process restart. When MySQL is not configured everything no-ops and the
 * in-memory store remains the development fallback.
 */

import { getMysqlPool } from "./mysql.js";

export interface StoredAccount {
  username: string;
  playerId: string;
  salt: string;
  hash: string;
  createdAtMs: number;
}

export interface StoredPlayer {
  playerId: string;
  name: string;
  trophies: number;
  coins: number;
  gems: number;
  wins: number;
  losses: number;
  draws: number;
  cards: Record<string, number>;
  towerLevels: Record<string, number>;
  kingLevel: number;
  activeDeckId: string | null;
  createdAtMs: number;
  lastSeenMs: number;
}

export interface StoredDeck {
  id: string;
  playerId: string;
  name: string;
  cards: string[];
  levels: Record<string, number>;
  towerTroopId?: string;
  createdAtMs?: number;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export async function loadPlayerState(): Promise<{
  accounts: StoredAccount[];
  players: StoredPlayer[];
  decks: StoredDeck[];
}> {
  const pool = getMysqlPool();
  if (pool === null) return { accounts: [], players: [], decks: [] };
  try {
    const [accountRows] = await pool.query(
      "SELECT username,player_id,salt,password_hash,created_at_ms FROM player_accounts",
    );
    const [playerRows] = await pool.query(
      "SELECT player_id,name,trophies,coins,gems,wins,losses,draws,cards,tower_levels,king_level,active_deck_id,created_at_ms,last_seen_ms FROM player_profiles",
    );
    const [deckRows] = await pool.query(
      "SELECT id,player_id,name,cards,levels,tower_troop_id,created_at_ms FROM player_decks",
    );
    return {
      accounts: (accountRows as Record<string, unknown>[]).map((row) => ({
        username: String(row.username),
        playerId: String(row.player_id),
        salt: String(row.salt),
        hash: String(row.password_hash),
        createdAtMs: Number(row.created_at_ms ?? 0),
      })),
      players: (playerRows as Record<string, unknown>[]).map((row) => ({
        playerId: String(row.player_id),
        name: String(row.name ?? "Player"),
        trophies: Number(row.trophies ?? 0),
        coins: Number(row.coins ?? 0),
        gems: Number(row.gems ?? 0),
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        draws: Number(row.draws ?? 0),
        cards: parseJson<Record<string, number>>(row.cards, {}),
        towerLevels: parseJson<Record<string, number>>(row.tower_levels, {}),
        kingLevel: Number(row.king_level ?? 1),
        activeDeckId: row.active_deck_id === null ? null : String(row.active_deck_id),
        createdAtMs: Number(row.created_at_ms ?? 0),
        lastSeenMs: Number(row.last_seen_ms ?? row.created_at_ms ?? 0),
      })),
      decks: (deckRows as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        playerId: String(row.player_id),
        name: String(row.name ?? "Battle Deck"),
        cards: parseJson<string[]>(row.cards, []),
        levels: parseJson<Record<string, number>>(row.levels, {}),
        ...(row.tower_troop_id === null || row.tower_troop_id === undefined
          ? {}
          : { towerTroopId: String(row.tower_troop_id) }),
        createdAtMs: Number(row.created_at_ms ?? 0),
      })),
    };
  } catch (error) {
    console.warn(`[playerStore] load failed: ${error instanceof Error ? error.message : String(error)}`);
    return { accounts: [], players: [], decks: [] };
  }
}

export function saveAccount(account: StoredAccount): void {
  const pool = getMysqlPool();
  if (pool === null) return;
  void pool
    .query(
      "INSERT INTO player_accounts (username,player_id,salt,password_hash,created_at_ms) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE player_id=VALUES(player_id),salt=VALUES(salt),password_hash=VALUES(password_hash)",
      [account.username, account.playerId, account.salt, account.hash, account.createdAtMs],
    )
    .catch(() => undefined);
}

export function savePlayerProfile(player: StoredPlayer): void {
  const pool = getMysqlPool();
  if (pool === null) return;
  void pool
    .query(
      "INSERT INTO player_profiles (player_id,name,trophies,coins,gems,wins,losses,draws,cards,tower_levels,king_level,active_deck_id,created_at_ms,last_seen_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),trophies=VALUES(trophies),coins=VALUES(coins),gems=VALUES(gems),wins=VALUES(wins),losses=VALUES(losses),draws=VALUES(draws),cards=VALUES(cards),tower_levels=VALUES(tower_levels),king_level=VALUES(king_level),active_deck_id=VALUES(active_deck_id),last_seen_ms=VALUES(last_seen_ms)",
      [
        player.playerId,
        player.name,
        player.trophies,
        player.coins,
        player.gems,
        player.wins,
        player.losses,
        player.draws,
        JSON.stringify(player.cards),
        JSON.stringify(player.towerLevels),
        player.kingLevel,
        player.activeDeckId,
        player.createdAtMs,
        player.lastSeenMs,
      ],
    )
    .catch(() => undefined);
}

export function savePlayerDecks(playerId: string, decks: StoredDeck[]): void {
  const pool = getMysqlPool();
  if (pool === null) return;
  void (async () => {
    try {
      await pool.query("DELETE FROM player_decks WHERE player_id=?", [playerId]);
      for (const deck of decks) {
        await pool.query(
          "INSERT INTO player_decks (id,player_id,name,cards,levels,tower_troop_id,created_at_ms) VALUES (?,?,?,?,?,?,?)",
          [
            deck.id,
            playerId,
            deck.name,
            JSON.stringify(deck.cards),
            JSON.stringify(deck.levels),
            deck.towerTroopId ?? null,
            deck.createdAtMs ?? Date.now(),
          ],
        );
      }
    } catch {
      // Keep the in-memory store authoritative if a write fails.
    }
  })();
}
