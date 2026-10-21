/**
 * backend/src/tournaments.ts — the tournament registry.
 *
 * A tournament is a named bracket: players join it, the server pairs the
 * players that are ready, and every tournament match is a normal
 * authoritative match (same room, same engine). The result is written back
 * into the bracket (single elimination) AND into the per-player battle log,
 * so the battle log's TOURNAMENTS tab can show the whole bracket.
 *
 * Perf (MEMORY#20):
 * - The registry is a Map: create/join/list are O(1) per player and O(p) per
 *   tournament (p <= MAX_PLAYERS = 8).
 * - The per-player view is built with one indexed pass per tournament, never
 *   a nested scan over the whole store.
 * - Persistence mirrors the battle log (one row per tournament, JSON payload)
 *   so a restart does not lose the bracket.
 */

import { getMysqlPool } from "./mysql.js";

export type TournamentStatus = "open" | "finished";

export interface TournamentPlayer {
  playerId: string;
  name: string;
  deck: string[];
  trophies: number;
  wins: number;
  losses: number;
  /** True once the player lost a bracket match. */
  eliminated: boolean;
}

export interface TournamentMatch {
  matchId: string;
  blueId: string;
  redId: string;
  winner: "blue" | "red" | "draw";
  blueCrowns: number;
  redCrowns: number;
  createdAtMs: number;
}

export interface Tournament {
  id: string;
  name: string;
  maxPlayers: number;
  createdAtMs: number;
  status: TournamentStatus;
  championId?: string;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
}

/** Players per tournament (Clash Royale uses 8; the clone caps it there too). */
export const MAX_PLAYERS = 8;
/** Tournaments kept in memory (oldest finished ones are dropped first). */
export const MAX_TOURNAMENTS = 50;

const tournaments = new Map<string, Tournament>();
/** Players that pressed "ready" for a tournament (not persisted). */
const readyPlayers = new Map<string, Set<string>>();

function nowMs(): number {
  return Date.now();
}

function newId(): string {
  return `trn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Cap the store: drop the oldest finished tournament when it grows. O(n). */
function evictOldest(): void {
  if (tournaments.size <= MAX_TOURNAMENTS) return;
  let oldestId: string | null = null;
  let oldestMs = Number.POSITIVE_INFINITY;
  for (const [id, t] of tournaments) {
    if (t.status !== "finished") continue;
    if (t.createdAtMs < oldestMs) {
      oldestMs = t.createdAtMs;
      oldestId = id;
    }
  }
  if (oldestId !== null) {
    tournaments.delete(oldestId);
    readyPlayers.delete(oldestId);
    return;
  }
  // Everything is still open: drop the oldest open one.
  for (const [id, t] of tournaments) {
    if (t.createdAtMs < oldestMs) {
      oldestMs = t.createdAtMs;
      oldestId = id;
    }
  }
  if (oldestId !== null) {
    tournaments.delete(oldestId);
    readyPlayers.delete(oldestId);
  }
}

export interface JoinTournamentResult {
  ok: boolean;
  code?: string;
  message?: string;
  tournament?: Tournament;
}

/**
 * Create a tournament; the creator joins it right away.
 * O(p) for the initial player list (p = 1).
 */
export function createTournament(input: {
  name: string;
  playerId: string;
  playerName?: string;
  deck: string[];
  trophies?: number;
  maxPlayers?: number;
}): Tournament {
  const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Math.trunc(input.maxPlayers ?? MAX_PLAYERS)));
  const tournament: Tournament = {
    id: newId(),
    name: input.name.trim().slice(0, 40) || "Tournament",
    maxPlayers,
    createdAtMs: nowMs(),
    status: "open",
    players: [
      {
        playerId: input.playerId,
        name: input.playerName ?? input.playerId,
        deck: input.deck.slice(0, 8),
        trophies: Math.trunc(input.trophies ?? 0),
        wins: 0,
        losses: 0,
        eliminated: false,
      },
    ],
    matches: [],
  };
  tournaments.set(tournament.id, tournament);
  evictOldest();
  void persist(tournament);
  return tournament;
}

/**
 * Join a tournament. O(p) to look for the player in the roster (p <= 8).
 * A player that already joined is accepted again (idempotent).
 */
export function joinTournament(
  tournamentId: string,
  input: { playerId: string; playerName?: string; deck: string[]; trophies?: number },
): JoinTournamentResult {
  const tournament = tournaments.get(tournamentId);
  if (tournament === undefined) {
    return { ok: false, code: "NO_TOURNAMENT", message: "unknown tournament" };
  }
  if (tournament.status === "finished") {
    return { ok: false, code: "TOURNAMENT_OVER", message: "tournament already finished" };
  }
  for (const player of tournament.players) {
    if (player.playerId === input.playerId) {
      // Already in: refresh the deck (the player may have edited it).
      player.deck = input.deck.slice(0, 8);
      if (input.playerName !== undefined) player.name = input.playerName;
      if (input.trophies !== undefined) player.trophies = Math.trunc(input.trophies);
      void persist(tournament);
      return { ok: true, tournament };
    }
  }
  if (tournament.players.length >= tournament.maxPlayers) {
    return { ok: false, code: "TOURNAMENT_FULL", message: "tournament is full" };
  }
  tournament.players.push({
    playerId: input.playerId,
    name: input.playerName ?? input.playerId,
    deck: input.deck.slice(0, 8),
    trophies: Math.trunc(input.trophies ?? 0),
    wins: 0,
    losses: 0,
    eliminated: false,
  });
  void persist(tournament);
  return { ok: true, tournament };
}

/** The tournament, or undefined. O(1). */
export function getTournament(tournamentId: string): Tournament | undefined {
  return tournaments.get(tournamentId);
}

/** matchId -> tournamentId for the matches that are still running. */
const matchTournament = new Map<string, string>();

/** Link a running tournament match to its tournament. O(1). */
export function registerTournamentMatch(tournamentId: string, matchId: string): void {
  if (matchId.length === 0) return;
  matchTournament.set(matchId, tournamentId);
}

/**
 * The tournament a match belongs to, or undefined.
 * O(1) for a running match, O(t * m) for a finished one (the registry is
 * capped at MAX_TOURNAMENTS entries).
 */
export function findTournamentByMatch(matchId: string): Tournament | undefined {
  const runningId = matchTournament.get(matchId);
  if (runningId !== undefined) {
    const running = tournaments.get(runningId);
    if (running !== undefined) return running;
  }
  for (const tournament of tournaments.values()) {
    for (const match of tournament.matches) {
      if (match.matchId === matchId) return tournament;
    }
  }
  return undefined;
}

export interface TournamentSummary {
  id: string;
  name: string;
  status: TournamentStatus;
  maxPlayers: number;
  playerCount: number;
  createdAtMs: number;
  /** The requesting player is in this tournament. */
  joined: boolean;
  championId?: string;
  championName?: string;
  players: Array<{ playerId: string; name: string; trophies: number; wins: number; losses: number; eliminated: boolean }>;
  matches: TournamentMatch[];
}

/**
 * The tournament list for a player: every tournament (open first, newest
 * first). O(t * (p + m)) with t = tournaments (<= 50), p <= 8, m small.
 */
export function listTournaments(playerId?: string): TournamentSummary[] {
  const out: TournamentSummary[] = [];
  for (const tournament of tournaments.values()) {
    const players = tournament.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      trophies: p.trophies,
      wins: p.wins,
      losses: p.losses,
      eliminated: p.eliminated,
    }));
    const champion = tournament.championId !== undefined
      ? tournament.players.find((p) => p.playerId === tournament.championId)
      : undefined;
    out.push({
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      playerCount: tournament.players.length,
      createdAtMs: tournament.createdAtMs,
      joined: playerId !== undefined && tournament.players.some((p) => p.playerId === playerId),
      ...(tournament.championId !== undefined ? { championId: tournament.championId } : {}),
      ...(champion !== undefined ? { championName: champion.name } : {}),
      players,
      matches: tournament.matches.map((m) => ({ ...m })),
    });
  }
  // Open tournaments first, then newest first. O(n log n), n <= 50.
  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return b.createdAtMs - a.createdAtMs;
  });
  return out;
}

/**
 * Mark a player as ready to play. When two ready players meet, the server
 * pairs them: `claimOpponent` hands out the opponent (and their deck).
 * O(p) over the roster (p <= 8).
 */
export function markTournamentReady(
  tournamentId: string,
  playerId: string,
): { ok: boolean; code?: string; message?: string; opponent?: TournamentPlayer } {
  const tournament = tournaments.get(tournamentId);
  if (tournament === undefined) {
    return { ok: false, code: "NO_TOURNAMENT", message: "unknown tournament" };
  }
  const me = tournament.players.find((p) => p.playerId === playerId);
  if (me === undefined) {
    return { ok: false, code: "NOT_JOINED", message: "join the tournament first" };
  }
  if (me.eliminated) {
    return { ok: false, code: "ELIMINATED", message: "you are out of this tournament" };
  }
  if (tournament.status === "finished") {
    return { ok: false, code: "TOURNAMENT_OVER", message: "tournament already finished" };
  }
  let ready = readyPlayers.get(tournamentId);
  if (ready === undefined) {
    ready = new Set<string>();
    readyPlayers.set(tournamentId, ready);
  }
  // An opponent that is ready and has not played yet.
  for (const player of tournament.players) {
    if (player.playerId === playerId) continue;
    if (player.eliminated) continue;
    if (!ready.has(player.playerId)) continue;
    ready.delete(player.playerId);
    ready.delete(playerId);
    return { ok: true, opponent: player };
  }
  ready.add(playerId);
  return { ok: true };
}

/**
 * Record a finished tournament match: winner advances, loser is eliminated
 * and the tournament finishes when a single player is left. O(p + m).
 */
export function recordTournamentMatch(
  tournamentId: string,
  match: {
    matchId: string;
    blueId: string;
    redId: string;
    winner: "blue" | "red" | "draw";
    blueCrowns: number;
    redCrowns: number;
  },
): Tournament | undefined {
  const tournament = tournaments.get(tournamentId);
  if (tournament === undefined) return undefined;
  tournament.matches.push({
    matchId: match.matchId,
    blueId: match.blueId,
    redId: match.redId,
    winner: match.winner,
    blueCrowns: match.blueCrowns,
    redCrowns: match.redCrowns,
    createdAtMs: nowMs(),
  });
  const loserId =
    match.winner === "blue" ? match.redId : match.winner === "red" ? match.blueId : null;
  const winnerId =
    match.winner === "blue" ? match.blueId : match.winner === "red" ? match.redId : null;
  for (const player of tournament.players) {
    if (player.playerId === loserId) {
      player.losses += 1;
      player.eliminated = true;
    } else if (player.playerId === winnerId) {
      player.wins += 1;
    }
  }
  // A draw eliminates nobody -> the tournament can never end. Treat a draw as
  // a loss for the red side so the bracket always converges.
  if (match.winner === "draw") {
    const red = tournament.players.find((p) => p.playerId === match.redId);
    if (red !== undefined && !red.eliminated) {
      red.losses += 1;
      red.eliminated = true;
    }
  }
  let alive = 0;
  let championId: string | undefined;
  for (const player of tournament.players) {
    if (!player.eliminated) {
      alive += 1;
      championId = player.playerId;
    }
  }
  if (alive <= 1 && tournament.players.length > 1) {
    tournament.status = "finished";
    if (championId !== undefined) tournament.championId = championId;
    readyPlayers.delete(tournamentId);
  }
  void persist(tournament);
  return tournament;
}

/** Restore persisted tournaments on boot. O(t * p). */
export async function hydrateTournaments(): Promise<number> {
  const pool = getMysqlPool();
  if (pool === null) return 0;
  try {
    const [rows] = await pool.query("SELECT id, payload FROM tournament");
    let count = 0;
    for (const row of rows as Array<{ id: string; payload: string | unknown }>) {
      const parsed = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      if (parsed === null || typeof parsed !== "object") continue;
      const tournament = parsed as Tournament;
      if (typeof tournament.id !== "string" || !Array.isArray(tournament.players)) continue;
      tournaments.set(tournament.id, tournament);
      count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

/** Persist one tournament (whole payload, it is tiny). Fire-and-forget. */
async function persist(tournament: Tournament): Promise<void> {
  const pool = getMysqlPool();
  if (pool === null) return;
  try {
    await pool.query(
      "INSERT INTO tournament (id, name, status, created_at_ms, payload) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status), payload=VALUES(payload)",
      [tournament.id, tournament.name, tournament.status, tournament.createdAtMs, JSON.stringify(tournament)],
    );
  } catch {
    // The in-memory registry stays authoritative when the write fails.
  }
}

/** Test helper: drop every stored tournament. */
export function resetTournaments(): void {
  tournaments.clear();
  readyPlayers.clear();
  matchTournament.clear();
}
