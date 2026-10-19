/**
 * Admin dashboard API.
 *
 * Access requires a normal username/password login for an allowlisted admin
 * (ADMIN_USERNAMES, default `dahiya27`) plus the bearer token on every route.
 * Dashboard data reads the authoritative in-memory player store (hydrated from
 * MySQL at startup); wallet edits write through the same persistence path.
 */

import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { login, isAdminUsername } from "./accounts.js";
import { adminUpdatePlayer, getAdminStats, listAdminPlayers } from "./players.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const adminSessions = new Map<string, { playerId: string; expiresMs: number }>();

/** Opaque, random admin session token (not the forgeable guest player token). */
function issueAdminSession(playerId: string): string {
  const token = randomBytes(32).toString("base64url");
  adminSessions.set(token, { playerId, expiresMs: Date.now() + SESSION_TTL_MS });
  return token;
}

function sessionPlayerId(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const session = adminSessions.get(token);
  if (session === undefined) return null;
  if (session.expiresMs <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }
  return session.playerId;
}

function requireAdmin(req: Request, res: Response): string | null {
  const playerId = sessionPlayerId(req);
  if (playerId === null || !isAdminUsername(playerId)) {
    res.status(401).json({ code: "ADMIN_REQUIRED", message: "admin authentication required" });
    return null;
  }
  return playerId;
}

export function mountAdmin(app: Express): void {
  app.post("/admin/login", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (username.length === 0 || password.length === 0) {
      res.status(400).json({ code: "BAD_CREDENTIALS", message: "username and password required" });
      return;
    }
    const result = login(username, password);
    if (!result.ok) {
      res.status(401).json({ code: result.code, message: result.message });
      return;
    }
    if (!isAdminUsername(result.player.playerId)) {
      res.status(403).json({ code: "NOT_ADMIN", message: "this account is not an admin" });
      return;
    }
    res.json({
      ok: true,
      username: result.player.playerId,
      token: issueAdminSession(result.player.playerId),
    });
  });

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
