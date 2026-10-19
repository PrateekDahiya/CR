// Meta REST routes: profile, player table, multi-deck CRUD, match report, season.
// O(1) per handler except the player table (O(n log n) sort on read).
// MEMORY#20.

import type { Express, Request, Response } from "express";
import { authPlayerId, mintGuestToken } from "./auth.js";
import { isAdminUsername, login, register } from "./accounts.js";
import { getActiveMatchForPlayer, getRoom } from "./net/rooms.js";
import { getUser, leaderboard, recordMatch, saveDeck, upsertUser, isDbLive } from "./db.js";
import {
  activeDeck,
  applyMatchResult,
  createDeck,
  deleteDeck,
  ensurePlayer,
  listDecks,
  playerTable,
  selectDeck,
  setName,
  updateDeck,
  upgradeCard,
  upgradeTower,
} from "./players.js";

const SEASON = process.env.SEASON ?? "s1";

export function mountMeta(app: Express): void {
  /**
   * Register: creates a real account (username + hashed password) and its
   * player profile. Returns the same shape as login so the client can continue
   * in one step. O(1) + one scrypt hash.
   */
  app.post("/auth/register", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const result = register(username, password);
    if (!result.ok) {
      res
        .status(result.code === "USER_EXISTS" ? 409 : 400)
        .json({ code: result.code, message: result.message });
      return;
    }
    const p = result.player;
    res.json({
      playerId: p.playerId,
      name: p.name,
      token: mintGuestToken(p.playerId),
      trophies: p.trophies,
      coins: p.coins,
      gems: p.gems,
    });
  });

  /** Login: verifies the password against the stored scrypt hash. */
  app.post("/auth/login", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const result = login(username, password);
    if (!result.ok) {
      res.status(401).json({ code: result.code, message: result.message });
      return;
    }
    const p = result.player;
    res.json({
      playerId: p.playerId,
      name: p.name,
      token: mintGuestToken(p.playerId),
      trophies: p.trophies,
      coins: p.coins,
      gems: p.gems,
    });
  });

  app.post("/auth/guest", async (req: Request, res: Response) => {
    const pid = authPlayerId(req) ?? `guest_${Math.floor(Math.random() * 1e6)}`;
    const user = await upsertUser(pid);
    const player = ensurePlayer(user.playerId);
    res.json({
      playerId: user.playerId,
      token: mintGuestToken(user.playerId),
      trophies: player.trophies,
      db: isDbLive(),
    });
  });

  /** Full player state: name, trophies, wallet, record, decks. O(1) + O(d). */
  app.get("/profile/:playerId", (req: Request, res: Response) => {
    const p = ensurePlayer(req.params.playerId);
    res.json({
      playerId: p.playerId,
      name: p.name,
      trophies: p.trophies,
      coins: p.coins,
      gems: p.gems,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      cardsOwned: Object.keys(p.cards).length,
      activeDeckId: p.activeDeckId,
      decks: listDecks(p.playerId),
      activeDeck: activeDeck(p.playerId),
      cards: p.cards,
      towerLevels: p.towerLevels,
      kingLevel: p.kingLevel,
      admin: isAdminUsername(p.playerId),
      season: SEASON,
      db: isDbLive(),
    });
  });

  app.post("/profile/:playerId/name", (req: Request, res: Response) => {
    const name = (req.body as { name?: unknown })?.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ code: "BAD_NAME", message: "name required" });
      return;
    }
    const p = setName(req.params.playerId, name);
    res.json({ playerId: p.playerId, name: p.name });
  });

  /** Upgrade one owned card by one level (charges coins). O(k). */
  app.post("/profile/:playerId/cards/:cardId/upgrade", (req: Request, res: Response) => {
    const result = upgradeCard(req.params.playerId, req.params.cardId);
    if (!result.ok) {
      const status = result.code === "NOT_OWNED" ? 404 : result.code === "NO_COINS" ? 402 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  /** Upgrade one crown tower troop independently of card levels. */
  app.post("/profile/:playerId/towers/:towerId/upgrade", (req: Request, res: Response) => {
    const result = upgradeTower(req.params.playerId, req.params.towerId);
    if (!result.ok) {
      const status = result.code === "BAD_TOWER" ? 404 : result.code === "NO_COINS" ? 402 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  /** Player table (leaderboard) with rank + win rate. O(n log n). */
  app.get("/players", (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50) || 50));
    res.json({ season: SEASON, rows: playerTable(limit) });
  });

  // Legacy leaderboard (db.ts rows) kept for older clients. O(n log n).
  app.get("/leaderboard", async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20) || 20));
    const rows = await leaderboard(limit);
    res.json({ season: SEASON, db: isDbLive(), entries: rows });
  });

  // --- Multi-deck CRUD -------------------------------------------------------
  app.get("/decks/:playerId", (req: Request, res: Response) => {
    const p = ensurePlayer(req.params.playerId);
    res.json({ decks: listDecks(p.playerId), activeDeckId: p.activeDeckId, activeDeck: activeDeck(p.playerId) });
  });

  app.post("/decks/:playerId", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { name?: unknown; cards?: unknown; levels?: unknown; towerTroopId?: unknown };
    const deck = createDeck(
      req.params.playerId,
      typeof body.name === "string" ? body.name : undefined,
      Array.isArray(body.cards) ? body.cards.map((c) => String(c)) : undefined,
    );
    res.json(deck);
  });

  app.put("/decks/:playerId/:deckId", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { name?: unknown; cards?: unknown; levels?: unknown; towerTroopId?: unknown };
    const deck = updateDeck(req.params.playerId, req.params.deckId, {
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(Array.isArray(body.cards) ? { cards: body.cards.map((c) => String(c)) } : {}),
      ...(body.levels !== null && typeof body.levels === "object" && !Array.isArray(body.levels) ? { levels: body.levels as Record<string, number> } : {}),
      ...(typeof body.towerTroopId === "string" ? { towerTroopId: body.towerTroopId } : {}),
    });
    if (deck === null) {
      res.status(400).json({ code: "BAD_DECK", message: "unknown deck or invalid 8-card list" });
      return;
    }
    res.json(deck);
  });

  app.post("/decks/:playerId/:deckId/select", (req: Request, res: Response) => {
    const deck = selectDeck(req.params.playerId, req.params.deckId);
    if (deck === null) {
      res.status(404).json({ code: "NO_DECK", message: "unknown deck" });
      return;
    }
    res.json({ activeDeckId: deck.id, activeDeck: deck });
  });

  app.delete("/decks/:playerId/:deckId", (req: Request, res: Response) => {
    const ok = deleteDeck(req.params.playerId, req.params.deckId);
    if (!ok) {
      res.status(400).json({ code: "NO_DECK", message: "unknown deck, or it is the only one left" });
      return;
    }
    res.json({ ok: true, decks: listDecks(req.params.playerId) });
  });

  // Legacy single active deck (Phase 7 contract). O(k<=8).
  app.post("/deck", async (req: Request, res: Response) => {
    const pid = authPlayerId(req);
    const cards = (req.body as { cards?: unknown })?.cards;
    if (!pid || !Array.isArray(cards) || cards.length !== 8) {
      res.status(400).json({ code: "BAD_DECK", message: "playerId + exactly 8 cards required" });
      return;
    }
    const ids = cards.map((c) => String(c));
    const player = ensurePlayer(pid);
    const deck = player.activeDeckId
      ? updateDeck(pid, player.activeDeckId, { cards: ids })
      : createDeck(pid, "Battle Deck", ids);
    await saveDeck(pid, ids);
    res.json(deck ?? { cards: ids });
  });

  /** Match report: trophies + coins for both sides. O(1) per player. */
  app.post("/matches/report", (req: Request, res: Response) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const blueId = typeof b.blueId === "string" ? b.blueId : null;
    const redId = typeof b.redId === "string" ? b.redId : null;
    const winner = (typeof b.winner === "string" ? b.winner : "draw") as "blue" | "red" | "draw";
    const blueCrowns = Number(b.blueCrowns ?? 0) || 0;
    const redCrowns = Number(b.redCrowns ?? 0) || 0;
    const deltas = applyMatchResult({
      blueId,
      redId,
      winner,
      crowns: { blue: blueCrowns, red: redCrowns },
    });
    const row = recordMatch({
      blueId,
      redId,
      blueCrowns,
      redCrowns,
      winner,
      durationMs: Number(b.durationMs ?? 0) || 0,
      season: typeof b.season === "string" ? b.season : SEASON,
    });
    res.json({ ...row, deltas });
  });

  /**
 * Match roster lookup: who is blue, who is red. The battle screen uses it to
 * show the opponent's real name when the redirect URL did not carry it.
 * O(p) with p = 2 players.
 */
app.get("/match/:matchId", (req: Request, res: Response) => {
  const room = getRoom(req.params.matchId);
  if (room === undefined) {
    res.status(404).json({ code: "NO_MATCH", message: "unknown match" });
    return;
  }
  res.json({
    matchId: room.matchId,
    blueId: room.players.find((p) => p.side === "blue")?.playerId ?? null,
    redId: room.players.find((p) => p.side === "red")?.playerId ?? null,
    winner: room.state.winner ?? null,
  });
});

/**
 * The player's running match, if any. The client guard polls this on every
 * screen and sends the player back into the battle (which kept simulating in
 * the background). O(rooms + players).
 */
app.get("/match/active/:playerId", (req: Request, res: Response) => {
  const active = getActiveMatchForPlayer(req.params.playerId);
  if (active === undefined) {
    res.json({ active: false });
    return;
  }
  res.json({ active: true, ...active, elapsedMs: Math.max(0, Date.now() - active.startedAtMs) });
});

app.get("/season", (_req: Request, res: Response) => {
    res.json({ season: SEASON, name: "Season 1: Goblin Stadium", endsAt: null });
  });
}
