import type { ReactNode } from "react";
import TopBar from "./TopBar";
import BottomNav, { type BottomNavKey } from "./BottomNav";
import { crBgStyle } from "../../lib/crTheme";

export interface PageShellProps {
  children: ReactNode;
  active?: BottomNavKey;
  topBarCurrencies?: { cards: number; coins: number; gems: number };
  showTopBar?: boolean;
  showNav?: boolean;
}

// Page frame shared by every screen: diamond-plate bg + top bar + 5-tab bottom nav.
export default function PageShell({
  children,
  active,
  topBarCurrencies = { cards: 0, coins: 0, gems: 0 },
  showTopBar = true,
  showNav = true,
}: PageShellProps) {
  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col text-white"
      style={crBgStyle()}
    >
      {showTopBar && <TopBar cards={topBarCurrencies.cards} coins={topBarCurrencies.coins} gems={topBarCurrencies.gems} />}
      <main className="flex-1 overflow-y-auto">{children}</main>
      {showNav && <BottomNav active={active} />}
    </div>
  );
}
