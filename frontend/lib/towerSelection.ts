"use client";

import { getCard } from "./cards";

/** Selected crown-tower troop id, persisted locally and sent with matchmaking. */
export const TOWER_KEY = "cr-clone-tower-v1";
export const DEFAULT_TOWER_ID = "tower-princess";

export function loadTowerSelection(): string {
  if (typeof window === "undefined") return DEFAULT_TOWER_ID;
  try {
    const raw = window.localStorage.getItem(TOWER_KEY);
    return raw && getCard(raw)?.type === "tower" ? raw : DEFAULT_TOWER_ID;
  } catch {
    return DEFAULT_TOWER_ID;
  }
}

export function saveTowerSelection(towerId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOWER_KEY, towerId);
  } catch {
    // private mode / storage full - ignore
  }
}
