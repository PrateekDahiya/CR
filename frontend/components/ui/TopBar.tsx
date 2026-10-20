"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { invalidateApiCache } from "../../lib/api";
import { usePlayer } from "../../lib/playerContext";
import BattleLogPanel from "./BattleLogPanel";

export type TopBarCurrencies = { cards: number; coins: number; gems: number };

/**
 * Top bar: player name + trophies on the left, owned-cards / coins / gems and a
 * single menu button on the right. Wallet numbers come from the live player
 * profile (PlayerProvider) and fall back to the props for static renders.
 * Rename, admin, and logout live inside the menu to keep the bar uncluttered.
 */
export default function TopBar({ coins, gems }: TopBarCurrencies) {
  const { profile, setName } = usePlayer();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const logout = () => {
    try {
      window.localStorage.removeItem("cr-player-id");
      window.localStorage.removeItem("cr-name");
      window.sessionStorage.clear();
    } catch {
      // storage unavailable
    }
    invalidateApiCache();
    router.replace("/login");
  };

  useEffect(() => {
    if (profile?.name) setDraft(profile.name);
  }, [profile?.name]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  const name = profile?.name ?? "Player";
  const trophies = profile?.trophies ?? 0;
  const coinsValue = profile?.coins ?? coins;
  const gemsValue = profile?.gems ?? gems;

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
          <div
            data-testid="topbar-player"
            className="flex min-w-0 items-center gap-1 rounded-full border border-amber-500/40 bg-[#0d1a38]/90 px-2 py-1"
          >
            <span data-testid="topbar-name" className="max-w-[90px] truncate text-xs font-extrabold text-white">
              {name}
            </span>
            <span data-testid="topbar-trophies" className="text-[11px] font-bold text-amber-300">
              🏆 {trophies.toLocaleString()}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 items-center justify-end gap-2">
        <Pill icon={<CoinIcon />} value={coinsValue} tone="gold" testid="topbar-coins" href="/shop" />
        <Pill icon={<GemIcon />} value={gemsValue} tone="emerald" testid="topbar-gems" href="/shop" />
        {/* Battle log button (the icon row in the Clash Royale top bar). */}
        <button
          type="button"
          data-testid="topbar-battle-log"
          onClick={() => setLogOpen(true)}
          title="Battle Log"
          aria-label="Open battle log"
          className="grid h-7 w-7 place-items-center rounded-md border border-slate-500 bg-slate-800/80 text-white"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
            <path d="M5 3h11a2 2 0 0 1 2 2v2h-2V5H7v12h2v2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm14 4h1v12a2 2 0 0 1-2 2h-6v-2h6V7Zm-3 3h-2v2H9v2h5v-2h-2v-2Zm0 5h-2v2h5v-2h-3Z" />
          </svg>
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            data-testid="topbar-menu"
            title="Menu"
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-500 bg-slate-800/80 text-sm font-extrabold text-white"
          >
            ☰
          </button>
          {menuOpen && (
            <div
              data-testid="topbar-menu-panel"
              className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-slate-600 bg-[#0d1a38] shadow-xl"
            >
              <button
                type="button"
                data-testid="topbar-rename"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                className="block w-full px-3 py-2 text-left text-xs font-bold text-white hover:bg-slate-700/70"
              >
                Rename player
              </button>
              {profile?.admin === true && (
                <Link
                  href="/admin"
                  data-testid="topbar-admin"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-3 py-2 text-left text-xs font-bold text-rose-200 hover:bg-slate-700/70"
                >
                  Admin dashboard
                </Link>
              )}
              <button
                type="button"
                data-testid="topbar-logout"
                onClick={logout}
                className="block w-full border-t border-slate-700 px-3 py-2 text-left text-xs font-bold text-rose-300 hover:bg-slate-700/70"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
      {logOpen ? (
        <BattleLogPanel
          playerId={profile?.playerId ?? ""}
          onClose={() => setLogOpen(false)}
          onPractice={() => {
            setLogOpen(false);
            router.push("/battle");
          }}
        />
      ) : null}
    </div>
  );
}

/** Gold coin (inline SVG so the top bar never depends on emoji fonts). */
function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" fill="#ffd24a" stroke="#a16207" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="#a16207" strokeWidth="1.2" />
    </svg>
  );
}

/** Emerald gem (inline SVG so the top bar never depends on emoji fonts). */
function GemIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path d="M7 3h10l4 6-9 12L3 9l4-6Z" fill="#34d399" stroke="#065f46" strokeWidth="1.4" />
      <path d="M3 9h18M8 9l4 12 4-12" fill="none" stroke="#065f46" strokeWidth="1.1" />
    </svg>
  );
}

function Pill({
  icon,
  value,
  tone,
  testid,
  href,
}: {
  icon: ReactNode;
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
      <span aria-hidden="true" className="grid h-4 w-4 place-items-center text-base">
        {icon}
      </span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
      <span aria-hidden="true" className="text-xs opacity-80">
        +
      </span>
    </Link>
  );
}