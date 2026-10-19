/**
 * Admin dashboard API.
 *
 * Uses the signed-in player's normal bearer token. The player id must be in the
 * ADMIN_USERNAMES allowlist (default `dahiya27`); there is no separate admin
 * login. Dashboard data reads the authoritative in-memory player store
 * (hydrated from MySQL at startup); wallet edits write through the same
 * persistence path.
 */

import type { Express, Request, Response } from "express";
import { isAdminUsername } from "./accounts.js";
import { verifyToken } from "./auth.js";
import { adminUpdatePlayer, getAdminStats, listAdminPlayers } from "./players.js";

function requireAdmin(req: Request, res: Response): string | null {
  const header = req.headers.authorization;
  const playerId = typeof header === "string" && header.startsWith("Bearer ") ? verifyToken(header.slice(7)) : null;
  if (playerId === null || !isAdminUsername(playerId)) {
    res.status(403).json({ code: "NOT_ADMIN", message: "this account is not an admin" });
    return null;
  }
  return playerId;
}

export function mountAdmin(app: Express): void {
  app.get("/admin/stats", (req: Request, res: Response) => {
    if (requireAdmin(req, res) === null) return;
    const stats = getAdminStats();
    res.json(stats);
  });

  app.get("/admin/players", (req: Request, res: Response) => {
    if (requireAdmin(req, res) === null) return;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100) || 100));
    const query = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
    const rows = listAdminPlayers(500)
      .filter((row) => query.length === 0 || row.playerId.toLowerCase().includes(query) || row.name.toLowerCase().includes(query))
      .slice(0, limit);
    res.json({ players: rows, count: rows.length });
  });

  app.post("/admin/players/:playerId/wallet", (req: Request, res: Response) => {
    if (requireAdmin(req, res) === null) return;
    const body = (req.body ?? {}) as { coins?: unknown; gems?: unknown; trophies?: unknown; name?: unknown };
    const patch: { coins?: number; gems?: number; trophies?: number; name?: string } = {};
    for (const key of ["coins", "gems", "trophies"] as const) {
      const value = body[key];
      if (value !== undefined) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          res.status(400).json({ code: "BAD_VALUE", message: `${key} must be numeric` });
          return;
        }
        patch[key] = parsed;
      }
    }
    if (typeof body.name === "string") patch.name = body.name;
    const updated = adminUpdatePlayer(req.params.playerId, patch);
    if (updated === null) {
      res.status(404).json({ code: "NO_PLAYER", message: "unknown player" });
      return;
    }
    res.json({
      ok: true,
      player: {
        playerId: updated.playerId,
        name: updated.name,
        coins: updated.coins,
        gems: updated.gems,
        trophies: updated.trophies,
      },
    });
  });
}
