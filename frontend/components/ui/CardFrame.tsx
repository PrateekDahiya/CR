"use client";

import { RARITY_BORDER } from "../../lib/crTheme";

export interface CardFrameProps {
  children: React.ReactNode;
  rarity?: "common" | "rare" | "epic" | "legendary" | "champion";
  selected?: boolean;
  hoverable?: boolean;
  className?: string;
  onClick?: () => void;
  testId?: string;
}

// Rarity-tinted glow + frame border around card content. O(1) per render.
export default function CardFrame({
  children,
  rarity = "common",
  selected = false,
  hoverable = true,
  className = "",
  onClick,
  testId,
}: CardFrameProps) {
  const border = RARITY_BORDER[rarity] ?? RARITY_BORDER.common;
  const glow = rarity === "legendary" || rarity === "champion" ? "shadow-[0_0_18px_rgba(245,208,0,0.55)]" : rarity === "epic" ? "shadow-[0_0_14px_rgba(168,85,247,0.55)]" : rarity === "rare" ? "shadow-[0_0_10px_rgba(249,115,22,0.45)]" : "shadow";
  const ring = selected ? "ring-2 ring-amber-300 scale-105" : "";
  const cursor = hoverable && onClick ? "cursor-pointer" : "";
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      className={`relative rounded-xl border-2 ${border} bg-gradient-to-b from-slate-800/40 to-slate-900/40 p-1 transition-transform ${ring} ${cursor} ${glow} ${className}`}
    >
      {children}
    </div>
  );
}
