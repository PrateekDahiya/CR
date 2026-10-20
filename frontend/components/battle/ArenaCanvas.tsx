"use client";

/**
 * frontend/components/battle/ArenaCanvas.tsx — Exact-CR portrait arena renderer.
 *
 * Canvas 18x32 portrait (GAME_DESIGN §5), 60fps rAF with interpolation over
 * 10Hz `state:update` snapshots (GAME_DESIGN §9). Pure render component:
 * NO socket imports — parent (app/battle/page.tsx, owned by sibling agent)
 * subscribes via frontend/lib/socket.ts and passes snapshots as props.
 *
 * Visual spec: docs/UI_REFERENCE.md §§2-3 + MEMORY#18 (original code only,
 * no ripped Supercell assets — Canvas rects/circles/emoji):
 *  - grass checker #7ec850 / #8fd45a, river y15-16 #4aa3ff + banks,
 *    2 bridges x3-4 / x14-15 brown planks
 *  - deploy tint blue/red on card select, pocket 4-tile dotted line,
 *    river red X when selectedCell is invalid
 *  - towers: 🏰 Princess 1400 / 👑 King 2400 + HP bars (TowerView helper),
 *    crown popup on destroy, explosion particles
 *  - units: emoji circles + HP + team ring (blue/red), walk bob, hit flash
 *  - spells: expanding rings / flash; damage numbers: floating text
 */

import { useEffect, useRef } from "react";
import type { Tower, Unit, Vec2 } from "../../../shared/types";
import { resolveCardArtId, unitGlyph } from "../../lib/cardAliases";
import { drawTowerHpBar } from "./TowerView";

export type PlayerSide = "blue" | "red";

export interface SpellFx {
  id: string;
  kind: "fireball" | "arrows" | "zap" | string;
  x: number; // arena tiles [0,18]
  y: number; // arena tiles [0,32]
  radius?: number; // tiles (default 2.5)
  startedAt: number; // performance.now() ms
  durationMs?: number; // default 600
}

export interface DamageNumber {
  id: string;
  x: number;
  y: number;
  text: string;
  startedAt: number; // performance.now() ms
  color?: string;
}

export interface InspectTarget {
  kind: "tower" | "unit";
  id: string;
  cardId?: string;
  x: number;
  y: number;
}

export interface ArenaCanvasProps {
  /** Live towers (6 total). */
  towers: Tower[];
  /** Live units — canonical prop name is `entities` (GAME_DESIGN §9 shorthand). */
  entities: Unit[];
  /** Alias accepted so parent may pass `units={...}`. */
  units?: Unit[];
  /** Currently tapped arena cell (tile coords) or null. */
  selectedCell?: Vec2 | null;
  /** Viewer side — controls which half gets the blue deploy tint. Default "blue". */
  mySide?: PlayerSide;
  /** Selected crown tower troop; used to draw the Princess tower icon. */
  towerTroopId?: string;
  /** Active spell visuals (rings/flash). Optional — canvas also auto-flashes on HP drops. */
  spells?: SpellFx[];
  /** Floating combat text. Optional — canvas auto-spawns on HP drops if omitted. */
  damageNumbers?: DamageNumber[];
  /** Latest server clock (serverTimeMs) for clock-anchored lerp. Optional. */
  serverTimeMs?: number;
  /** Tile click (deploy) callback — parent emits card:play. */
  onTileClick?: (x: number, y: number) => void;
  /**
   * Pointer-move preview, already mapped through the side's orientation, so the
   * highlight always lands on the tile under the cursor for BOTH players.
   * Null on pointer leave. O(1).
   */
  onHover?: (cell: Vec2 | null) => void;
  /**
   * Attack/effect radius (tiles) of the selected hand card. When set and the
   * pointer is over the arena, a ring is drawn at the hovered tile.
   */
  selectedRadius?: number | null;
  /** Ring for a clicked building/tower (null clears it). */
  inspectRange?: { x: number; y: number; radius: number } | null;
  /**
   * When true, clicking the board inspects a tower/unit instead of deploying.
   * The parent sets this when no hand card is selected.
   */
  inspectEnabled?: boolean;
  onInspect?: (target: InspectTarget | null) => void;
  className?: string;
}

// Arena constants (GAME_DESIGN §5 — locked, do not change without BREAKING note)
const COLS = 18;
const ROWS = 32;
const RIVER_Y0 = 15;
const RIVER_Y1 = 16;
const BRIDGES: Array<[number, number]> = [
  [3, 4],
  [14, 15],
];
const GRASS_A = "#7ec850";
const GRASS_B = "#8fd45a";
const RIVER = "#4aa3ff";
const RIVER_BANK = "#2f7fd0";
const BRIDGE_WOOD = "#a9744f";
const BRIDGE_EDGE = "#7a4f2c";

const W = 360;
const H = 640;
const TW = W / COLS; // 20
const TH = H / ROWS; // 20

/* ---------------- perf budgets (MEMORY#20) ---------------- */
// Frame budget: O(entities) per 60fps frame — static terrain (576 grass
// tiles + river + bridges) is pre-rendered once to an offscreen canvas O(1)
// blit; only towers (6) + units (<=40) + fx are drawn per frame. Backing
// store DPR-capped at 2 (no 3x-mobile overdraw). Floating text ring-buffered
// at 40, particles at 400 (drop oldest); per-frame updates compact in place
// (no splice/filter allocs in the hot loop).
/** Max DPR for the backing store (MEMORY#20 DPR cap). */
const MAX_DPR = 2;
/** Ring-buffer caps: drop oldest beyond these (bounded space). */
const MAX_FLOATS = 40;
const MAX_PARTICLES = 400;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1 remaining
  color: string;
  size: number;
}

interface FloatText {
  id: string;
  x: number;
  y: number;
  text: string;
  born: number;
  color: string;
}

function emojiFor(cardId: string): string {
  // Never an unresolved marker: spawned children (Golemite, Lava Pup, ...) and
  // any unlisted id still get a legible glyph (see lib/cardAliases).
  return unitGlyph(cardId);
}

/**
 * Real card art for deployed units: /cards/<slug>.png (same art the deck and
 * collection use). Images are cached per card id and drawn once decoded, so the
 * per-frame cost stays O(1) per unit (one drawImage).
 *
 * O(u) draws for u visible units; the cache is bounded by the 108-card catalog.
 * Missing art falls back to the emoji glyph (onError marks the entry).
 */
const artCache = new Map<string, HTMLImageElement | "missing">();

function artFor(cardId: string): HTMLImageElement | null {
  // Spawned children use singular ids (`barbarian`) while the art uses the
  // deck-card slug (`barbarians`); resolve before loading or the child renders
  // as a fallback glyph instead of its art.
  const resolved = resolveCardArtId(cardId);
  const hit = artCache.get(resolved);
  if (hit !== undefined) return hit === "missing" ? null : hit;
  const slug = resolved.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const img = new Image();
  img.decoding = "async";
  img.onload = () => undefined; // decoded -> drawImage works
  img.onerror = () => artCache.set(resolved, "missing");
  img.src = `/cards/${slug}.png`;
  artCache.set(resolved, img);
  return img;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Rounded rectangle path helper (tower plates). O(1).
 */
function roundedRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

/** Compact level square left of a troop HP bar. */
function drawUnitLevelBadge(
  c: CanvasRenderingContext2D,
  level: number,
  owner: "blue" | "red",
  left: number,
  top: number,
  size: number,
): void {
  c.save();
  c.fillStyle = owner === "blue" ? "#1e40af" : "#991b1b";
  c.strokeStyle = owner === "blue" ? "#dbeafe" : "#fee2e2";
  c.lineWidth = 1.2;
  roundedRect(c, left, top, size, size, 2);
  c.fill();
  c.stroke();
  c.fillStyle = "#ffffff";
  c.font = `bold ${Math.round(size * 0.62)}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(String(level), left + size / 2, top + size / 2 + 0.5);
  c.restore();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Pre-render static terrain once (grass checker + river + banks + bridges).
 * O(COLS*ROWS)=O(576) one-time; per-frame blit is O(1).
 * PERF: saves ~580 fillRects/frame (~35k/s @60fps) with identical pixels.
 */
function buildStaticBg(dpr: number): HTMLCanvasElement {
  const bg = document.createElement("canvas");
  bg.width = Math.round(W * dpr);
  bg.height = Math.round(H * dpr);
  const c = bg.getContext("2d");
  if (!c) return bg;
  c.scale(dpr, dpr);
  // --- grass checker (verbatim colors/geometry from the per-frame path) ---
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      c.fillStyle = (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
      c.fillRect(x * TW, y * TH, TW + 0.5, TH + 0.5);
    }
  }
  // --- river + banks ---
  c.fillStyle = RIVER_BANK;
  c.fillRect(0, RIVER_Y0 * TH - 2, W, 2);
  c.fillRect(0, (RIVER_Y1 + 1) * TH, W, 2);
  c.fillStyle = RIVER;
  c.fillRect(0, RIVER_Y0 * TH, W, 2 * TH);
  // shimmer lines (static)
  c.strokeStyle = "rgba(255,255,255,0.5)";
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const yy = RIVER_Y0 * TH + 4 + i * 6;
    c.moveTo(6 + (i % 2) * 10, yy);
    c.lineTo(30 + (i % 2) * 10, yy);
  }
  c.stroke();
  // --- bridges x3-4 / x14-15 ---
  for (let bi = 0; bi < BRIDGES.length; bi++) {
    const bx0 = BRIDGES[bi][0];
    const bx1 = BRIDGES[bi][1];
    const bx = bx0 * TW;
    const bw = (bx1 - bx0 + 1) * TW;
    const by = RIVER_Y0 * TH - 2;
    const bh = 2 * TH + 4;
    c.fillStyle = BRIDGE_EDGE;
    c.fillRect(bx - 2, by, bw + 4, bh);
    c.fillStyle = BRIDGE_WOOD;
    c.fillRect(bx, by, bw, bh);
    c.strokeStyle = "rgba(90,50,20,0.8)";
    c.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const yy = by + (bh / 5) * i;
      c.beginPath();
      c.moveTo(bx, yy);
      c.lineTo(bx + bw, yy);
      c.stroke();
    }
  }
  return bg;
}

export default function ArenaCanvas({
  towers,
  entities,
  units,
  selectedCell = null,
  mySide = "blue",
  towerTroopId,
  spells = [],
  damageNumbers,
  serverTimeMs,
  onTileClick,
  onHover,
  selectedRadius = null,
  inspectRange = null,
  inspectEnabled = false,
  onInspect,
  className = "",
}: ArenaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = units ?? entities ?? [];

  // Interp buffers: prev + curr positions keyed by entity id.
  const prevRef = useRef<Map<string, Vec2>>(new Map());
  const currRef = useRef<Map<string, Vec2>>(new Map());
  const hpRef = useRef<Map<string, number>>(new Map());
  const lastSnapRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : 0);
  const towersRef = useRef<Tower[]>(towers);
  const liveRef = useRef<Unit[]>(live);
  const selRef = useRef<Vec2 | null>(selectedCell);
  const selectedRadiusRef = useRef<number | null>(selectedRadius);
  const inspectRangeRef = useRef<{ x: number; y: number; radius: number } | null>(inspectRange);
  const inspectEnabledRef = useRef<boolean>(inspectEnabled);
  const onInspectRef = useRef<ArenaCanvasProps["onInspect"]>(onInspect);
  const sideRef = useRef<PlayerSide>(mySide);
  const towerTroopRef = useRef<string | undefined>(towerTroopId);
  const spellsRef = useRef<SpellFx[]>(spells);
  const extDmgRef = useRef<DamageNumber[] | undefined>(damageNumbers);
  const particlesRef = useRef<Particle[]>([]);
  const floatsRef = useRef<FloatText[]>([]);
  const hitFlashRef = useRef<Map<string, number>>(new Map());
  const lastFlashAtRef = useRef<number>(-1e9); // O(1) any-flash-active probe
  const deadTowersRef = useRef<Set<string>>(new Set());
  void serverTimeMs; // clock anchor documented; lerp uses arrival delta (100ms buffer per §9)

  // Snapshot incoming props each render (render assigns refs; effects consume).
  towersRef.current = towers;
  liveRef.current = live;
  selRef.current = selectedCell;
  selectedRadiusRef.current = selectedRadius;
  inspectRangeRef.current = inspectRange;
  inspectEnabledRef.current = inspectEnabled;
  onInspectRef.current = onInspect;
  sideRef.current = mySide;
  towerTroopRef.current = towerTroopId;
  spellsRef.current = spells;
  extDmgRef.current = damageNumbers;

  // On new snapshot: shift curr->prev, detect HP drops (damage numbers + flash
  // + explosion particles), detect tower kills (crown burst).
  // O(v+t) per snapshot @10Hz, v<=40 units, t=6 towers; O(1) amortized space.
  // PERF: double-buffered interp Maps (backing reused, no per-snapshot Map
  // alloc); indexed loops; floats/particles ring-buffered (drop oldest).
  useEffect(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    // Double-buffer swap: prev takes the old curr Map (positions intact),
    // curr reuses the old prev backing (cleared). Zero Map allocs/steady.
    const recycled = prevRef.current;
    prevRef.current = currRef.current;
    recycled.clear();
    const next = recycled;
    for (let i = 0; i < live.length; i++) {
      const u = live[i];
      next.set(u.id, { x: u.position.x, y: u.position.y });
    }
    currRef.current = next;
    lastSnapRef.current = now;

    const floats = floatsRef.current;
    for (let i = 0; i < live.length; i++) {
      const u = live[i];
      const oldHp = hpRef.current.get(u.id);
      // Building lifetime wear-down reduces HP every tick, but that is not a
      // hit: keep the HP bar accurate without spamming floating damage numbers.
      if (oldHp !== undefined && u.hitPoints < oldHp && u.decayOnly !== true) {
        const dmg = Math.round(oldHp - u.hitPoints);
        hitFlashRef.current.set(u.id, now);
        lastFlashAtRef.current = now;
        floats.push({
          id: `${u.id}-${now}-${dmg}`,
          x: u.position.x,
          y: u.position.y,
          text: `-${dmg}`,
          born: now,
          color: u.owner === "blue" ? "#ffffff" : "#fde047",
        });
        // Ring buffer: drop oldest beyond MAX_FLOATS (single bulk splice).
        if (floats.length > MAX_FLOATS) floats.splice(0, floats.length - MAX_FLOATS);
      }
      hpRef.current.set(u.id, u.hitPoints);
      // Unit death poof (hp hits 0 — server removes next tick, catch transition)
      if (u.hitPoints <= 0) {
        burst(u.position.x, u.position.y, u.owner === "blue" ? "#bfdbfe" : "#fecaca", 8);
        hpRef.current.delete(u.id);
      }
    }
    // GC hp entries for removed units
    for (const id of Array.from(hpRef.current.keys())) {
      if (!next.has(id)) hpRef.current.delete(id);
    }

    for (const t of towers) {
      if (t.destroyed && !deadTowersRef.current.has(t.id)) {
        deadTowersRef.current.add(t.id);
        burst(t.position.x, t.position.y, "#fdba74", 42);
        burst(t.position.x, t.position.y, "#f8fafc", 24);
        floatsRef.current.push({
          id: `crown-${t.id}-${now}`,
          x: t.position.x,
          y: t.position.y - 1,
          text: "👑",
          born: now,
          color: "#fde047",
        });
      }
      if (!t.destroyed && deadTowersRef.current.has(t.id)) deadTowersRef.current.delete(t.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towers, entities, units]);

  function burst(tx: number, ty: number, color: string, n: number): void {
    // O(n) push, n small per event (8 poof / 42+24 crown); ring-buffered.
    // PERF: single bulk truncate when over cap (was per-push splice check).
    const arr = particlesRef.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 4;
      arr.push({
        x: tx,
        y: ty,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 1,
        color,
        size: 0.08 + Math.random() * 0.16,
      });
    }
    if (arr.length > MAX_PARTICLES) arr.splice(0, arr.length - MAX_PARTICLES);
  }

  // 60fps rAF loop with 100ms interp buffer (§9: 10Hz snapshots -> lerp).
  // O(entities) per frame: towers (6) + units (<=40) + fx; terrain is an
  // O(1) offscreen blit. O(1) extra space (indexed loops, in-place fx GC).
  // PERF: DPR-capped backing store (<=2); dirty-check skips fully static
  // frames (same snapshot + no active fx); document.hidden skip; particle /
  // float updates compact in place (no splice/filter allocs in hot loop).
  useEffect(() => {
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // DPR cap: backing store at min(devicePixelRatio, 2); CSS size unchanged.
    const dpr =
      typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, MAX_DPR) : 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let bg: HTMLCanvasElement | null = null;
    try {
      bg = buildStaticBg(dpr);
    } catch {
      bg = null; // fall back to per-frame terrain below
    }

    // Dirty-check state: identities of the last fully drawn frame.
    let drawnTowers: unknown = null;
    let drawnLive: unknown = null;
    let drawnSel: unknown = null;
    let drawnPreview: number | null = -1;
    let drawnInspect: unknown = undefined;
    let drawnSpellsLen = -1;

    const SNAP_MS = 100; // 10Hz authoritative tick

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Tab hidden → skip all canvas work for this frame.
      if (typeof document !== "undefined" && document.hidden) return;
      const alpha = clamp((now - lastSnapRef.current) / SNAP_MS, 0, 1);
      // Static-hold dirty check: same snapshot refs + zero active fx
      // (no particles, floats, spells, or <120ms hit-flashes) → keep last
      // frame (freezes only cosmetic walk-bob on a settled scene).
      const tw0 = towersRef.current;
      const lv0 = liveRef.current;
      const sel0 = selRef.current;
      const preview0 = selectedRadiusRef.current;
      const inspect0 = inspectRangeRef.current;
      const spells0 = spellsRef.current;
      if (
        tw0 === drawnTowers &&
        lv0 === drawnLive &&
        sel0 === drawnSel &&
        preview0 === drawnPreview &&
        inspect0 === drawnInspect &&
        spells0.length === drawnSpellsLen &&
        particlesRef.current.length === 0 &&
        floatsRef.current.length === 0 &&
        spells0.length === 0 &&
        !hasActiveFlash(now)
      ) {
        return;
      }
      draw(ctx, now, alpha);
      drawnTowers = towersRef.current;
      drawnLive = liveRef.current;
      drawnSel = selRef.current;
      drawnPreview = selectedRadiusRef.current;
      drawnInspect = inspectRangeRef.current;
      drawnSpellsLen = spellsRef.current.length;
    };

    // O(1): any hit-flash younger than 120ms keeps the frame dynamic.
    const hasActiveFlash = (now: number): boolean => now - lastFlashAtRef.current < 120;

    const draw = (c: CanvasRenderingContext2D, now: number, alpha: number) => {
      const tw = towersRef.current;
      const lv = liveRef.current;
      const sel = selRef.current;
      const prev = prevRef.current;
      const curr = currRef.current;

      // Player's half is always at the BOTTOM (like real CR). The server keeps
      // blue = server-y 0..14; when the player is blue the board is drawn
      // mirrored so y0 lands at the bottom. O(1) transform, geometry untouched.
      c.save();
      if (sideRef.current === "blue") {
        c.translate(0, H);
        c.scale(1, -1);
      }

      // Draw something centred at a board point, keeping it upright even when
      // the board is mirrored (player 1's view). `paint` draws around (0,0).
      const upright = (tx: number, ty: number, paint: () => void): void => {
        c.save();
        c.translate(tx, ty);
        if (sideRef.current === "blue") c.scale(1, -1);
        paint();
        c.restore();
      };

      // --- static terrain: O(1) blit (pre-rendered grass/river/bridges) ---
      if (bg) {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(bg, 0, 0);
        c.restore();
      } else {
        // Fallback (offscreen unavailable): direct terrain paint.
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            c.fillStyle = (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
            c.fillRect(x * TW, y * TH, TW + 0.5, TH + 0.5);
          }
        }
        c.fillStyle = RIVER_BANK;
        c.fillRect(0, RIVER_Y0 * TH - 2, W, 2);
        c.fillRect(0, (RIVER_Y1 + 1) * TH, W, 2);
        c.fillStyle = RIVER;
        c.fillRect(0, RIVER_Y0 * TH, W, 2 * TH);
        for (let bi = 0; bi < BRIDGES.length; bi++) {
          const bx0 = BRIDGES[bi][0];
          const bx1 = BRIDGES[bi][1];
          const bx = bx0 * TW;
          const bw = (bx1 - bx0 + 1) * TW;
          const by = RIVER_Y0 * TH - 2;
          const bh = 2 * TH + 4;
          c.fillStyle = BRIDGE_EDGE;
          c.fillRect(bx - 2, by, bw + 4, bh);
          c.fillStyle = BRIDGE_WOOD;
          c.fillRect(bx, by, bw, bh);
        }
      }

      // --- deploy tint: own half blue, enemy half red (on selection) ---
      const ownTop = sideRef.current === "blue"; // blue deploys y0-14 (server coords §5.3)
      const ownY: [number, number] = ownTop ? [0, 14] : [17, 31];
      const foeY: [number, number] = ownTop ? [17, 31] : [0, 14];
      if (sel) {
        c.fillStyle = "rgba(59,130,246,0.28)";
        c.fillRect(0, ownY[0] * TH, W, (ownY[1] - ownY[0] + 1) * TH);
        c.fillStyle = "rgba(239,68,68,0.16)";
        c.fillRect(0, foeY[0] * TH, W, (foeY[1] - foeY[0] + 1) * TH);
      }

      // --- pocket dotted (4 tiles past river on each lane side, §5.3) ---
      c.save();
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth = 1.5;
      c.setLineDash([4, 3]);
      // Blue pocket y17-20 / Red pocket y11-14, split at x=9
      const pockets: Array<[number, number, number, number]> =
        sideRef.current === "blue"
          ? [
              [0, 17, 9, 20],
              [9, 17, 18, 20],
            ]
          : [
              [0, 11, 9, 14],
              [9, 11, 18, 14],
            ];
      for (const [x0, y0, x1, y1] of pockets) {
        c.strokeRect(x0 * TW, y0 * TH, (x1 - x0) * TW, (y1 - y0 + 1) * TH);
      }
      c.restore();

      // --- river + banks + bridges: static, already in the bg blit above ---
      // (fallback path paints them; see the `else` branch at the top of draw)

      // --- selected cell highlight / invalid X ---
      if (sel) {
        const sx = clamp(Math.floor(sel.x), 0, COLS - 1);
        const sy = clamp(Math.floor(sel.y), 0, ROWS - 1);
        const onRiver = sy === RIVER_Y0 || sy === RIVER_Y1;
        const inOwn = sy >= ownY[0] && sy <= ownY[1];
        const valid = !onRiver && inOwn;
        c.save();
        if (valid) {
          c.fillStyle = "rgba(250,204,21,0.35)";
          c.fillRect(sx * TW, sy * TH, TW, TH);
          c.strokeStyle = "#facc15";
          c.lineWidth = 2;
          c.strokeRect(sx * TW + 1, sy * TH + 1, TW - 2, TH - 2);
        } else {
          c.fillStyle = "rgba(239,68,68,0.35)";
          c.fillRect(sx * TW, sy * TH, TW, TH);
          c.strokeStyle = "#ef4444";
          c.lineWidth = 2.5;
          c.beginPath();
          c.moveTo(sx * TW + 3, sy * TH + 3);
          c.lineTo((sx + 1) * TW - 3, (sy + 1) * TH - 3);
          c.moveTo((sx + 1) * TW - 3, sy * TH + 3);
          c.lineTo(sx * TW + 3, (sy + 1) * TH - 3);
          c.stroke();
        }
        c.restore();
      }

      // --- range / effect radius rings ---
      // Deployment hover preview (selected card) and clicked-target inspection.
      // Drawn in board space; circles stay circular because TW === TH.
      const ring = (bx: number, by: number, radius: number, stroke: string, fill: string) => {
        const cx = (bx + 0.5) * TW;
        const cy = (by + 0.5) * TH;
        const r = Math.max(0.5, radius) * TW;
        c.save();
        c.fillStyle = fill;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = stroke;
        c.lineWidth = 2;
        c.setLineDash([6, 4]);
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      };
      const previewR = selectedRadiusRef.current;
      if (sel && previewR !== null && previewR > 0) {
        ring(sel.x, sel.y, previewR, "rgba(250,204,21,0.95)", "rgba(250,204,21,0.16)");
      }
      const inspected = inspectRangeRef.current;
      if (inspected !== null) {
        ring(inspected.x, inspected.y, inspected.radius, "rgba(56,189,248,0.95)", "rgba(56,189,248,0.14)");
      }

      // --- towers: O(t), t=6 ---
      const timeS = now / 1000;
      const flashMap = hitFlashRef.current;
      for (let ti = 0; ti < tw.length; ti++) {
        const t = tw[ti];
        const cx = (t.position.x + 0.5) * TW;
        const cy = (t.position.y + 0.5) * TH;
        // Real CR footprints: princess 3x3 tiles, king 4x4 tiles, SQUARE.
        const tiles = t.kind === "king" ? 4 : 3;
        const size = tiles * TW;
        const half = size / 2;
        const barW = size * 0.95;
        // shadow
        c.fillStyle = "rgba(0,0,0,0.28)";
        c.beginPath();
        c.ellipse(cx, cy + half * 0.85, half * 0.85, half * 0.26, 0, 0, Math.PI * 2);
        c.fill();
        if (!t.destroyed) {
          // Square stone base: strong team plate + inset lighter face.
          const plate = t.owner === "blue" ? "#1d4ed8" : "#b91c1c";
          const face = t.owner === "blue" ? "#93c5fd" : "#fca5a5";
          const ring = t.owner === "blue" ? "#bfdbfe" : "#fecaca";
          c.save();
          c.lineWidth = 3;
          c.strokeStyle = "#3f2a14";
          roundedRect(c, cx - half, cy - half, size, size, 6);
          c.fillStyle = plate;
          c.fill();
          c.stroke();
          c.lineWidth = 3;
          c.strokeStyle = ring;
          roundedRect(c, cx - half + 5, cy - half + 5, size - 10, size - 10, 4);
          c.fillStyle = face;
          c.fill();
          c.stroke();
          // inner shadow line for depth
          c.strokeStyle = "rgba(0,0,0,0.18)";
          c.lineWidth = 1;
          roundedRect(c, cx - half + 2, cy - half + 2, size - 4, size - 4, 5);
          c.stroke();
          c.restore();
          // Roof / emblem, upright in both views.
          upright(cx, cy, () => {
            c.font = `${t.kind === "king" ? 34 : 26}px serif`;
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.fillText(t.kind === "king" ? "👑" : "🏰", 0, 1);
          });
          // Tower troop icon: Princess towers show the selected troop art; the
          // King tower always keeps the standard crown glyph.
          if (t.kind === "princess" && towerTroopRef.current !== undefined) {
            const troopArt = artFor(towerTroopRef.current);
            if (troopArt !== null && troopArt.complete && troopArt.naturalWidth > 0) {
              upright(cx, cy, () => {
                const d = size * 0.68;
                c.save();
                c.beginPath();
                c.arc(0, 0, d / 2, 0, Math.PI * 2);
                c.clip();
                c.drawImage(troopArt, -d / 2, -d / 2, d, d);
                c.restore();
              });
            }
          }
          // HP bar + level badge, always visually ABOVE the tower. The blue view
          // is mirrored, so "up on screen" is +y in board space there.
          const barOffset = sideRef.current === "blue" ? half + 8 : -(half + 8);
          upright(cx, cy + barOffset, () => {
            drawTowerHpBar(c, t, 0, 0, barW);
          });
        } else {
          // Rubble: collapsed square.
          c.save();
          c.fillStyle = "#57534e";
          c.lineWidth = 3;
          c.strokeStyle = "#292524";
          roundedRect(c, cx - half * 0.7, cy - half * 0.55, size * 0.7, size * 0.55, 4);
          c.fill();
          c.stroke();
          c.fillStyle = "#a8a29e";
          c.beginPath();
          c.arc(cx - 5, cy - 3, 3.5, 0, Math.PI * 2);
          c.arc(cx + 6, cy + 3, 3, 0, Math.PI * 2);
          c.fill();
          c.restore();
          // crown popup (pulse via time)
          const pulse = 1 + Math.sin(timeS * 5) * 0.12;
          upright(cx, cy - half - 10, () => {
            c.font = `${Math.round(20 * pulse)}px serif`;
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.fillText("👑", 0, 0);
          });
        }
      }

      // --- units (interpolated): O(v), v<=40 visible ---
      for (let ui = 0; ui < lv.length; ui++) {
        const u = lv[ui];
        const p = prev.get(u.id);
        const q = curr.get(u.id) ?? u.position;
        const sx = p ? lerp(p.x, q.x, alpha) : q.x;
        const sy = p ? lerp(p.y, q.y, alpha) : q.y;
        const cx = (sx + 0.5) * TW;
        const bob = Math.sin(timeS * 8 + sx * 2 + sy) * 1.5;
        const cy = (sy + 0.5) * TH + bob * 0.4;
        const r = TW * 0.62;

        // shadow
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.beginPath();
        c.ellipse(cx, cy + r * 0.8, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
        c.fill();
        // body + team ring
        const flash = now - (flashMap.get(u.id) ?? -1e9) < 120;
        c.fillStyle = flash ? "#ffffff" : u.owner === "blue" ? "#eff6ff" : "#fef2f2";
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = 3;
        c.strokeStyle = u.owner === "blue" ? "#2563eb" : "#dc2626";
        c.stroke();
        // Real card art (same PNG as deck/collection); emoji only until decoded
        // or when the card has no art file.
        const art = artFor(u.cardId);
        if (art !== null && art.complete && art.naturalWidth > 0) {
          const d = r * 1.8;
          c.save();
          c.beginPath();
          c.arc(cx, cy, r - 1, 0, Math.PI * 2);
          c.clip();
          // Draw centred on the unit, un-flipping the board mirror so the art is
          // never upside down for the blue player.
          c.translate(cx, cy);
          if (sideRef.current === "blue") c.scale(1, -1);
          c.drawImage(art, -d / 2, -d / 2, d, d);
          c.restore();
        } else {
          c.font = "13px serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          upright(cx, cy + 0.5, () => c.fillText(emojiFor(u.cardId), 0, 0));
        }
        // HP bar
        const max = Math.max(1, u.maxHitPoints);
        const pct = clamp(u.hitPoints / max, 0, 1);
        const bw = TW * 1.5;
        const barY = cy - r - 7;
        // Troop level badge immediately left of the HP bar. Draw it upright
        // because the blue view mirrors the canvas vertically.
        upright(cx - bw / 2 - 6.5, barY + 2.5, () => {
          drawUnitLevelBadge(c, u.level ?? 1, u.owner, -5.5, -5.5, 11);
        });
        c.fillStyle = "rgba(0,0,0,0.65)";
        c.fillRect(cx - bw / 2, barY, bw, 5);
        c.fillStyle = u.owner === "blue" ? "#3b82f6" : "#ef4444";
        c.fillRect(cx - bw / 2 + 0.5, barY + 0.5, (bw - 1) * pct, 4);
      }

      // --- spells: expanding rings / flash: O(s), s small ---
      const spellsArr = spellsRef.current;
      for (let si = 0; si < spellsArr.length; si++) {
        const s = spellsArr[si];
        const dur = s.durationMs ?? 600;
        const age = (now - s.startedAt) / dur;
        if (age < 0 || age > 1.4) continue;
        const t = clamp(age, 0, 1);
        const rad = (s.radius ?? 2.5) * TW * (0.3 + 0.7 * t);
        const cx = (s.x + 0.5) * TW;
        const cy = (s.y + 0.5) * TH;
        const alphaS = 1 - t;
        c.save();
        c.globalAlpha = clamp(alphaS, 0, 1);
        if (s.kind === "zap") {
          c.fillStyle = "#fef08a";
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "#eab308";
          c.lineWidth = 3;
          c.stroke();
          c.font = "18px serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          upright(cx, cy, () => c.fillText("⚡", 0, 0));
        } else if (s.kind === "arrows") {
          c.strokeStyle = "#f8fafc";
          c.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            c.arc(cx, cy, rad * (0.4 + k * 0.3), 0, Math.PI * 2);
            c.stroke();
          }
          c.font = "14px serif";
          c.textAlign = "center";
          upright(cx, cy, () => c.fillText("➶", 0, 0));
        } else {
          // fireball default
          c.strokeStyle = "#f97316";
          c.lineWidth = 4;
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.stroke();
          c.strokeStyle = "#facc15";
          c.lineWidth = 2;
          c.beginPath();
          c.arc(cx, cy, rad * 0.7, 0, Math.PI * 2);
          c.stroke();
          c.font = "16px serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          upright(cx, cy, () => c.fillText("🔥", 0, 0));
        }
        c.restore();
      }

      // --- particles: O(p) update + O(p) draw, p<=400 ring-buffered ---
      // PERF: forward in-place compaction (was reverse splice → O(p^2)
      // worst-case); draw pass stays reverse to preserve blend order.
      const parts = particlesRef.current;
      {
        let w = 0;
        for (let i = 0; i < parts.length; i++) {
          const pt = parts[i];
          pt.x += pt.vx * 0.06;
          pt.y += pt.vy * 0.06;
          pt.vy += 0.08;
          pt.life -= 0.03;
          if (pt.life > 0) parts[w++] = pt;
        }
        parts.length = w;
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const pt = parts[i];
        c.save();
        c.globalAlpha = clamp(pt.life, 0, 1);
        c.fillStyle = pt.color;
        c.beginPath();
        c.arc((pt.x + 0.5) * TW, (pt.y + 0.5) * TH, Math.max(1, pt.size * TW * pt.life), 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      // --- damage numbers (external prop wins, else auto-spawned): O(d) ---
      // PERF: direct indexed iteration over the live source (was 2x .map
      // allocs/frame); auto-float GC compacts in place (was filter() alloc).
      c.save();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = "bold 13px system-ui, sans-serif";
      const ext = extDmgRef.current;
      if (ext && ext.length > 0) {
        for (let i = 0; i < ext.length; i++) {
          const d = ext[i];
          const born = d.startedAt;
          const age = (now - born) / 900;
          if (age < 0 || age > 1) continue;
          const fx = (d.x + 0.5) * TW;
          const fy = (d.y + 0.5) * TH - age * 26;
          const color = d.color ?? "#fff";
          c.globalAlpha = 1 - age;
          c.lineWidth = 3;
          c.strokeStyle = "rgba(0,0,0,0.8)";
          c.strokeText(d.text, fx, fy);
          c.fillStyle = color;
          c.fillText(d.text, fx, fy);
        }
      } else {
        const fl = floatsRef.current;
        // GC auto floats older than 1.2s (in place, preserves order).
        {
          let w = 0;
          for (let i = 0; i < fl.length; i++) {
            if (now - fl[i].born < 1200) fl[w++] = fl[i];
          }
          fl.length = w;
        }
        for (let i = 0; i < fl.length; i++) {
          const f = fl[i];
          const age = (now - f.born) / 900;
          if (age < 0 || age > 1) continue;
          const fx = (f.x + 0.5) * TW;
          const fy = (f.y + 0.5) * TH - age * 26;
          c.globalAlpha = 1 - age;
          c.lineWidth = 3;
          c.strokeStyle = "rgba(0,0,0,0.8)";
          c.fillStyle = f.color;
          upright(fx, fy, () => {
            c.strokeText(f.text, 0, 0);
            c.fillText(f.text, 0, 0);
          });
        }
      }
      c.restore();

      // Wooden border (unflipped so it always frames the canvas).
      c.restore();
      c.save();
      c.strokeStyle = "#7c4a21";
      c.lineWidth = 6;
      c.strokeRect(3, 3, W - 6, H - 6);
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = 1.5;
      c.strokeRect(7, 7, W - 14, H - 14);
      c.restore();
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

/**
   * Client point -> tile, honouring the board orientation. The blue view is
   * mirrored, so its rows must be flipped here. Shared by click AND hover so
   * both always agree with what the player sees under the cursor.
   */
  const tileAt = (clientX: number, clientY: number): Vec2 | null => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = clamp(Math.floor(((clientX - rect.left) / rect.width) * COLS), 0, COLS - 1);
    const rawY = clamp(Math.floor(((clientY - rect.top) / rect.height) * ROWS), 0, ROWS - 1);
    const y = mySide === "blue" ? ROWS - 1 - rawY : rawY;
    return { x, y };
  };

  /** Nearest tower/unit under a clicked tile (for the range inspector). O(t+u). */
  const inspectTargetAt = (cell: Vec2): InspectTarget | null => {
    const wx = cell.x + 0.5;
    const wy = cell.y + 0.5;
    for (const t of towersRef.current) {
      if (t.destroyed) continue;
      const half = (t.kind === "king" ? 4 : 3) / 2;
      if (Math.abs(wx - t.position.x) <= half && Math.abs(wy - t.position.y) <= half) {
        return { kind: "tower", id: t.id, x: t.position.x, y: t.position.y };
      }
    }
    let best: InspectTarget | null = null;
    let bestD2 = 1.2 * 1.2;
    for (const u of liveRef.current) {
      if (u.hitPoints <= 0) continue;
      const dx = wx - u.position.x;
      const dy = wy - u.position.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = { kind: "unit", id: u.id, cardId: u.cardId, x: u.position.x, y: u.position.y };
      }
    }
    return best;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = tileAt(e.clientX, e.clientY);
    if (cell === null) return;
    if (inspectEnabledRef.current) {
      // No hand card selected: clicking a building or crown tower inspects its
      // range; clicking empty ground clears the inspector.
      onInspectRef.current?.(inspectTargetAt(cell));
      return;
    }
    if (!onTileClick) return;
    onTileClick(cell.x, cell.y);
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = tileAt(e.clientX, e.clientY);
    // Mirror the mapped cell onto the element (no React re-render) so tests and
    // debugging can see which server tile the pointer is really on.
    const el = canvasRef.current;
    if (el !== null) {
      el.setAttribute("data-hover-x", cell === null ? "" : String(cell.x));
      el.setAttribute("data-hover-y", cell === null ? "" : String(cell.y));
    }
    onHover?.(cell);
  };

  const handleLeave = () => {
    const el = canvasRef.current;
    if (el !== null) {
      el.setAttribute("data-hover-x", "");
      el.setAttribute("data-hover-y", "");
    }
    onHover?.(null);
  };

  return (
    <div className={`mx-auto flex h-full w-full max-w-[420px] items-center justify-center ${className}`} data-testid="arena-canvas-wrap">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="h-full max-h-full w-auto max-w-full touch-manipulate rounded-lg"
        style={{ aspectRatio: "18 / 32", background: GRASS_A }}
        data-testid="arena-canvas"
        data-my-side={mySide}
        aria-label="Battle arena 18 by 32 portrait"
      />
    </div>
  );
}
