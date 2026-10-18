"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  backendUrl,
  getPlayerProfile,
  type PlayerProfile,
} from "./api";

/**
 * Live player state shared by every screen: name, trophies, coins, gems, record
 * and the active deck. One fetch on mount + refresh() after anything that
 * changes it (match result, shop purchase, deck edit).
 * O(1) state updates; the fetch itself is a single request.
 */

export interface PlayerContextValue {
  playerId: string;
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setName: (name: string) => Promise<void>;
  /** Ticker shown after a match: { trophies, coins }. */
  lastResult: { trophies: number; coins: number } | null;
  clearResult: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function readPlayerId(): string {
  if (typeof window === "undefined") return "guest";
  const existing = window.localStorage.getItem("cr-player-id");
  if (existing && existing.length > 0) return existing;
  const id = `guest-${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.localStorage.setItem("cr-player-id", id);
  } catch {
    // private mode
  }
  return id;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState("guest");
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ trophies: number; coins: number } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await getPlayerProfile(playerId, backendUrl());
      setProfile(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "profile unavailable");
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    const id = readPlayerId();
    setPlayerId(id);
  }, []);

  useEffect(() => {
    if (playerId === "guest" && typeof window !== "undefined" && !window.localStorage.getItem("cr-player-id")) {
      return;
    }
    void refresh();
  }, [playerId, refresh]);

  const setName = useCallback(
    async (name: string) => {
      const res = await fetch(`${backendUrl().replace(/\/$/, "")}/profile/${encodeURIComponent(playerId)}/name`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${btoa(playerId)}`,
        },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await refresh();
    },
    [playerId, refresh],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      playerId,
      profile,
      loading,
      error,
      refresh,
      setName,
      lastResult,
      clearResult: () => setLastResult(null),
    }),
    [playerId, profile, loading, error, refresh, setName, lastResult],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (ctx === null) {
    // Standalone pages (tests/Storybook) still get a usable no-op context.
    return {
      playerId: "guest",
      profile: null,
      loading: false,
      error: null,
      refresh: async () => {},
      setName: async () => {},
      lastResult: null,
      clearResult: () => {},
    };
  }
  return ctx;
}