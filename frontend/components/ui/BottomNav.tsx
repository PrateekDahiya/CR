"use client";

import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { key: "cards", label: "Cards", icon: "💰", route: "/decks" },
  { key: "collection", label: "Collection", icon: "🃏", route: "/collection" },
  { key: "battle", label: "Battle", icon: "⚡", route: "/lobby" },
  { key: "shop", label: "Shop", icon: "🛒", route: "/shop" },
  { key: "social", label: "Social", icon: "👥", route: "/social" },
  { key: "ranked", label: "Ranked", icon: "🏆", route: "/leaderboard" },
] as const;

export type BottomNavKey = (typeof TABS)[number]["key"];

// Bottom 5-tab nav from screenshots 01-08 (Cards / Collection / Battle / Social / Ranked).
// Active tab gets a yellow highlight; battle tab is the center "gold bolt" highlight.
export default function BottomNav({ active }: { active?: BottomNavKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const current =
    active ??
    (TABS.find((t) => pathname?.startsWith(t.route))?.key) ??
    "battle";
  return (
    <nav
      data-testid="bottom-nav"
      className="sticky bottom-0 z-30 grid grid-cols-6 border-t-2 border-amber-700/40 bg-gradient-to-b from-[#102347] to-[#0a1730] text-white shadow-[0_-4px_18px_rgba(0,0,0,0.55)]"
    >
      {TABS.map((t) => {
        const isActive = current === t.key;
        const isBattle = t.key === "battle";
        return (
          <button
            key={t.key}
            type="button"
            data-testid={`nav-tab-${t.key}`}
            onClick={() => router.push(t.route)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
              isActive ? "text-amber-300" : "text-white/85 hover:text-white"
            }`}
          >
            <span
              className={`grid place-items-center ${
                isBattle
                  ? "h-9 w-9 rounded-lg bg-gradient-to-b from-amber-300 to-amber-600 text-2xl text-amber-900 shadow-inner"
                  : isActive
                  ? "h-7 w-7 text-2xl"
                  : "h-7 w-7 text-2xl opacity-90"
              }`}
            >
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
