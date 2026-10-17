"use client";

import { CR_COLORS } from "../../lib/crTheme";

export type TopBarCurrencies = { cards: number; coins: number; gems: number };

export default function TopBar({ cards, coins, gems }: TopBarCurrencies) {
  // O(1) render. Matches screenshot 01-08: dark-blue panel with 3 black pill boxes
  // containing gold coin / blue card / green gem icons and amounts.
  return (
    <div
      data-testid="topbar"
      className="flex items-center justify-between gap-2 border-b-2 border-amber-700/50 bg-gradient-to-b from-[#0a1730] to-[#102347] px-3 py-2 text-white shadow-md"
    >
      <div className="flex flex-1 items-center justify-end gap-2">
        <Pill icon="🃏" value={cards} tone="blue" testid="topbar-cards" />
        <Pill icon="🪙" value={coins} tone="gold" testid="topbar-coins" />
        <Pill icon="💎" value={gems} tone="emerald" testid="topbar-gems" />
      </div>
    </div>
  );
}

function Pill({ icon, value, tone, testid }: { icon: string; value: number; tone: "blue" | "gold" | "emerald"; testid: string }) {
  const colors: Record<typeof tone, string> = {
    blue: "from-sky-500 to-blue-700",
    gold: "from-amber-400 to-yellow-600",
    emerald: "from-emerald-400 to-green-700",
  } as const;
  return (
    <div
      data-testid={testid}
      className={`flex items-center gap-1 rounded-full border border-black/30 bg-gradient-to-b ${colors[tone]} px-2 py-1 text-sm font-extrabold text-white shadow-inner`}
      style={{ textShadow: "0 1px 0 rgba(0,0,0,0.6)" }}
    >
      <span aria-hidden="true" className="text-base">
        {icon}
      </span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
      <span aria-hidden="true" className="text-xs opacity-80">
        +
      </span>
    </div>
  );
}
