// Content REST routes (Phase 10, MEMORY#22): same CR cards/menus from MySQL.
// All handlers O(c)/O(m) reads + O(1) fallback. Never serves binary rips.

import type { Express, Request, Response } from "express";
import {
  getCatalog,
  getCardLevelSeries,
  getCardMechanicsContent,
  getContentCards,
  getContentMenus,
  getContentSprites,
  isMysqlConfigured,
  pingMysql,
} from "./mysql.js";

export function mountContent(app: Express): void {
  // O(c) c=12 cards.
  app.get("/content/cards", async (_req: Request, res: Response) => {
    const data = await getContentCards();
    res.json({ ...data, count: data.cards.length });
  });

  // O(c) sprite metadata only (no binaries, MEMORY#22).
  app.get("/content/sprites", async (_req: Request, res: Response) => {
    const data = await getContentSprites();
    res.json({ ...data, count: data.sprites.length, note: "metadata only - original placeholders, no ripped binaries" });
  });

  // O(m) m=7 menus.
  app.get("/content/menus", async (_req: Request, res: Response) => {
    const data = await getContentMenus();
    res.json({ ...data, count: data.menus.length });
  });

  // O(n) n≈108 full catalog (facts: name/elixir/rarity/type).
  app.get("/content/catalog", async (_req: Request, res: Response) => {
    const data = await getCatalog();
    const playable = data.catalog.filter((c) => c.playable).length;
    res.json({ ...data, count: data.catalog.length, playable });
  });

  // O(n) n=108 behavior rows. Mechanics are data, not executable code.
  app.get("/content/mechanics", async (_req: Request, res: Response) => {
    const data = await getCardMechanicsContent();
    res.json({ ...data, count: data.mechanics.length });
  });

  app.get("/content/cards/:id/levels", async (req: Request, res: Response) => {
    const cardId = String(req.params.id);
    const mode = typeof req.query.mode === "string" ? req.query.mode : "ladder";
    const statVersion = Number(req.query.statVersion ?? 1);
    const levels = await getCardLevelSeries(cardId, mode, statVersion);
    if (levels.length === 0) {
      res.status(404).json({ error: "unknown card" });
      return;
    }
    res.json({ cardId, mode, statVersion, levels, count: levels.length });
  });

  // O(1) store status (env presence + live ping).
  app.get("/content/status", async (_req: Request, res: Response) => {
    const live = await pingMysql();
    res.json({ configured: isMysqlConfigured(), live, store: live ? "mysql" : "local" });
  });
}
