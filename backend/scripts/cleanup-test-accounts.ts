/**
 * scripts/cleanup-test-accounts.ts — remove test/QA player accounts.
 *
 * Keeps only the three real accounts (dahiya27, dahiya, p482128) and deletes
 * every other player row (profiles, decks, accounts) from MySQL. The backend
 * re-hydrates from the database on the next restart.
 *
 * Run: npx tsx scripts/cleanup-test-accounts.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const KEEP = ["dahiya27", "dahiya", "p482128"];

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([^#][^=]+)=(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key !== undefined && value !== undefined && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  config();
  loadEnvFile(resolve(process.cwd(), "infra", ".env"));
  loadEnvFile(resolve(process.cwd(), "..", "infra", ".env"));
  const host = process.env.DB_HOST;
  if (host === undefined || host.length === 0) {
    console.log("DB_HOST not configured; nothing to clean");
    return;
  }
  const pool = mysql.createPool({
    host,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME ?? "cr",
    port: Number(process.env.DB_PORT ?? 27884) || 27884,
    ssl: (process.env.DB_SSL ?? "true").toLowerCase() === "true" ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 2,
  });
  const [rows] = await pool.query("SELECT player_id FROM player_profiles");
  const all = (rows as Array<{ player_id: string }>).map((r) => String(r.player_id));
  const drop = all.filter((id) => !KEEP.includes(id));
  console.log(`players: ${all.length}, removing ${drop.length}`);
  for (const id of drop) {
    await pool.query("DELETE FROM player_decks WHERE player_id=?", [id]);
    await pool.query("DELETE FROM player_profiles WHERE player_id=?", [id]);
    await pool.query("DELETE FROM player_accounts WHERE player_id=?", [id]);
    await pool.query("DELETE FROM battle_log WHERE player_id=?", [id]);
  }
  // Accounts whose username is not a keeper but whose player id is a keeper.
  const [accRows] = await pool.query("SELECT username, player_id FROM player_accounts");
  for (const row of accRows as Array<{ username: string; player_id: string }>) {
    if (!KEEP.includes(String(row.player_id))) {
      await pool.query("DELETE FROM player_accounts WHERE username=?", [row.username]);
    }
  }
  // Battle-log rows of players that no longer exist (orphans from test runs).
  await pool.query("DELETE FROM battle_log WHERE player_id NOT IN (?)", [KEEP]);
  // Tournaments whose roster only holds test players (bracket rows of the
  // removed accounts).
  const [trnRows] = await pool.query("SELECT id, payload FROM tournament");
  for (const row of trnRows as Array<{ id: string; payload: string }>) {
    let players: Array<{ playerId?: string }> = [];
    try {
      const parsed = JSON.parse(row.payload) as { players?: Array<{ playerId?: string }> };
      players = Array.isArray(parsed.players) ? parsed.players : [];
    } catch {
      players = [];
    }
    const kept = players.some((p) => KEEP.includes(String(p.playerId)));
    if (!kept) await pool.query("DELETE FROM tournament WHERE id=?", [row.id]);
  }
  const [after] = await pool.query("SELECT player_id FROM player_profiles");
  console.log(`remaining: ${(after as unknown[]).map((r) => (r as { player_id: string }).player_id).join(", ")}`);
  await pool.end();
}

void main();
