/**
 * frontend/components/battle/TowerView.tsx — Tower HP bar + crown popup.
 *
 * Pure presentational helper used by ArenaCanvas (canvas) or as a DOM overlay.
 * NO socket imports (MEMORY#16: transport lives in frontend/lib/socket.ts only).
 * Original code only — emoji/CSS shapes, no ripped Supercell assets.
 *
 * GAME_DESIGN §6: Princess 1400 HP, King 2400 HP.
 * UI_REFERENCE §3: HP bar above tower (blue/red fill, white text),
 * crown popup on destroy, explosion is handled by ArenaCanvas particles.
 */

import type { Tower } from "../../../shared/types";

export type PlayerSide = "blue" | "red";

export interface TowerViewProps {
  tower: Tower;
  /** Optional pixel width of the HP bar (default 64). */
  width?: number;
  /** Show numeric HP text (default true). */
  showText?: boolean;
  className?: string;
}

export function towerEmoji(tower: Pick<Tower, "kind">): string {
  return tower.kind === "king" ? "👑" : "🏰";
}

export function towerHpPct(tower: Pick<Tower, "hitPoints" | "maxHitPoints">): number {
  if (tower.maxHitPoints <= 0) return 0;
  const pct = tower.hitPoints / tower.maxHitPoints;
  return Math.max(0, Math.min(1, pct));
}

export function towerBarColor(owner: PlayerSide): string {
  return owner === "blue" ? "#3b82f6" : "#ef4444";
}

function towerTrackColor(owner: PlayerSide): string {
  return owner === "blue" ? "#1e3a8a" : "#7f1d1d";
}

/**
 * DOM overlay: HP bar + crown popup. Position it absolutely over the canvas
 * tower anchor from the parent if you want DOM instead of canvas-drawn bars.
 */
export default function TowerView({ tower, width = 64, showText = true, className = "" }: TowerViewProps) {
  const pct = towerHpPct(tower);
  const fill = towerBarColor(tower.owner as PlayerSide);
  const track = towerTrackColor(tower.owner as PlayerSide);

  return (
    <div
      className={`pointer-events-none select-none ${className}`}
      style={{ width }}
      data-testid={`tower-view-${tower.id}`}
      aria-label={`${tower.owner} ${tower.kind} ${tower.hitPoints}/${tower.maxHitPoints}`}
    >
      <div
        className="relative overflow-hidden rounded-sm border border-black/60"
        style={{ height: 10, background: track }}
      >
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${Math.round(pct * 100)}%`, background: fill }}
        />
        {showText && (
          <span
            className="absolute inset-0 flex items-center justify-center font-extrabold"
            style={{ fontSize: 8, color: "#fff", textShadow: "0 1px 1px #000" }}
          >
            {tower.destroyed ? 0 : tower.hitPoints}
          </span>
        )}
      </div>
      {tower.destroyed && (
        <div className="flex justify-center">
          <span
            className="animate-bounce font-extrabold"
            style={{ fontSize: 16, textShadow: "0 2px 0 #000" }}
            role="img"
            aria-label="crown"
          >
            👑
          </span>
        </div>
      )}
    </div>
  );
}

/** Named export alias for canvas-overlay import style. */
export const TowerHpBar = TowerView;

/**
 * Canvas helper: draws the same HP bar + crown popup directly on the arena
 * canvas so ArenaCanvas stays single-canvas (no DOM overlay cost at 60fps).
 */
export function drawTowerHpBar(
  ctx: CanvasRenderingContext2D,
  tower: Tower,
  cx: number,
  topY: number,
  barW: number,
): void {
  const pct = towerHpPct(tower);
  const barH = 8;
  const x = cx - barW / 2;
  const y = topY - barH - 2;

  ctx.save();
  // Track
  ctx.fillStyle = tower.owner === "blue" ? "#1e3a8a" : "#7f1d1d";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, barW, barH, 2);
  ctx.fill();
  ctx.stroke();
  // Fill
  if (pct > 0) {
    ctx.fillStyle = towerBarColor(tower.owner as PlayerSide);
    const w = Math.max(0, (barW - 2) * pct);
    if (w > 0) {
      roundRect(ctx, x + 1, y + 1, w, barH - 2, 1.5);
      ctx.fill();
    }
  }
  // Text
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${barH - 1}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${tower.destroyed ? 0 : Math.ceil(tower.hitPoints)}`, cx, y + barH / 2 + 0.5, barW);

  // Crown popup for destroyed towers (static emoji, canvas has no CSS anim —
  // ArenaCanvas pulses it via time-based scale).
  if (tower.destroyed) {
    ctx.font = `${Math.round(barW * 0.42)}px serif`;
    ctx.fillText("👑", cx, y - Math.round(barW * 0.28));
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
