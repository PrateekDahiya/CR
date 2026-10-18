/**
 * shop.ts — working in-game economy: daily deals, coin/gem bundles, card packs.
 *
 * Prices are charged against the player wallet in players.ts (never trusted from
 * the client), grants go through the same store, and every mutation is O(1)
 * except pack opening (O(k) over the catalog).
 */

import type { Express, Request, Response } from "express";
import { CARDS } from "./game/cards.js";
import {
  adjustWallet,
  allCardIds,
  createDeck,
  ensurePlayer,
  grantCards,
  ownsCard,
  REWARDS,
} from "./players.js";
import { authPlayerId } from "./auth.js";

export interface ShopItem {
  id: string;
  name: string;
  kind: "coins" | "gems" | "cards" | "gold";
  /** What you receive. */
  amount: number;
  cardId?: string;
  /** Currency to pay with. */
  price: number;
  currency: "coins" | "gems";
  /** Packs open for a random card instead of a fixed one. */
  pack?: boolean;
  rare?: boolean;
}

/**
 * Fixed shelf. Prices are server-owned so a client cannot invent a cheaper buy.
 * `currency: "coins"` maps to the in-game gold coin (the CR "gold" shop tab).
 */
const SHOP_ITEMS: ShopItem[] = [
  { id: "coins-500", name: "500 Coins", kind: "coins", amount: 500, price: 5, currency: "gems" },
  { id: "coins-1200", name: "1,200 Coins", kind: "coins", amount: 1200, price: 12, currency: "gems" },
  { id: "coins-2500", name: "2,500 Coins", kind: "coins", amount: 2500, price: 25, currency: "gems" },
  { id: "gems-80", name: "80 Gems", kind: "gems", amount: 80, price: 1000, currency: "coins" },
  { id: "gems-500", name: "500 Gems", kind: "gems", amount: 500, price: 4500, currency: "coins" },
  { id: "pack-basic", name: "Basic Pack", kind: "cards", amount: 1, price: 1000, currency: "coins", pack: true },
  { id: "pack-rare", name: "Rare Pack", kind: "cards", amount: 1, price: 2500, currency: "coins", pack: true, rare: true },
  { id: "pack-epic", name: "Epic Pack", kind: "cards", amount: 1, price: 6000, currency: "coins", pack: true, rare: true },
];

/** Rarity of a card id (used by pack weighting). O(1). */
function rarityOf(cardId: string): string {
  return CARDS[cardId]?.rarity ?? "common";
}

const RARITY_WEIGHTS: Record<string, number> = {
  common: 60,
  rare: 28,
  epic: 9,
  legendary: 2.6,
  champion: 0.4,
};

/** Weighted random card from the catalog. O(n) over ~108 ids. */
function rollCard(rareBoost: boolean): string {
  const ids = allCardIds();
  const weights = ids.map((id) => {
    const base = RARITY_WEIGHTS[rarityOf(id)] ?? 1;
    const rarity = rarityOf(id);
    return rareBoost && rarity !== "common" ? base * 2.5 : base;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < ids.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return ids[i] as string;
  }
  return "knight";
}

/** Daily deals: stable per calendar day so every player sees the same shelf. */
function dailyDeals(dayMs: number): ShopItem[] {
  const ids = allCardIds();
  const day = Math.floor(dayMs / 86_400_000);
  const out: ShopItem[] = [];
  for (let i = 0; i < 4; i += 1) {
    const idx = (day * 7 + i * 13) % ids.length;
    const cardId = ids[idx] as string;
    const discount = 0.4 + ((day + i) % 4) * 0.15;
    const base = 200 + CARDS[cardId].cost * 120;
    out.push({
      id: `deal-${cardId}`,
      name: cardId.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" "),
      kind: "cards",
      amount: 1,
      cardId,
      price: Math.round(base * discount),
      currency: "coins",
    });
  }
  return out;
}

function findItem(id: string, nowMs: number): ShopItem | undefined {
  return [...dailyDeals(nowMs), ...SHOP_ITEMS].find((i) => i.id === id);
}

export function mountShop(app: Express): void {
  // O(n) shelf build, n = deals + items (small, cached per day by the client).
  app.get("/shop", (req: Request, res: Response) => {
    const now = Date.now();
    const pid = authPlayerId(req);
    const player = pid === null ? null : ensurePlayer(pid);
    res.json({
      deals: dailyDeals(now),
      items: SHOP_ITEMS,
      rewards: REWARDS,
      wallet: player === null ? null : { coins: player.coins, gems: player.gems },
      owned: player === null ? {} : { ...player.cards },
    });
  });

  // O(1) wallet check + grant. Prices come from the server table, never the client.
  app.post("/shop/buy", (req: Request, res: Response) => {
    const pid = authPlayerId(req);
    if (pid === null) {
      res.status(401).json({ code: "NO_PLAYER", message: "playerId required" });
      return;
    }
    const itemId = String((req.body as { itemId?: unknown })?.itemId ?? "");
    const item = findItem(itemId, Date.now());
    if (item === undefined) {
      res.status(404).json({ code: "NO_ITEM", message: `unknown item ${itemId}` });
      return;
    }
    if (item.kind === "cards" && !item.pack && item.cardId !== undefined && ownsCard(pid, item.cardId)) {
      res.status(409).json({ code: "OWNED", message: "card already owned" });
      return;
    }
    const paid = adjustWallet(pid, item.currency === "gems" ? { gems: -item.price } : { coins: -item.price });
    if (!paid) {
      res.status(400).json({ code: "NO_FUNDS", message: `not enough ${item.currency}` });
      return;
    }
    if (item.pack === true) {
      const cardId = rollCard(item.rare === true);
      grantCards(pid, [cardId], item.rare === true ? 2 : 1);
      const player = ensurePlayer(pid);
      res.json({ ok: true, granted: { cardId, kind: "cards" }, wallet: { coins: player.coins, gems: player.gems } });
      return;
    }
    if (item.kind === "coins") adjustWallet(pid, { coins: item.amount });
    else if (item.kind === "gems") adjustWallet(pid, { gems: item.amount });
    else if (item.cardId !== undefined) grantCards(pid, [item.cardId], 1);
    const player = ensurePlayer(pid);
    res.json({ ok: true, granted: item, wallet: { coins: player.coins, gems: player.gems } });
  });

  /** Copy an owned card into a new deck (shop "add to deck" shortcut). O(d). */
  app.post("/shop/add-to-deck", (req: Request, res: Response) => {
    const pid = authPlayerId(req);
    if (pid === null) {
      res.status(401).json({ code: "NO_PLAYER", message: "playerId required" });
      return;
    }
    const body = req.body as { cardId?: unknown; deckName?: unknown };
    const cardId = String(body?.cardId ?? "");
    if (!ownsCard(pid, cardId)) {
      res.status(403).json({ code: "NOT_OWNED", message: "you do not own that card" });
      return;
    }
    const deck = createDeck(pid, typeof body?.deckName === "string" ? body.deckName : `Deck with ${cardId}`);
    const player = ensurePlayer(pid);
    res.json({ ok: true, deck, wallet: { coins: player.coins, gems: player.gems } });
  });
}