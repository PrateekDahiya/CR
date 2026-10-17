/**
 * frontend/lib/api.ts — REST helpers for CR Clone (fetch-based).
 *
 * Contracts per GAME_DESIGN.md §12.5:
 *  - GET  {backend}/health          -> { ok: true, service: "backend" }
 *  - GET  {ai}/health               -> { ok: true, service: "ai" }
 *  - POST {ai}/bot/move             { difficulty, game_state } -> { card, x, y, difficulty }
 *  - GET  {ai}/balance/cards[?card] -> { cards: [{ name, win_rate, pick_rate }], ... }
 *
 * Base URLs default to localhost ports (4000 backend / 8000 ai) and can be
 * overridden via NEXT_PUBLIC_BACKEND_URL / NEXT_PUBLIC_AI_URL or per-call args.
 * Sibling note (MEMORY#16): transport only — no UI imports here.
 */

export const DEFAULT_BACKEND_URL = "http://localhost:4000";
export const DEFAULT_AI_URL = "http://localhost:8000";

function env(name: string): string | undefined {
  try {
    const v =
      typeof process !== "undefined"
        ? (process.env?.[name] as string | undefined)
        : undefined;
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export function backendUrl(explicit?: string): string {
  return explicit ?? env("NEXT_PUBLIC_BACKEND_URL") ?? DEFAULT_BACKEND_URL;
}

export function aiUrl(explicit?: string): string {
  return explicit ?? env("NEXT_PUBLIC_AI_URL") ?? DEFAULT_AI_URL;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
}

export type BotDifficulty = "easy" | "medium" | "hard";

export interface BotMoveRequest {
  difficulty: BotDifficulty;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  game_state?: any;
}

export interface BotMoveResponse {
  card: string;
  x: number;
  y: number;
  difficulty: BotDifficulty;
}

export interface BalanceCard {
  name: string;
  win_rate: number;
  pick_rate: number;
}

export interface BalanceResponse {
  cards: BalanceCard[];
  note?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return (await res.json()) as T;
}

/** GET {base}/health — liveness probe for backend (default) or ai-service. */
export function getHealth(baseUrl?: string): Promise<HealthResponse> {
  const base = backendUrl(baseUrl);
  return fetchJson<HealthResponse>(`${base.replace(/\/$/, "")}/health`);
}

/** GET {ai}/health — liveness probe for the ai-service. */
export function getAiHealth(aiBaseUrl?: string): Promise<HealthResponse> {
  const base = aiUrl(aiBaseUrl);
  return fetchJson<HealthResponse>(`${base.replace(/\/$/, "")}/health`);
}

/**
 * POST {ai}/bot/move — bot suggestion (stub in Phase 3: random card/x/y).
 * The authoritative server resolves the suggestion via the bot's current
 * hand (handIndex wins, else cardId lookup — GAME_DESIGN §12.4).
 */
export function postBotMove(
  difficulty: BotDifficulty = "medium",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameState?: any,
  aiBaseUrl?: string,
): Promise<BotMoveResponse> {
  const base = aiUrl(aiBaseUrl);
  const body: BotMoveRequest = { difficulty, ...(gameState !== undefined ? { game_state: gameState } : {}) };
  return fetchJson<BotMoveResponse>(`${base.replace(/\/$/, "")}/bot/move`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * GET {ai}/balance/cards — stub analytics until Phase 6 replays exist
 * (serves the §2 target table). Optional `card` filters to one entry.
 */
export function getBalanceCards(card?: string, aiBaseUrl?: string): Promise<BalanceResponse> {
  const base = aiUrl(aiBaseUrl).replace(/\/$/, "");
  const qs = typeof card === "string" && card.length > 0 ? `?card=${encodeURIComponent(card)}` : "";
  return fetchJson<BalanceResponse>(`${base}/balance/cards${qs}`);
}

export interface ProfileResponse {
  id: string;
  playerId: string;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
  season: string;
  db: boolean;
}

export interface LeaderboardEntry {
  id: string;
  playerId: string;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface LeaderboardResponse {
  season: string;
  db: boolean;
  entries: LeaderboardEntry[];
}

/** POST {backend}/auth/guest — O(1) guest login, returns token. */
export function postGuest(playerId: string, baseUrl?: string): Promise<{ playerId: string; token: string; trophies: number; db: boolean }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/auth/guest`, { method: "POST", body: JSON.stringify({ playerId }) });
}

/** GET {backend}/profile/:id — O(1) lookup. */
export function getProfile(playerId: string, baseUrl?: string): Promise<ProfileResponse> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson<ProfileResponse>(`${base}/profile/${encodeURIComponent(playerId)}`);
}

/** GET {backend}/leaderboard — O(n log n) server sort, n tiny. */
export function getLeaderboard(limit = 20, baseUrl?: string): Promise<LeaderboardResponse> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson<LeaderboardResponse>(`${base}/leaderboard?limit=${limit}`);
}
