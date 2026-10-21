"use client";

import { useEffect, useState } from "react";
import { RARITY_BG, RARITY_BORDER, RARITY_RUNE } from "../../lib/crTheme";
import CardArt from "./CardArt";

export interface CardStats {
  hitPoints?: number;
  damage?: number;
  dps?: number;
  hitSpeedSec?: number;
  speedLabel?: string;
  rangeTiles?: number;
  targets?: string;
  unitCount?: number;
  radiusTiles?: number;
  towerDamage?: number;
  description?: string;
  splashRadius?: number;
  dashDamage?: number;
  dashRadius?: number;
  chargeDamage?: number;
  deathDamage?: number;
  spawnDamage?: number;
  shieldHp?: number;
}

export interface CardInfoOverlayProps {
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "champion";
  cardType: "troop" | "spell" | "building";
  elixir: number;
  level?: number;
  stats?: CardStats;
  description?: string;
  onClose: () => void;
  onUse?: () => void;
  onRemove?: () => void;
  onUpgrade?: () => void;
  /** Coin cost for the next level. */
  upgradeCost?: number;
  /** True when the card is already at max level (disables Upgrade). */
  maxLevel?: boolean;
  /** True when the card already sits in My Deck (enables the Remove button). */
  inDeck?: boolean;
}

// Card detail popup (docs/gameUI/Screenshot_20261017_123447): big rarity-framed
// art on the left, name + level + rarity/type/elixir chips + stat rows on the
// right, Star Level / Upgrade / Use / Remove buttons underneath. Same navy +
// gold + rarity palette as the rest of the app. O(1) per render; Escape closes.
export default function CardInfoOverlay({
  name,
  rarity,
  cardType,
  elixir,
  level = 0,
  stats,
  description,
  onClose,
  onUse,
  onRemove,
  onUpgrade,
  upgradeCost,
  maxLevel = false,
  inDeck = false,
}: CardInfoOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [tab, setTab] = useState<"stats" | "description">("stats");

  useEffect(() => {
    setTab("stats");
  }, [name]);

  const bg = RARITY_BG[rarity] ?? RARITY_BG.common;
  const border = RARITY_BORDER[rarity] ?? RARITY_BORDER.common;
  const rune = RARITY_RUNE[rarity] ?? "💠";
  const shownLevel = level || 13;
  const displayName = name
    .split("-")
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace("Mini Pekka", "Mini P.E.K.K.A");

  const rows: { label: string; value: string }[] = [];
  if (stats?.hitPoints) rows.push({ label: "Hitpoints", value: String(stats.hitPoints) });
  if (stats?.damage) rows.push({ label: "Damage", value: String(stats.damage) });
  if (stats?.dps) rows.push({ label: "DPS", value: String(stats.dps) });
  if (stats?.hitSpeedSec) rows.push({ label: "Hit Speed", value: `${stats.hitSpeedSec}s` });
  if (stats?.speedLabel) rows.push({ label: "Speed", value: stats.speedLabel });
  if (stats?.rangeTiles) rows.push({ label: "Range", value: `${stats.rangeTiles} tiles` });
  if (stats?.radiusTiles) rows.push({ label: "Radius", value: `${stats.radiusTiles} tiles` });
  if (stats?.splashRadius) rows.push({ label: "Splash Radius", value: `${stats.splashRadius} tiles` });
  if (stats?.towerDamage) rows.push({ label: "Tower Damage", value: String(stats.towerDamage) });
  if (stats?.dashDamage) rows.push({ label: "Dash Damage", value: String(stats.dashDamage) });
  if (stats?.dashRadius) rows.push({ label: "Dash Radius", value: `${stats.dashRadius} tiles` });
  if (stats?.chargeDamage) rows.push({ label: "Charge Damage", value: String(stats.chargeDamage) });
  if (stats?.deathDamage) rows.push({ label: "Death Damage", value: String(stats.deathDamage) });
  if (stats?.spawnDamage) rows.push({ label: "Spawn Damage", value: String(stats.spawnDamage) });
  if (stats?.shieldHp) rows.push({ label: "Shield HP", value: String(stats.shieldHp) });
  if (stats?.unitCount && stats.unitCount > 1) {
    rows.push({ label: "Count", value: `x${stats.unitCount}` });
  }
  if (stats?.targets) rows.push({ label: "Targets", value: stats.targets });

  return (
    <div
      data-testid="card-info-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b1c]/85 p-3 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        data-testid="card-info-panel"
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border-4 border-slate-600/80 bg-gradient-to-b from-[#1b2f5c] to-[#0a1730] pb-3 shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title strip */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-amber-500/30 bg-gradient-to-r from-[#24407a] to-[#12224a] px-3 py-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-300">
            Card Info
          </span>
          <button
            type="button"
            data-testid="card-info-close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md border-2 border-rose-800 bg-gradient-to-b from-rose-400 to-rose-700 text-lg font-black leading-none text-white active:translate-y-0.5"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Art + facts */}
        <div className="grid grid-cols-[auto_1fr] gap-3 px-3 pt-3">
          <div className="relative">
            <div
              className={`absolute inset-0 -z-10 rounded-2xl bg-gradient-to-b ${bg} opacity-60 blur-md`}
              aria-hidden="true"
            />
            <CardArt
              name={name}
              rarity={rarity}
              cost={elixir}
              level={shownLevel}
              size="lg"
              showLevel={shownLevel > 0}
              showCost={elixir > 0}
            />
          </div>
          <div className="min-w-0">
            <h2 data-testid="card-info-name" className="text-xl font-extrabold leading-tight text-white">
              {displayName}
            </h2>
            <p data-testid="card-info-level" className="text-xs font-bold text-sky-300">
              Level {shownLevel}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                data-testid="card-info-rarity"
                className={`inline-flex items-center gap-1 rounded-md border-2 ${border} bg-gradient-to-b ${bg} px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white`}
              >
                <span aria-hidden="true">{rune}</span>
                {rarity}
              </span>
              <span
                data-testid="card-info-type"
                className="rounded-md border-2 border-slate-500 bg-gradient-to-b from-slate-600 to-slate-800 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white"
              >
                {cardType}
              </span>
              <span
                data-testid="card-info-elixir"
                className="rounded-full bg-gradient-to-b from-fuchsia-400 to-purple-700 px-2 py-0.5 text-[10px] font-extrabold text-white shadow"
              >
                {elixir} elixir
              </span>
            </div>
          </div>
        </div>

        {/* Stats / Description tabs */}
        <div className="mx-3 mt-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-600/60 bg-[#0d1a38]/80 p-1" data-testid="card-info-tabs">
          <button
            type="button"
            data-testid="card-info-tab-stats"
            onClick={() => setTab("stats")}
            className={`rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
              tab === "stats" ? "bg-amber-400 text-amber-950" : "text-slate-300"
            }`}
          >
            Stats
          </button>
          <button
            type="button"
            data-testid="card-info-tab-description"
            onClick={() => setTab("description")}
            className={`rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
              tab === "description" ? "bg-amber-400 text-amber-950" : "text-slate-300"
            }`}
          >
            Description
          </button>
        </div>

        {tab === "stats" ? (
          rows.length > 0 ? (
            <ul
              data-testid="card-info-stats"
              className="mx-3 mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-slate-600/60 bg-[#0d1a38]/80 px-2 py-1.5"
            >
              {rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-slate-400">{r.label}</span>
                  <span className="font-bold text-slate-100">{r.value}</span>
                </li>
              ))}
            </ul>
          ) : null
        ) : (
          <p
            data-testid="card-info-description"
            className="mx-3 mt-2 min-h-[72px] rounded-lg border border-slate-600/60 bg-[#0d1a38]/80 px-3 py-2 text-[12px] leading-relaxed text-slate-200"
          >
            {(description ?? stats?.description) && (description ?? stats?.description)!.length > 0
              ? (description ?? stats?.description)
              : "No description available for this card."}
          </p>
        )}

        {/* Actions */}
        <div className="mt-3 grid grid-cols-2 gap-2 px-3">
          <button
            type="button"
            data-testid="card-info-star-level"
            className="rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-700 px-2 py-1.5 text-center text-white shadow-md active:translate-y-0.5"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wide">Star Level 1</div>
            <div className="text-xs font-extrabold">5000 🪙</div>
          </button>
          <button
            type="button"
            data-testid="card-info-upgrade"
            onClick={maxLevel ? undefined : onUpgrade}
            disabled={maxLevel}
            className={[
              "rounded-xl border-b-4 px-2 py-1.5 text-center text-white shadow-md active:translate-y-0.5",
              maxLevel
                ? "cursor-not-allowed border-slate-800 bg-gradient-to-b from-slate-500 to-slate-700 opacity-60"
                : "border-purple-800 bg-gradient-to-b from-purple-400 to-purple-700",
            ].join(" ")}
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wide">{maxLevel ? "Max Level" : "Upgrade"}</div>
            <div className="text-xs font-extrabold">{maxLevel ? "MAX" : `${upgradeCost ?? 200} 🪙`}</div>
          </button>
          {/* Use is hidden for cards that are already in My Deck — the card is
              already there, so only Move/Remove actions make sense. */}
          {onUse && !inDeck && (
            <button
              type="button"
              data-testid="card-info-use"
              onClick={onUse}
              className="rounded-xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 px-2 py-2 text-center text-amber-950 shadow-md active:translate-y-0.5"
            >
              <div className="text-sm font-extrabold uppercase tracking-wide">Use</div>
              <div className="text-[10px] font-bold">{inDeck ? "Move / Replace" : "Add to deck"}</div>
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              data-testid="card-info-remove"
              onClick={onRemove}
              className="rounded-xl border-b-4 border-rose-800 bg-gradient-to-b from-rose-400 to-rose-700 px-2 py-2 text-center text-white shadow-md active:translate-y-0.5"
            >
              <div className="text-sm font-extrabold uppercase tracking-wide">Remove</div>
              <div className="text-[10px] font-bold">From My Deck</div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}