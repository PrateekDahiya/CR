/**
 * frontend/components/battle/TowerView.tsx — Tower HP bar + crown popup.
 *
 * Pure presentational helper used by ArenaCanvas (canvas) or as a DOM overlay.
 * NO socket imports (MEMORY#16: transport lives in frontend/lib/socket.ts only).
 * Original code only — emoji/CSS shapes, no ripped Supercell assets.
 *
 * In-game style: crown level badge + health number above the bar.
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

/** Tower glyphs (escaped so the source stays pure ASCII). */
const CROWN_GLYPH = "\u{1F451}";
const CASTLE_GLYPH = "\u{1F3F0}";

export function towerEmoji(tower: Pick<Tower, "kind">): string {
  return tower.kind === "king" ? CROWN_GLYPH : CASTLE_GLYPH;
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

/** DOM overlay variant (canvas draws its own bars in battle). */
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
      {showText && (
        <div
          className="text-center font-extrabold"
          style={{ fontSize: 11, color: "#fff", textShadow: "0 1px 2px #000" }}
        >
          {tower.destroyed ? 0 : Math.ceil(tower.hitPoints)}
        </div>
      )}
      <div
        className="relative overflow-hidden rounded-sm border border-black/60"
        style={{ height: 9, background: track }}
      >
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${Math.round(pct * 100)}%`, background: fill }}
        />
      </div>
      {tower.destroyed && (
        <div className="flex justify-center">
          <span
            className="animate-bounce font-extrabold"
            style={{ fontSize: 16, textShadow: "0 2px 0 #000" }}
            role="img"
            aria-label="crown"
          >
            {CROWN_GLYPH}
          </span>
        </div>
      )}
    </div>
  );
}

/** Named export alias for canvas-overlay import style. */
export const TowerHpBar = TowerView;

/**
 * Canvas helper: crown level badge, health number above the bar, then the bar.
 * Drawn in the caller's already-upright local space.
 */
export function drawTowerHpBar(
  ctx: CanvasRenderingContext2D,
  tower: Tower,
  cx: number,
  topY: number,
  barW: number,
): void {
  const pct = towerHpPct(tower);
  const barH = 7;
  const x = cx - barW / 2;
  const y = topY - barH - 1;

  ctx.save();
  const hpText = `${tower.destroyed ? 0 : Math.ceil(tower.hitPoints)}`;
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.strokeText(hpText, cx, y - 6, barW + 12);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(hpText, cx, y - 6, barW + 12);

  ctx.fillStyle = towerTrackColor(tower.owner as PlayerSide);
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, barW, barH, 2.5);
  ctx.fill();
  ctx.stroke();
  if (pct > 0) {
    ctx.fillStyle = towerBarColor(tower.owner as PlayerSide);
    const w = Math.max(0, (barW - 2) * pct);
    if (w > 0) {
      roundRect(ctx, x + 1, y + 1, w, barH - 2, 2);
      ctx.fill();
    }
  }

  drawCrownLevelBadge(ctx, tower.level ?? 1, x - 19, y - 5, 17);

  if (tower.destroyed) {
    ctx.font = `${Math.round(barW * 0.42)}px serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(CROWN_GLYPH, cx, y - Math.round(barW * 0.28));
  }
  ctx.restore();
}

/** Gold crown badge with the tower level inside it. */
export function drawCrownLevelBadge(
  ctx: CanvasRenderingContext2D,
  level: number,
  left: number,
  top: number,
  size = 17,
): void {
  const w = size;
  const h = size * 0.9;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left + 1, top + h * 0.45);
  ctx.lineTo(left + 1, top + 2);
  ctx.lineTo(left + w * 0.27, top + h * 0.36);
  ctx.lineTo(left + w * 0.5, top);
  ctx.lineTo(left + w * 0.73, top + h * 0.36);
  ctx.lineTo(left + w - 1, top + 2);
  ctx.lineTo(left + w - 1, top + h * 0.45);
  ctx.lineTo(left + w - 3, top + h - 2);
  ctx.lineTo(left + 3, top + h - 2);
  ctx.closePath();
  ctx.fillStyle = "#facc15";
  ctx.strokeStyle = "#78350f";
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#451a03";
  ctx.font = `bold ${Math.round(size * 0.42)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(level), left + w / 2, top + h * 0.66);
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
