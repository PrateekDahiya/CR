// Content REST routes (Phase 10, MEMORY#22): same CR cards/menus from MySQL.
// All handlers O(c)/O(m) reads + O(1) fallback. Never serves binary rips.

import type { Express, Request, Response } from "express";
import { getContentCards, getContentMenus, getContentSprites, isMysqlConfigured, pingMysql } from "./mysql.js";

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

  // O(1) store status (env presence + live ping).
  app.get("/content/status", async (_req: Request, res: Response) => {
    const live = await pingMysql();
    res.json({ configured: isMysqlConfigured(), live, store: live ? "mysql" : "local" });
  });
}
