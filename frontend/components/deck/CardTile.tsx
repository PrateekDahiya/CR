"use client";

import type { CardInfo } from "../../lib/cards";

interface CardTileProps {
  card: CardInfo;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: (id: string) => void;
}

function formatDps(card: CardInfo): string {
  if (card.type === "spell") return "—";
  return card.dps >= 100 ? card.dps.toFixed(0) : card.dps.toFixed(1);
}

function formatHp(card: CardInfo): string {
  if (card.type === "spell") return "—";
  const total = card.hp * Math.max(1, card.count);
  if (card.count > 1) return `${card.hp}x${card.count}=${total}`;
  return `${total}`;
}

const TYPE_BADGE: Record<CardInfo["type"], string> = {
  troop: "bg-emerald-900 text-emerald-200",
  spell: "bg-purple-900 text-purple-200",
  building: "bg-amber-900 text-amber-200",
};

export default function CardTile({ card, selected = false, disabled = false, onToggle }: CardTileProps) {
  const isSpell = card.type === "spell";
  return (
    <button
      type="button"
      disabled={disabled && !selected}
      onClick={() => onToggle?.(card.id)}
      title={`${card.name} (${card.cost})`}
      className={[
        "flex flex-col rounded-xl border p-2 text-left transition",
        selected
          ? "border-blue-500 bg-blue-950 shadow-lg"
          : "border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-750",
        disabled && !selected ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
          {card.cost}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_BADGE[card.type]}`}>
          {card.type}
        </span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100">{card.name}</div>
      <div className="mt-1 space-y-0.5 text-[11px] leading-tight text-slate-300">
        <div className="flex justify-between">
          <span className="text-slate-400">HP</span>
          <span className="font-mono">{formatHp(card)}</span>
        </div>
        {isSpell ? (
          <div className="flex justify-between">
            <span className="text-slate-400">DMG</span>
            <span className="font-mono">{card.damage}</span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-slate-400">DPS</span>
            <span className="font-mono">{formatDps(card)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-400">{isSpell ? "Radius" : card.count > 1 ? "Count" : "Range"}</span>
          <span className="font-mono">{isSpell ? card.radius.toFixed(1) : card.count > 1 ? `x${card.count}` : card.range.toFixed(1)}</span>
        </div>
      </div>
    </button>
  );
}
