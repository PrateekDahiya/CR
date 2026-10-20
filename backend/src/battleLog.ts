/**
 * backend/src/battleLog.ts — per-player battle history (the "Battle Log" panel).
 *
 * Every finished match is recorded for BOTH sides with the decks that were
 * used, the crowns, the game mode and the trophy delta. The store is an
 * in-memory ring buffer (fast reads for the panel) that is mirrored into
 * MySQL so the log survives a restart.
 *
 * Perf: O(1) append + O(1) list (bounded, newest first, capped at
 * MAX_ENTRIES_PER_PLAYER).
 */

import { getMysqlPool } from "./mysql.js";

export type BattleLogResult = "win" | "loss" | "draw";

export interface BattleLogEntry {
  id: string;
  /** Match id (stable, used as the "Watch" key). */
  matchId: string;
  playerId: string;
  opponentId: string;
  opponentName: string;
  result: BattleLogResult;
  /** Crowns the player scored / the opponent scored. */
  crowns: number;
  opponentCrowns: number;
  /** Deck the player used (8 card ids). */
  deck: string[];
  /** Deck the opponent used (may be empty for unknown opponents). */
  opponentDeck: string[];
  /** Game mode id the match ran in. */
  mode: string;
  /** Trophies of the player right after the match. */
  trophies: number;
  opponentTrophies: number;
  trophyDelta: number;
  durationMs: number;
  createdAtMs: number;
}

/** Newest first, capped per player. */
export const MAX_ENTRIES_PER_PLAYER = 30;

const logs = new Map<string, BattleLogEntry[]>();

function cap(entries: BattleLogEntry[]): BattleLogEntry[] {
  return entries.length > MAX_ENTRIES_PER_PLAYER
    ? entries.slice(0, MAX_ENTRIES_PER_PLAYER)
    : entries;
}

/** Record one battle for one player. O(1) + a fire-and-forget DB write. */
export function recordBattleLogEntry(entry: BattleLogEntry): void {
  const list = logs.get(entry.playerId) ?? [];
  list.unshift(entry);
  logs.set(entry.playerId, cap(list));
  void persist(entry.playerId);
}

/** Battle log for one player, newest first. O(1) read (bounded list). */
export function listBattleLogEntries(playerId: string): BattleLogEntry[] {
  return (logs.get(playerId) ?? []).map((entry) => ({ ...entry }));
}

/** Restore persisted logs on boot. O(p * n) over the (tiny) table. */
export async function hydrateBattleLog(): Promise<number> {
  const pool = getMysqlPool();
  if (pool === null) return 0;
  try {
    const [rows] = await pool.query("SELECT player_id, entries FROM battle_log");
    let count = 0;
    for (const row of rows as Array<{ player_id: string; entries: string | unknown }>) {
      const parsed = typeof row.entries === "string" ? JSON.parse(row.entries) : row.entries;
      if (!Array.isArray(parsed)) continue;
      const list = (parsed as BattleLogEntry[]).slice(0, MAX_ENTRIES_PER_PLAYER);
      logs.set(row.player_id, list);
      count += list.length;
    }
    return count;
  } catch {
    return 0;
  }
}

/** Persist one player's log (whole list, it is tiny). Fire-and-forget. */
async function persist(playerId: string): Promise<void> {
  const pool = getMysqlPool();
  if (pool === null) return;
  const list = logs.get(playerId) ?? [];
  try {
    await pool.query(
      "INSERT INTO battle_log (player_id, entries) VALUES (?,?) ON DUPLICATE KEY UPDATE entries=VALUES(entries)",
      [playerId, JSON.stringify(list)],
    );
  } catch {
    // The in-memory log stays authoritative when the write fails.
  }
}

/** Test helper: drop every stored log. */
export function resetBattleLog(): void {
  logs.clear();
}
