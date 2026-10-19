"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CR_COLORS } from "../../lib/crTheme";
import { usePlayer } from "../../lib/playerContext";

export type TopBarCurrencies = { cards: number; coins: number; gems: number };

/**
 * Top bar: player name + trophies on the left, owned-cards / coins / gems on the
 * right. Wallet numbers come from the live player profile (PlayerProvider) and
 * fall back to the props so static/Storybook renders still work. Tapping the
 * name opens an inline rename field. O(1) render.
 */
export default function TopBar({ cards, coins, gems }: TopBarCurrencies) {
  const { profile, setName } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (profile?.name) setDraft(profile.name);
  }, [profile?.name]);

  const name = profile?.name ?? "Player";
  const trophies = profile?.trophies ?? 0;
  const coinsValue = profile?.coins ?? coins;
  const gemsValue = profile?.gems ?? gems;
  const cardsValue = profile?.cardsOwned ?? cards;

  return (
    <div
      data-testid="topbar"
      className="flex items-center justify-between gap-2 border-b-2 border-amber-700/50 bg-gradient-to-b from-[#0a1730] to-[#102347] px-3 py-2 text-white shadow-md"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void setName(draft);
              setEditing(false);
            }}
            className="flex items-center gap-1"
          >
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              data-testid="topbar-name-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={16}
              className="w-24 rounded-md border border-amber-500/60 bg-[#0a1730] px-2 py-1 text-xs font-bold text-white outline-none"
            />
            <button
              type="submit"
              data-testid="topbar-name-save"
              className="rounded-md border border-emerald-700 bg-gradient-to-b from-emerald-400 to-emerald-700 px-2 py-1 text-[10px] font-extrabold uppercase text-white"
            >
              Save
            </button>
          </form>
        ) : (
          <button
            type="button"
            data-testid="topbar-player"
            onClick={() => setEditing(true)}
            title="Tap to rename"
            className="flex min-w-0 items-center gap-1 rounded-full border border-amber-500/40 bg-[#0d1a38]/90 px-2 py-1"
          >
            <span data-testid="topbar-name" className="max-w-[90px] truncate text-xs font-extrabold text-white">
              {name}
            </span>
            <span data-testid="topbar-trophies" className="text-[11px] font-bold text-amber-300">
              🏆 {trophies.toLocaleString()}
            </span>
          </button>
        )}
      </div>
      <div className="flex flex-1 items-center justify-end gap-2">
        <Pill icon="?" value={cardsValue} tone="blue" testid="topbar-cards" href="/collection" />
        <Pill icon="?" value={coinsValue} tone="gold" testid="topbar-coins" href="/shop" />
        <Pill icon="?" value={gemsValue} tone="emerald" testid="topbar-gems" href="/shop" />
      </div>
    </div>
  );
}

function Pill({
  icon,
  value,
  tone,
  testid,
  href,
}: {
  icon: string;
  value: number;
  tone: "blue" | "gold" | "emerald";
  testid: string;
  href: string;
}) {
  const colors: Record<typeof tone, string> = {
    blue: "from-sky-500 to-blue-700",
    gold: "from-amber-400 to-yellow-600",
    emerald: "from-emerald-400 to-green-700",
  } as const;
  return (
    <Link
      href={href}
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
    </Link>
  );
}