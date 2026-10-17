// Meta REST routes (Phase 7): auth guest, profile, leaderboard, deck, match report, season.
// All handlers O(1) except leaderboard O(n log n) read. MEMORY#20.

import type { Express, Request, Response } from "express";
import { authPlayerId, mintGuestToken } from "./auth.js";
import { getUser, leaderboard, recordMatch, saveDeck, upsertUser, isDbLive } from "./db.js";

const SEASON = process.env.SEASON ?? "s1";

export function mountMeta(app: Express): void {
  // O(1).
  app.post("/auth/guest", async (req: Request, res: Response) => {
    const pid = authPlayerId(req) ?? `guest_${Math.floor(Math.random() * 1e6)}`;
    const user = await upsertUser(pid);
    res.json({ playerId: user.playerId, token: mintGuestToken(user.playerId), trophies: user.trophies, db: isDbLive() });
  });

  // O(1).
  app.get("/profile/:playerId", async (req: Request, res: Response) => {
    const u = await getUser(req.params.playerId);
    if (!u) {
      res.status(404).json({ code: "NOT_FOUND", message: "unknown player" });
      return;
    }
    res.json({ ...u, season: SEASON, db: isDbLive() });
  });

  // O(n log n) sort on read, n = users.
  app.get("/leaderboard", async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20) || 20));
    const rows = await leaderboard(limit);
    res.json({ season: SEASON, db: isDbLive(), entries: rows });
  });

  // O(k) k<=8.
  app.post("/deck", async (req: Request, res: Response) => {
    const pid = authPlayerId(req);
    const cards = (req.body as { cards?: unknown })?.cards;
    if (!pid || !Array.isArray(cards) || cards.length !== 8) {
      res.status(400).json({ code: "BAD_DECK", message: "playerId + exactly 8 cards required" });
      return;
    }
    const ids = cards.map((c) => String(c));
    const row = await saveDeck(pid, ids, String((req.body as { name?: unknown })?.name ?? "Battle Deck"));
    res.json(row);
  });

  // O(1).
  app.post("/matches/report", async (req: Request, res: Response) => {
    const b = req.body as Record<string, unknown>;
    const row = await recordMatch({
      blueId: typeof b.blueId === "string" ? b.blueId : null,
      redId: typeof b.redId === "string" ? b.redId : null,
      blueCrowns: Number(b.blueCrowns ?? 0) || 0,
      redCrowns: Number(b.redCrowns ?? 0) || 0,
      winner: typeof b.winner === "string" ? b.winner : "draw",
      durationMs: Number(b.durationMs ?? 0) || 0,
      season: typeof b.season === "string" ? b.season : SEASON,
    });
    res.json(row);
  });

  // O(1).
  app.get("/season", (_req: Request, res: Response) => {
    res.json({ season: SEASON, name: "Season 1: Goblin Stadium", endsAt: null });
  });
}
