import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CARDS } from "../src/game/cards.js";
import { RARITY_DEAL_PRICE, SHOP_ITEMS, dailyDeals } from "../src/shop.js";

describe("shop offers", () => {
  it("daily deals contain only unowned, non-tower cards priced by rarity", () => {
    const deals = dailyDeals(Date.UTC(2026, 9, 20), {});
    assert.ok(deals.length > 0);
    for (const deal of deals) {
      assert.ok(deal.cardId);
      assert.notEqual(CARDS[deal.cardId]?.type, "tower");
      const rarity = CARDS[deal.cardId]?.rarity ?? "common";
      assert.equal(deal.price, RARITY_DEAL_PRICE[rarity]);
    }
  });

  it("daily deals omit cards the player already owns", () => {
    const owned: Record<string, number> = {};
    for (const card of Object.values(CARDS)) {
      if (card.type !== "tower" && card.id !== "knight") owned[card.id] = 9;
    }
    const deals = dailyDeals(Date.UTC(2026, 9, 20), owned);
    assert.deepEqual(deals.map((d) => d.cardId), ["knight"]);
  });

  it("keeps the 100-coins-per-gem bundle ratio and includes large tiers", () => {
    const coinBundles = SHOP_ITEMS.filter((item) => item.kind === "coins");
    for (const bundle of coinBundles) {
      assert.equal(bundle.amount / bundle.price, 100, `${bundle.id} ratio`);
    }
    assert.ok(coinBundles.some((bundle) => bundle.amount === 50_000));
    assert.ok(coinBundles.some((bundle) => bundle.amount === 100_000));
  });
});
