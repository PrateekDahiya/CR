"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageShell, CardTile, CRButton, ActionToast } from "../../components/ui";
import {
  ApiError,
  backendUrl,
  buyShopItem,
  getShop,
  type ShopData,
  type ShopItem,
} from "../../lib/api";
import { CARDS } from "../../lib/cards";
import { usePlayer } from "../../lib/playerContext";

/**
 * Shop: server-owned prices, wallet checks, daily deals restricted to cards the
 * player does not own, larger coin bundles for high-level upgrades, packs that
 * distinguish "new" from "upgraded", and a crown-tower management shortcut.
 */
export default function ShopPage() {
  const [data, setData] = useState<ShopData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ cardId: string; level: number; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playerId, refresh } = usePlayer();

  const say = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await getShop(backendUrl()));
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, playerId]);

  const buy = async (item: ShopItem) => {
    setBusy(item.id);
    try {
      const res = await buyShopItem(item.id, backendUrl());
      await Promise.all([load(), refresh()]);
      if (res.granted?.kind === "cards" && res.granted.cardId) {
        const isNew = res.granted.isNew === true;
        setOpened({ cardId: res.granted.cardId, level: res.granted.level ?? 1, isNew });
        say(isNew ? `${pretty(res.granted.cardId)} unlocked!` : `${pretty(res.granted.cardId)} upgraded`);
      } else {
        say(`${item.name} purchased`);
      }
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "ERROR";
      say(code === "NO_FUNDS" ? "Not enough coins/gems" : code === "OWNED" ? "You already own that card" : "Purchase failed");
    } finally {
      setBusy(null);
    }
  };

  const coins = data?.wallet?.coins ?? 0;
  const gems = data?.wallet?.gems ?? 0;
  const owned = data?.owned ?? {};
  const towerLevels = data?.towerLevels ?? {};

  const packs = useMemo(() => (data?.items ?? []).filter((i) => i.pack === true), [data]);
  const bundles = useMemo(() => (data?.items ?? []).filter((i) => i.pack !== true), [data]);
  const coinBundles = useMemo(() => bundles.filter((b) => b.kind === "coins"), [bundles]);
  const gemBundles = useMemo(() => bundles.filter((b) => b.kind === "gems"), [bundles]);
  const towers = useMemo(() => Object.values(CARDS).filter((c) => c.type === "tower"), []);

  return (
    <PageShell active="shop" topBarCurrencies={{ cards: Object.keys(owned).length, coins, gems }}>
      <div className="px-3 py-3">
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Shop</h1>
          <span className="text-[11px] font-bold text-slate-400">Prices are server-owned</span>
        </header>

        <div
          data-testid="shop-wallet"
          className="mb-3 flex items-center justify-between rounded-xl border border-amber-500/40 bg-[#12224a]/90 px-3 py-2"
        >
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-200">My Wallet</span>
          <span className="flex items-center gap-3 text-sm font-extrabold">
            <span data-testid="shop-coins" className="text-amber-300">
              {coins.toLocaleString()} coins
            </span>
            <span data-testid="shop-gems" className="text-fuchsia-300">
              {gems.toLocaleString()} gems
            </span>
          </span>
        </div>

        {/* Daily Deals: server returns only cards the player does not own. */}
        <section
          className="rounded-xl border-2 border-emerald-700 bg-gradient-to-b from-emerald-900/50 to-emerald-950/40 p-3"
          data-testid="shop-deals"
        >
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-white">Daily Deals</h2>
            <span className="text-[11px] text-emerald-200">Unowned cards only</span>
          </header>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(data?.deals ?? []).map((d) => {
              const card = d.cardId ? CARDS[d.cardId] : undefined;
              const affordable = d.currency === "gems" ? gems >= d.price : coins >= d.price;
              return (
                <div
                  key={d.id}
                  data-testid={`deal-${d.cardId ?? d.id}`}
                  className="flex flex-col items-center justify-between rounded-lg border border-emerald-500/60 bg-emerald-700/25 p-1.5 text-center"
                >
                  <CardTile
                    name={d.cardId ?? "knight"}
                    rarity={(card?.rarity ?? "common") as never}
                    cost={card?.cost ?? 0}
                    level={0}
                    size="sm"
                    testId={`deal-card-${d.cardId ?? d.id}`}
                    className="pointer-events-none"
                  />
                  <div className="mt-1 truncate text-[10px] font-extrabold text-white">{d.name}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-emerald-200">
                    {card?.rarity ?? "common"}
                  </div>
                  <div className={`text-[11px] font-extrabold ${affordable ? "text-amber-300" : "text-rose-300"}`}>
                    {d.price.toLocaleString()} coins
                  </div>
                  <button
                    type="button"
                    data-testid={`deal-buy-${d.cardId ?? d.id}`}
                    disabled={busy === d.id || !affordable}
                    onClick={() => void buy(d)}
                    className="mt-1 w-full rounded-md border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 py-1 text-[10px] font-extrabold uppercase text-amber-950 disabled:border-slate-600 disabled:from-slate-500 disabled:to-slate-700 disabled:text-slate-300"
                  >
                    {busy === d.id ? "..." : "Buy"}
                  </button>
                </div>
              );
            })}
          </div>
          {(data?.deals ?? []).length === 0 && (
            <p className="py-4 text-center text-xs font-bold text-emerald-100/80">
              You already own every card available in today&apos;s deals.
            </p>
          )}
        </section>

        {/* Packs */}
        <section
          className="mt-3 rounded-xl border-2 border-purple-700 bg-gradient-to-b from-purple-900/40 to-purple-950/40 p-3"
          data-testid="shop-trader"
        >
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-white">Packs</h2>
            <span className="text-[11px] text-purple-200">New unlock or level-up</span>
          </header>
          <div className="grid grid-cols-3 gap-2">
            {packs.map((p) => {
              const affordable = p.currency === "gems" ? gems >= p.price : coins >= p.price;
              const detail = p.id === "pack-basic" ? "1 random card" : p.id === "pack-rare" ? "+2 levels" : "+2 levels, rare odds";
              return (
                <div
                  key={p.id}
                  data-testid={`pack-${p.id}`}
                  className="rounded-lg border border-purple-500/60 bg-purple-900/30 p-2 text-center"
                >
                  <div className="text-[11px] font-extrabold text-white">{p.name}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-purple-200">{detail}</div>
                  <div className={`text-xs font-extrabold ${affordable ? "text-amber-300" : "text-rose-300"}`}>
                    {p.price.toLocaleString()} coins
                  </div>
                  <button
                    type="button"
                    data-testid={`pack-buy-${p.id}`}
                    disabled={!affordable || busy === p.id}
                    onClick={() => void buy(p)}
                    className="mt-1 w-full rounded-md border-b-4 border-purple-800 bg-gradient-to-b from-purple-400 to-purple-700 py-1 text-[10px] font-extrabold uppercase text-white disabled:border-slate-600 disabled:from-slate-500 disabled:to-slate-700"
                  >
                    {busy === p.id ? "..." : "Open"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Crown towers: progression lives in the Decks > Towers tab. */}
        <section
          className="mt-3 rounded-xl border-2 border-cyan-700 bg-gradient-to-b from-cyan-900/40 to-cyan-950/40 p-3"
          data-testid="shop-towers"
        >
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white">Crown Towers</h2>
            <Link href="/decks" className="text-[11px] font-bold text-cyan-200 underline">
              Manage towers
            </Link>
          </header>
          <div className="grid grid-cols-4 gap-2">
            {towers.map((tower) => (
              <div key={tower.id} className="flex flex-col items-center justify-between rounded-lg border border-cyan-500/50 bg-cyan-900/25 p-1.5 text-center">
                <CardTile
                  name={tower.id}
                  rarity={tower.rarity}
                  cost={tower.cost}
                  level={towerLevels[tower.id] ?? 1}
                  size="sm"
                  testId={`shop-tower-${tower.id}`}
                  className="pointer-events-none"
                />
                <div className="mt-1 truncate text-[9px] font-extrabold text-white">{pretty(tower.id)}</div>
                <div className="text-[9px] font-bold text-cyan-200">Lv {towerLevels[tower.id] ?? 1}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Bundles: original 1 gem : 100 coins ratio, plus larger tiers. */}
        <section className="mt-3 rounded-xl border-2 border-sky-700 bg-gradient-to-b from-sky-900/40 to-sky-950/40 p-3">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white">Coin Bundles</h2>
            <span className="text-[11px] text-sky-200">100 coins per gem</span>
          </header>
          <div className="grid grid-cols-2 gap-2">
            {coinBundles.map((b) => {
              const affordable = gems >= b.price;
              return (
                <div
                  key={b.id}
                  data-testid={`bundle-${b.id}`}
                  className="rounded-lg border border-sky-500/60 bg-sky-900/30 p-2 text-center"
                >
                  <div className="text-[11px] font-extrabold text-white">{b.name}</div>
                  <div className={`text-xs font-extrabold ${affordable ? "text-amber-300" : "text-rose-300"}`}>
                    {b.price.toLocaleString()} gems
                  </div>
                  <button
                    type="button"
                    data-testid={`bundle-buy-${b.id}`}
                    disabled={!affordable || busy === b.id}
                    onClick={() => void buy(b)}
                    className="mt-1 w-full rounded-md border-b-4 border-sky-800 bg-gradient-to-b from-sky-400 to-sky-600 py-1 text-[10px] font-extrabold uppercase text-white disabled:border-slate-600 disabled:from-slate-500 disabled:to-slate-700"
                  >
                    {busy === b.id ? "..." : "Buy"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-3 rounded-xl border-2 border-fuchsia-700 bg-gradient-to-b from-fuchsia-900/40 to-fuchsia-950/40 p-3">
          <h2 className="mb-2 text-lg font-extrabold text-white">Gem Bundles</h2>
          <div className="grid grid-cols-2 gap-2">
            {gemBundles.map((b) => {
              const affordable = coins >= b.price;
              return (
                <div
                  key={b.id}
                  data-testid={`bundle-${b.id}`}
                  className="rounded-lg border border-fuchsia-500/60 bg-fuchsia-900/30 p-2 text-center"
                >
                  <div className="text-[11px] font-extrabold text-white">{b.name}</div>
                  <div className={`text-xs font-extrabold ${affordable ? "text-amber-300" : "text-rose-300"}`}>
                    {b.price.toLocaleString()} coins
                  </div>
                  <button
                    type="button"
                    data-testid={`bundle-buy-${b.id}`}
                    disabled={!affordable || busy === b.id}
                    onClick={() => void buy(b)}
                    className="mt-1 w-full rounded-md border-b-4 border-fuchsia-800 bg-gradient-to-b from-fuchsia-400 to-fuchsia-700 py-1 text-[10px] font-extrabold uppercase text-white disabled:border-slate-600 disabled:from-slate-500 disabled:to-slate-700"
                  >
                    {busy === b.id ? "..." : "Buy"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mt-3 flex justify-center">
          <CRButton variant="blue" size="sm" href="/collection" testId="shop-open-collection">
            My Cards ({Object.keys(owned).length})
          </CRButton>
        </div>
      </div>

      {opened !== null && (
        <div
          data-testid="pack-result"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b1c]/90 p-4"
          onClick={() => setOpened(null)}
        >
          <div className="w-full max-w-[260px] rounded-2xl border-4 border-amber-500/80 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] p-4 text-center shadow-2xl">
            <h3
              data-testid="pack-result-title"
              className="text-lg font-extrabold uppercase tracking-wide text-amber-300"
            >
              {opened.isNew ? "New Card!" : "Card Upgraded!"}
            </h3>
            {opened.isNew && (
              <span
                data-testid="pack-result-new-tag"
                className="mt-1 inline-block rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-black uppercase text-white"
              >
                New
              </span>
            )}
            <div className="mt-3 flex justify-center">
              <CardTile
                name={opened.cardId}
                rarity={(CARDS[opened.cardId]?.rarity ?? "common") as never}
                cost={CARDS[opened.cardId]?.cost ?? 0}
                level={opened.level}
                size="lg"
                testId="pack-result-card"
                className="pointer-events-none"
              />
            </div>
            <p className="mt-2 text-sm font-extrabold text-white">{pretty(opened.cardId)}</p>
            <p className="text-xs font-bold text-sky-300">Level {opened.level}</p>
            <div className="mt-3 flex justify-center">
              <CRButton variant="gold" size="sm" testId="pack-result-close" onClick={() => setOpened(null)}>
                Nice!
              </CRButton>
            </div>
          </div>
        </div>
      )}

      <ActionToast message={toast} />
    </PageShell>
  );
}

function pretty(id: string): string {
  return id
    .split("-")
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace("Mini Pekka", "Mini P.E.K.K.A");
}
