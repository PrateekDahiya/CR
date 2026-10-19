/**
 * accounts.ts — username/password accounts.
 *
 * Real credential handling: passwords are stored as scrypt(password, salt) with
 * a per-account random 16-byte salt and compared in constant time. The account
 * key IS the playerId, so registering/logging in resumes that player's
 * trophies, coins, gems, cards and decks.
 *
 * Perf (MEMORY#20): lookups are O(1) map hits; hashing is intentionally slow
 * (scrypt, ~O(16k) work factor) and runs only on register/login.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ensurePlayer, setName, type Player } from "./players.js";
import { saveAccount, type StoredAccount } from "./playerStore.js";

export interface Account {
  playerId: string;
  salt: string;
  hash: string;
  createdAtMs: number;
}

const accounts = new Map<string, Account>();

/** Restore persisted credentials before the HTTP listener starts. */
export function hydrateAccounts(rows: StoredAccount[]): number {
  for (const row of rows) {
    accounts.set(row.username.toLowerCase(), {
      playerId: row.playerId,
      salt: row.salt,
      hash: row.hash,
      createdAtMs: row.createdAtMs,
    });
  }
  return accounts.size;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const MIN_PASSWORD = 6;

function hash(password: string, salt: string): Buffer {
  // O(1) memory-hard hash; never stored in plain text.
  return scryptSync(password, salt, 64);
}

export function validateCredentials(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "Username must be 3-16 characters: letters, numbers or _";
  }
  if (password.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters`;
  }
  return null;
}

export function isRegistered(username: string): boolean {
  return accounts.has(username.toLowerCase());
}

/** Creates an account + its player profile. O(1) + one scrypt hash. */
export function register(username: string, password: string): { ok: true; player: Player } | { ok: false; code: string; message: string } {
  const invalid = validateCredentials(username, password);
  if (invalid !== null) return { ok: false, code: "BAD_CREDENTIALS", message: invalid };
  const key = username.toLowerCase();
  if (accounts.has(key)) {
    return { ok: false, code: "USER_EXISTS", message: "That username is already taken" };
  }
  const salt = randomBytes(16).toString("hex");
  const account: Account = {
    playerId: username,
    salt,
    hash: hash(password, salt).toString("hex"),
    createdAtMs: Date.now(),
  };
  accounts.set(key, account);
  saveAccount({
    username: key,
    playerId: account.playerId,
    salt: account.salt,
    hash: account.hash,
    createdAtMs: account.createdAtMs,
  });
  const player = ensurePlayer(username);
  setName(username, username);
  return { ok: true, player };
}

/** Verifies credentials in constant time. O(1) + one scrypt hash. */
export function login(username: string, password: string): { ok: true; player: Player } | { ok: false; code: string; message: string } {
  const account = accounts.get(username.toLowerCase());
  const player = ensurePlayer(username);
  if (account === undefined) {
    return { ok: false, code: "NO_ACCOUNT", message: "No account with that username" };
  }
  const attempt = hash(password, account.salt);
  const expected = Buffer.from(account.hash, "hex");
  if (attempt.length !== expected.length || !timingSafeEqual(attempt, expected)) {
    return { ok: false, code: "BAD_LOGIN", message: "Incorrect password" };
  }
  return { ok: true, player };
}

export function adminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES ?? "dahiya27")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
}

export function isAdminUsername(username: string): boolean {
  return adminUsernames().includes(username.trim().toLowerCase());
}

/**
 * Ensure allowlisted admin accounts exist and match ADMIN_PASSWORD on boot.
 * Override ADMIN_USERNAMES / ADMIN_PASSWORD in the environment for real use.
 */
export function ensureAdminAccount(): string | null {
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";
  for (const username of adminUsernames()) {
    const existing = accounts.get(username);
    if (existing === undefined) {
      const result = register(username, password);
      if (result.ok) return username;
      continue;
    }
    // Keep the admin password in sync with ADMIN_PASSWORD on boot so a fresh
    // clone always has a usable admin login. Override the env for real use.
    const salt = randomBytes(16).toString("hex");
    existing.salt = salt;
    existing.hash = hash(password, salt).toString("hex");
    saveAccount({
      username,
      playerId: existing.playerId,
      salt: existing.salt,
      hash: existing.hash,
      createdAtMs: existing.createdAtMs,
    });
    return username;
  }
  return null;
}

export function accountCount(): number {
  return accounts.size;
}

export function resetAccounts(): void {
  accounts.clear();
}