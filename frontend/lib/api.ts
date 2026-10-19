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

/** Error carrying the backend's machine code so the UI can react (e.g. NO_FUNDS). */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Guest auth header: the backend verifies base64url(playerId). O(1). */
function authHeaders(): Record<string, string> {
  const pid = typeof window !== "undefined" ? window.localStorage.getItem("cr-player-id") ?? "" : "";
  if (!pid) return {};
  return { authorization: `Bearer ${btoa(pid)}` };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let code = "HTTP_ERROR";
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { code?: string; message?: string };
      if (body?.code) code = body.code;
      if (body?.message) message = body.message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, { method: "POST", body: JSON.stringify(body) });
}

function putJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, { method: "PUT", body: JSON.stringify(body) });
}

function delJson<T>(url: string): Promise<T> {
  return fetchJson<T>(url, { method: "DELETE" });
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
  playable?: boolean;
}

/** GET {backend}/content/cards — same CR roster, MySQL live or local fallback. O(c) c=12. */
export function getContentCards(baseUrl?: string): Promise<{ cards: ContentCard[]; source: string; count: number }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/content/cards`);
}

/** GET {backend}/content/menus — same CR menu labels/routes, MySQL or fallback. O(m) m=7. */
export function getContentMenus(baseUrl?: string): Promise<{ menus: { label: string; route: string; icon: string; sortOrder: number }[]; source: string; count: number }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/content/menus`);
}

export interface CatalogEntry {
  name: string;
  cardType: string;
  elixir: number;
  rarity: string;
  playable: boolean;
}

/** GET {backend}/content/catalog — full CR catalog facts (108+ cards). O(n) n≈108. */
export function getCatalog(baseUrl?: string): Promise<{ catalog: CatalogEntry[]; source: string; count: number; playable: number }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/content/catalog`);
}

/** GET {backend}/leaderboard — legacy rows (kept for older clients). O(n log n). */
export function getLeaderboardRows(limit = 20, baseUrl?: string): Promise<{ season: string; entries: LeaderboardEntry[] }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/leaderboard?limit=${limit}`);
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  trophies: number;
  coins: number;
  gems: number;
  wins: number;
  losses: number;
  draws: number;
  cardsOwned: number;
  activeDeckId: string | null;
  decks: DeckRecord[];
  activeDeck: DeckRecord;
  cards: Record<string, number>;
  season: string;
}

export interface DeckRecord {
  id: string;
  name: string;
  cards: string[];
}

export interface PlayerRow {
  rank: number;
  playerId: string;
  name: string;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  coins: number;
  gems: number;
}

/** GET /profile/:id — full player state (name, trophies, wallet, decks). O(1). */
export function getPlayerProfile(playerId: string, baseUrl?: string): Promise<PlayerProfile> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/profile/${encodeURIComponent(playerId)}`);
}

/** POST /profile/:id/name */
export function setPlayerName(playerId: string, name: string, baseUrl?: string): Promise<{ name: string }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return postJson(`${base}/profile/${encodeURIComponent(playerId)}/name`, { name });
}

/** GET /players — the player table (rank, trophies, W/L, win rate). O(n log n). */
export function getPlayers(limit = 50, baseUrl?: string): Promise<{ season: string; rows: PlayerRow[] }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/players?limit=${limit}`);
}

// --- Multi-deck --------------------------------------------------------------

export function getDecks(playerId: string, baseUrl?: string): Promise<{ decks: DeckRecord[]; activeDeckId: string | null; activeDeck: DeckRecord }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/decks/${encodeURIComponent(playerId)}`);
}

export function createPlayerDeck(playerId: string, name?: string, cards?: string[], baseUrl?: string): Promise<DeckRecord> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return postJson(`${base}/decks/${encodeURIComponent(playerId)}`, {
    ...(name ? { name } : {}),
    ...(cards ? { cards } : {}),
  });
}

export function updatePlayerDeck(playerId: string, deckId: string, patch: { name?: string; cards?: string[] }, baseUrl?: string): Promise<DeckRecord> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return putJson(`${base}/decks/${encodeURIComponent(playerId)}/${deckId}`, patch);
}

export function selectPlayerDeck(playerId: string, deckId: string, baseUrl?: string): Promise<{ activeDeckId: string; activeDeck: DeckRecord }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return postJson(`${base}/decks/${encodeURIComponent(playerId)}/${deckId}/select`, {});
}

export function deletePlayerDeck(playerId: string, deckId: string, baseUrl?: string): Promise<{ decks: DeckRecord[] }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return delJson(`${base}/decks/${encodeURIComponent(playerId)}/${deckId}`);
}

export interface AuthResult {
  playerId: string;
  name: string;
  token: string;
  trophies: number;
  coins: number;
  gems: number;
}

/** POST /auth/register — creates a real account (username + password). */
export function registerAccount(username: string, password: string, baseUrl?: string): Promise<AuthResult> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return postJson(`${base}/auth/register`, { username, password });
}

/** POST /auth/login — verifies the stored password hash. */
export function loginAccount(username: string, password: string, baseUrl?: string): Promise<AuthResult> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return postJson(`${base}/auth/login`, { username, password });
}

/** GET /match/:id — who is blue/red (used to show the real opponent name). */
export function getMatchRoster(matchId: string, baseUrl?: string): Promise<{ matchId: string; blueId: string | null; redId: string | null; winner: string | null }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/match/${encodeURIComponent(matchId)}`);
}

/**
 * GET /match/active/:playerId — the player's running match (if any). The battle
 * room keeps simulating server-side, so the client can re-enter and resume.
 */
export function getActiveMatch(
  playerId: string,
  baseUrl?: string,
): Promise<{ active: false } | { active: true; matchId: string; side: "blue" | "red"; startedAtMs: number; elapsedMs: number }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/match/active/${encodeURIComponent(playerId)}`);
}

/** POST /matches/report — awards trophies/coins and returns the per-player deltas. */
export function reportMatch(input: {
  blueId: string | null;
  redId: string | null;
  winner: "blue" | "red" | "draw";
  blueCrowns?: number;
  redCrowns?: number;
  durationMs?: number;
}, baseUrl?: string): Promise<{ deltas: { playerId: string; trophyDelta: number; coinDelta: number }[] }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return postJson(`${base}/matches/report`, input);
}

// --- Shop -------------------------------------------------------------------

export interface ShopItem {
  id: string;
  name: string;
  kind: "coins" | "gems" | "cards";
  amount: number;
  cardId?: string;
  price: number;
  currency: "coins" | "gems";
  pack?: boolean;
  rare?: boolean;
}

export interface ShopData {
  deals: ShopItem[];
  items: ShopItem[];
  wallet: { coins: number; gems: number } | null;
  owned: Record<string, number>;
}

export function getShop(baseUrl?: string): Promise<ShopData> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return fetchJson(`${base}/shop`);
}

export function buyShopItem(itemId: string, baseUrl?: string): Promise<{ ok: boolean; granted: { cardId?: string; kind: string }; wallet: { coins: number; gems: number } }> {
  const base = backendUrl(baseUrl).replace(/\/$/, "");
  return postJson(`${base}/shop/buy`, { itemId });
}
