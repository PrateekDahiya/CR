"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { backendUrl, getActiveMatch } from "../../lib/api";
import { usePlayer } from "../../lib/playerContext";

/**
 * BattleGuard — keeps an active battle alive across the whole app.
 *
 * The match room keeps simulating server-side (10Hz) whether or not the player
 * is on the battle screen, so leaving the page never pauses or forfeits it.
 * This guard polls the server and pulls the player back into the battle from
 * ANY screen, resuming exactly where they left off.
 *
 * Polls on mount, on every route change, on tab focus and every 3 s while the
 * player is away from /battle. O(1) per check (one request).
 */
export default function BattleGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { playerId } = usePlayer();
  const busyRef = useRef(false);

  useEffect(() => {
    if (!playerId || playerId === "guest") return;
    let cancelled = false;

    const check = async () => {
      // Already in the battle (or already navigating): nothing to do.
      if (cancelled || busyRef.current || pathname?.startsWith("/battle")) return;
      busyRef.current = true;
      try {
        const res = await getActiveMatch(playerId, backendUrl());
        if (!cancelled && res.active) {
          router.replace(
            `/battle?matchId=${encodeURIComponent(res.matchId)}&side=${res.side}&mode=resume`,
          );
        }
      } catch {
        // offline / backend restart — try again on the next tick
      } finally {
        busyRef.current = false;
      }
    };

    void check();
    const timer = setInterval(() => void check(), 3000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [playerId, pathname, router]);

  return null;
}