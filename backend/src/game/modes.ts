/**
 * Authoritative game-mode registry.
 *
 * This is the single place that defines match rules. UI -> socket -> matchmaking
 * -> engine -> snapshot all carry the mode id, and the resolved config travels
 * with every snapshot so clients never hard-code a second rule table.
 *
 * Add a mode here (plus, if it needs bespoke UI, one tile/route) and the
 * matchmaking queue, practice flow, engine regen and AI all pick it up.
 */

/** Structural mirror of shared/types.ts GameModeConfig (backend rootDir=src). */
export interface GameModeConfig {
  id: string;
  label: string;
  description: string;
  elixirRateMultiplier: number;
  startElixir: number;
  elixirCap: number;
  doubleElixir?: boolean;
  overtime?: boolean;
  /** Match win rule: crowns at time-up (default) or first tower destroyed. */
  winCondition?: "crowns" | "first-tower";
  constraints?: Record<string, string | number | boolean>;
}

export const DEFAULT_GAME_MODE_ID = "standard";

export const GAME_MODES: readonly GameModeConfig[] = Object.freeze([
  Object.freeze({
    id: "standard",
    label: "Standard",
    description: "Classic 3-minute battle with normal elixir.",
    elixirRateMultiplier: 1,
    startElixir: 8,
    elixirCap: 10,
    doubleElixir: true,
    overtime: true,
    winCondition: "crowns",
    constraints: Object.freeze({}),
  }),
  Object.freeze({
    id: "double-elixir",
    label: "2x Elixir",
    description: "Double elixir regeneration for the whole match.",
    elixirRateMultiplier: 2,
    startElixir: 8,
    elixirCap: 10,
    // Whole-match 2x replaces the normal t>=120s double window.
    doubleElixir: false,
    overtime: true,
    winCondition: "crowns",
    constraints: Object.freeze({}),
  }),
  Object.freeze({
    id: "infinite-elixir",
    label: "Infinite Elixir",
    description: "8x elixir regeneration for the whole match.",
    elixirRateMultiplier: 8,
    startElixir: 8,
    elixirCap: 10,
    // Whole-match 8x replaces the normal t>=120s double window.
    doubleElixir: false,
    overtime: true,
    winCondition: "crowns",
    constraints: Object.freeze({}),
  }),
  Object.freeze({
    id: "takedown",
    label: "Takedown",
    description: "Destroy one tower to win. Normal elixir timings.",
    elixirRateMultiplier: 1,
    startElixir: 8,
    elixirCap: 10,
    doubleElixir: true,
    overtime: true,
    winCondition: "first-tower",
    constraints: Object.freeze({ winCondition: "first-tower" }),
  }),
]);

const MODE_BY_ID = new Map<string, GameModeConfig>(GAME_MODES.map((mode) => [mode.id, mode]));

/** Look up a mode by id without a fallback. O(1). */
export function getGameMode(id: string | null | undefined): GameModeConfig | undefined {
  if (typeof id !== "string" || id.length === 0) return undefined;
  return MODE_BY_ID.get(id);
}

/** Resolve an arbitrary client value to a legal mode (unknown -> standard). O(1). */
export function resolveGameMode(id: unknown): GameModeConfig {
  return typeof id === "string" ? getGameMode(id) ?? GAME_MODES[0] : GAME_MODES[0];
}

/** Strict parse for socket payloads: reject unknown ids instead of silently downgrading. O(1). */
export function parseGameMode(id: unknown): { ok: true; mode: GameModeConfig } | { ok: false; code: string; message: string } {
  if (id === undefined || id === null || id === "") {
    return { ok: true, mode: GAME_MODES[0] };
  }
  if (typeof id !== "string") {
    return { ok: false, code: "BAD_MODE", message: "modeId must be a string" };
  }
  const mode = getGameMode(id);
  if (mode === undefined) {
    return { ok: false, code: "BAD_MODE", message: `unknown game mode: ${id}` };
  }
  return { ok: true, mode };
}

/** Public mode list for the home-screen picker. O(m). */
export function listGameModes(): GameModeConfig[] {
  return GAME_MODES.map((mode) => ({
    ...mode,
    constraints: mode.constraints === undefined ? undefined : { ...mode.constraints },
  }));
}
