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
import { getCard } from "../../lib/cards";
import { drawCardSprite } from "../../lib/battle/spriteAnim";
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
  /** Selected card is a spell: any arena tile (including the river) is legal. */
  selectedAnywhere?: boolean;
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

type ProjectileKind =
  | "arrow"
  | "bullet"
  | "cannonball"
  | "fireball"
  | "ice"
  | "bolt"
  | "axe"
  | "boulder"
  | "energy"
  | "dagger"
  | "spear"
  | "shell";

interface Projectile {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  duration: number;
  kind: ProjectileKind;
  color: string;
  arc: number;
}

interface SlashFx {
  x: number;
  y: number;
  angle: number;
  born: number;
  color: string;
}

interface DeathGhost {
  cardId: string;
  owner: "blue" | "red";
  x: number;
  y: number;
  born: number;
}

interface UnitMemory {
  cardId: string;
  owner: "blue" | "red";
  x: number;
  y: number;
  hp: number;
}

const MAX_PROJECTILES = 80;
const MAX_SLASHES = 40;
const MAX_GHOSTS = 32;
const MAX_SPELLS_DRAWN = 8;

/** Cards whose attacks are drawn as a continuous beam instead of a projectile. */
const BEAM_CARDS: ReadonlySet<string> = new Set([
  "inferno-tower",
  "inferno-dragon",
  "electro-wizard",
  "electro-dragon",
  "tesla",
  "zappies",
]);

function projectileStyle(cardId: string): ProjectileKind {
  if (["archers", "princess", "magic-archer", "dart-goblin", "spear-goblins", "royal-recruits", "rascals"].includes(cardId)) return "arrow";
  if (["cannon", "cannon-cart", "royal-giant", "goblin-demolisher"].includes(cardId)) return "cannonball";
  if (["mortar", "x-bow"].includes(cardId)) return "shell";
  if (["wizard", "baby-dragon", "firecracker", "witch", "mother-witch"].includes(cardId)) return "fireball";
  if (["ice-wizard", "ice-spirit", "giant-snowball"].includes(cardId)) return "ice";
  if (["electro-wizard", "electro-dragon", "zappies", "tesla"].includes(cardId)) return "bolt";
  if (["executioner"].includes(cardId)) return "axe";
  if (["bowler"].includes(cardId)) return "boulder";
  if (["sparky", "mega-knight"].includes(cardId)) return "energy";
  if (["dagger-duchess"].includes(cardId)) return "dagger";
  if (["musketeer", "hunter", "flying-machine"].includes(cardId)) return "bullet";
  if (["goblin-spear"].includes(cardId)) return "spear";
  return "bullet";
}

function projectileColor(kind: ProjectileKind): string {
  switch (kind) {
    case "fireball": return "#fb923c";
    case "ice": return "#a5f3fc";
    case "bolt": return "#fde047";
    case "cannonball":
    case "boulder": return "#78716c";
    case "shell": return "#44403c";
    case "energy": return "#c084fc";
    case "dagger": return "#e2e8f0";
    case "axe": return "#cbd5e1";
    case "spear": return "#d6d3d1";
    case "arrow": return "#f8fafc";
    default: return "#fbbf24";
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function emojiFor(cardId: string): string {
  // Never an unresolved marker: spawned children (Golemite, Lava Pup, ...) and
  // any unlisted id still get a legible glyph (see lib/cardAliases).
  return unitGlyph(cardId);
}

/**
 * Real card art for deployed units.
 *
 * Every card has two views (like the towers): the red team plays the front
 * art, the blue team the back art. The per-team art lives in
 * `/cardart/<card>-<view>.png`; the old shared card tile in `/cards/<card>.png`
 * is still used when a card has no per-team art yet.
 *
 * Images are cached per card id and drawn once decoded, so the per-frame cost
 * stays O(1) per unit (one drawImage). Missing art falls back to the emoji
 * glyph (onError marks the entry).
 */
const artCache = new Map<string, HTMLImageElement | "missing">();

/** Blue/red King Tower art fetched from the Clash Royale wiki. */
const kingTowerCache = new Map<"blue" | "red", HTMLImageElement | "missing">();

function kingTowerArt(owner: "blue" | "red"): HTMLImageElement | null {
  const hit = kingTowerCache.get(owner);
  if (hit !== undefined) return hit === "missing" ? null : hit;
  if (typeof window === "undefined") return null;
  const img = new Image();
  img.decoding = "async";
  img.onerror = () => kingTowerCache.set(owner, "missing");
  img.src = owner === "blue" ? "/towers/king-blue-active.png" : "/towers/king-red-active.png";
  kingTowerCache.set(owner, img);
  return img;
}

/** Blue/red Princess (side) Tower art, same source set as the king towers. */
const princessTowerCache = new Map<string, HTMLImageElement | "missing">();

/**
 * Side-tower art per crown-tower troop: every tower type has its own picture
 * (princess, cannoneer, dagger duchess, royal chef) instead of one picture
 * plus a small icon badge.
 */
function sideTowerAsset(troopId: string | undefined, owner: "blue" | "red"): string {
  const team = owner === "blue" ? "blue" : "red";
  switch (troopId) {
    case "cannoneer":
      return `/towers/princess-cannoneer-${team}.png`;
    case "dagger-duchess":
      return `/towers/princess-duchess-${team}.png`;
    case "royal-chef":
      return `/towers/princess-chef-${team}.png`;
    default:
      return `/towers/princess-${team}.png`;
  }
}

function princessTowerArt(
  troopId: string | undefined,
  owner: "blue" | "red",
): HTMLImageElement | null {
  const key = `${troopId ?? "tower-princess"}:${owner}`;
  const hit = princessTowerCache.get(key);
  if (hit !== undefined) return hit === "missing" ? null : hit;
  if (typeof window === "undefined") return null;
  const img = new Image();
  img.decoding = "async";
  img.onerror = () => princessTowerCache.set(key, "missing");
  img.src = sideTowerAsset(troopId, owner);
  princessTowerCache.set(key, img);
  return img;
}

function artFor(cardId: string, owner: "red" | "blue" = "red"): HTMLImageElement | null {
  // Spawned children use singular ids (`barbarian`) while the art uses the
  // deck-card slug (`barbarians`); resolve before loading or the child renders
  // as a fallback glyph instead of its art.
  const resolved = resolveCardArtId(cardId);
  const view = owner === "blue" ? "back" : "front";
  const key = `${resolved}:${view}`;
  const hit = artCache.get(key);
  if (hit !== undefined) return hit === "missing" ? null : hit;
  const slug = resolved.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const img = new Image();
  img.decoding = "async";
  img.onload = () => undefined; // decoded -> drawImage works
  img.onerror = () => {
    // No per-team art for this card: fall back to the shared card tile.
    const legacy = new Image();
    legacy.decoding = "async";
    legacy.onload = () => undefined;
    legacy.onerror = () => artCache.set(key, "missing");
    legacy.src = `/cards/${slug}.png`;
    artCache.set(key, legacy);
  };
  img.src = `/cardart/${slug}-${view}.png`;
  artCache.set(key, img);
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
  selectedAnywhere = false,
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
  const selectedAnywhereRef = useRef(false);
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
  const projectilesRef = useRef<Projectile[]>([]);
  const slashesRef = useRef<SlashFx[]>([]);
  const deathGhostsRef = useRef<DeathGhost[]>([]);
  const spawnAtRef = useRef<Map<string, number>>(new Map());
  const lastShotRef = useRef<Map<string, number>>(new Map());
  const lastTowerShotRef = useRef<Map<string, number>>(new Map());
  const lastBeamSparkRef = useRef<Map<string, number>>(new Map());
  const targetScratchRef = useRef<Map<string, Vec2>>(new Map());
  const knownUnitsRef = useRef<Map<string, UnitMemory>>(new Map());
  const reduceMotionRef = useRef(false);
  void serverTimeMs; // clock anchor documented; lerp uses arrival delta (100ms buffer per §9)

  // Snapshot incoming props each render (render assigns refs; effects consume).
  towersRef.current = towers;
  liveRef.current = live;
  selRef.current = selectedCell;
  selectedAnywhereRef.current = selectedAnywhere;
  selectedRadiusRef.current = selectedRadius;
  inspectRangeRef.current = inspectRange;
  inspectEnabledRef.current = inspectEnabled;
  onInspectRef.current = onInspect;
  sideRef.current = mySide;
  towerTroopRef.current = towerTroopId;
  spellsRef.current = spells;
  extDmgRef.current = damageNumbers;
  if (typeof window !== "undefined") {
    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

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
    const known = knownUnitsRef.current;
    for (let i = 0; i < live.length; i++) {
      const u = live[i];
      if (!known.has(u.id)) {
        spawnAtRef.current.set(u.id, now);
        lastShotRef.current.set(u.id, now + 260);
        burst(u.position.x, u.position.y, u.owner === "blue" ? "#bfdbfe" : "#fecaca", 7);
      }
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
    // Turn units that vanished from the snapshot into short death animations.
    known.forEach((mem, id) => {
      if (next.has(id)) return;
      if (mem.hp > 0) {
        const ghosts = deathGhostsRef.current;
        ghosts.push({ cardId: mem.cardId, owner: mem.owner, x: mem.x, y: mem.y, born: now });
        if (ghosts.length > MAX_GHOSTS) ghosts.splice(0, ghosts.length - MAX_GHOSTS);
        burst(mem.x, mem.y, mem.owner === "blue" ? "#bfdbfe" : "#fecaca", 6);
      }
      spawnAtRef.current.delete(id);
      lastShotRef.current.delete(id);
      lastBeamSparkRef.current.delete(id);
    });
    known.clear();
    for (let i = 0; i < live.length; i++) {
      const u = live[i];
      known.set(u.id, { cardId: u.cardId, owner: u.owner, x: u.position.x, y: u.position.y, hp: u.hitPoints });
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

  function spawnProjectile(
    kind: ProjectileKind,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    now: number,
  ): void {
    const arr = projectilesRef.current;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    arr.push({
      x0,
      y0,
      x1,
      y1,
      born: now,
      duration: clamp(dist * 44, 150, 560),
      kind,
      color: projectileColor(kind),
      arc: kind === "shell" || kind === "boulder" || kind === "cannonball" ? 0.8 : kind === "arrow" ? 0.15 : 0.32,
    });
    if (arr.length > MAX_PROJECTILES) arr.splice(0, arr.length - MAX_PROJECTILES);
  }

  function spawnSlash(x: number, y: number, angle: number, now: number, color: string): void {
    const arr = slashesRef.current;
    arr.push({ x, y, angle, born: now, color });
    if (arr.length > MAX_SLASHES) arr.splice(0, arr.length - MAX_SLASHES);
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
        lv0.length === 0 &&
        projectilesRef.current.length === 0 &&
        slashesRef.current.length === 0 &&
        deathGhostsRef.current.length === 0 &&
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
      let attackingCount = 0;
      const targets = targetScratchRef.current;
      targets.clear();
      for (let i = 0; i < tw.length; i++) {
        const t = tw[i];
        targets.set(t.id, t.position);
      }
      for (let i = 0; i < lv.length; i++) {
        const u = lv[i];
        targets.set(u.id, u.position);
      }

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
        const valid = selectedAnywhereRef.current || (!onRiver && inOwn);
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
          if (t.kind === "king") {
            // Dedicated blue/red King Tower art. Fit inside the 4x4 footprint
            // while preserving the source aspect ratio, bottom-aligned.
            const king = kingTowerArt(t.owner);
            if (king !== null && king.complete && king.naturalWidth > 0) {
              upright(cx, cy, () => {
                const maxW = size * 0.98;
                const maxH = size * 1.3;
                const scale = Math.min(maxW / king.naturalWidth, maxH / king.naturalHeight);
                const dw = king.naturalWidth * scale;
                const dh = king.naturalHeight * scale;
                c.drawImage(king, -dw / 2, half * 0.92 - dh, dw, dh);
              });
            } else {
              // Pre-load fallback: keep a team plate until the PNG decodes.
              c.save();
              c.fillStyle = t.owner === "blue" ? "#1d4ed8" : "#b91c1c";
              c.strokeStyle = "#3f2a14";
              c.lineWidth = 3;
              roundedRect(c, cx - half, cy - half, size, size, 6);
              c.fill();
              c.stroke();
              c.restore();
            }
          } else {
            // Princess (side) towers use the real tower art, same treatment as
            // the king towers: bottom-aligned inside the 3x3 footprint with the
            // source aspect ratio preserved. Every crown-tower troop has its
            // own picture, so no icon badge is drawn on top.
            const side = princessTowerArt(towerTroopRef.current, t.owner);
            if (side !== null && side.complete && side.naturalWidth > 0) {
              upright(cx, cy, () => {
                const maxW = size * 0.98;
                const maxH = size * 1.25;
                const scale = Math.min(maxW / side.naturalWidth, maxH / side.naturalHeight);
                const dw = side.naturalWidth * scale;
                const dh = side.naturalHeight * scale;
                c.drawImage(side, -dw / 2, half * 0.95 - dh, dw, dh);
              });
            } else {
              // Pre-load fallback: keep the team plate until the PNG decodes.
              const plate = t.owner === "blue" ? "#1d4ed8" : "#b91c1c";
              c.save();
              c.fillStyle = plate;
              c.strokeStyle = "#3f2a14";
              c.lineWidth = 3;
              roundedRect(c, cx - half, cy - half, size, size, 6);
              c.fill();
              c.stroke();
              c.restore();
            }
          }
          // HP bar + level badge, always visually ABOVE the tower. The blue view
          // is mirrored, so "up on screen" is +y in board space there.
          const barGap = t.kind === "king" ? half + 24 : half + 8;
          const barOffset = sideRef.current === "blue" ? barGap : -barGap;
          upright(cx, cy + barOffset, () => {
            drawTowerHpBar(c, t, 0, 0, barW);
          });

          // Crown towers fight too: pick the nearest enemy in range and send a
          // visible arrow/cannonball on a fixed cadence (cosmetic; damage is
          // still authoritative on the server).
          const towerRange = t.kind === "king" ? 7 : 7.5;
          let towerTarget: Unit | null = null;
          let towerD2 = towerRange * towerRange;
          for (let ti2 = 0; ti2 < lv.length; ti2++) {
            const e = lv[ti2];
            if (e.owner === t.owner || e.hitPoints <= 0) continue;
            const dx = e.position.x - t.position.x;
            const dy = e.position.y - t.position.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= towerD2) {
              towerD2 = d2;
              towerTarget = e;
            }
          }
          if (towerTarget !== null) {
            const interval = t.kind === "king" ? 1400 : 1000;
            const last = lastTowerShotRef.current.get(t.id) ?? now - interval;
            if (now - last >= interval) {
              lastTowerShotRef.current.set(t.id, now);
              const troop = t.owner === "blue" ? towerTroopRef.current : "tower-princess";
              const kind: ProjectileKind =
                t.kind === "king"
                  ? "energy"
                  : troop === "cannoneer"
                    ? "cannonball"
                    : troop === "dagger-duchess"
                      ? "dagger"
                      : troop === "royal-chef"
                        ? "axe"
                        : "arrow";
              spawnProjectile(kind, t.position.x, t.position.y, towerTarget.position.x, towerTarget.position.y, now);
              burst(t.position.x, t.position.y, t.owner === "blue" ? "#93c5fd" : "#fca5a5", 3);
            }
          }
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

      // --- units (interpolated, strip-animated): O(v), v<=40 visible ---
      const reduced = reduceMotionRef.current;
      for (let ui = 0; ui < lv.length; ui++) {
        const u = lv[ui];
        const p = prev.get(u.id);
        const q = curr.get(u.id) ?? u.position;
        const sx = p ? lerp(p.x, q.x, alpha) : q.x;
        const sy = p ? lerp(p.y, q.y, alpha) : q.y;
        const cx = (sx + 0.5) * TW;
        const cy = (sy + 0.5) * TH;
        const card = getCard(u.cardId);
        const target = u.targetId !== undefined ? targets.get(u.targetId) : undefined;
        const attackRange = (card?.range ?? 1.1) + 0.8;
        const targetDist = target === undefined
          ? Number.POSITIVE_INFINITY
          : Math.hypot(target.x - sx, target.y - sy);
        const attacking = target !== undefined && targetDist <= attackRange && u.hitPoints > 0;
        if (attacking) attackingCount++;
        const moving = p !== undefined && Math.hypot(q.x - p.x, q.y - p.y) > 0.012;
        const spawnAt = spawnAtRef.current.get(u.id) ?? now;
        const spawnT = clamp((now - spawnAt) / 360, 0, 1);
        const pop = 0.62 + 0.38 * easeOutCubic(spawnT);
        const state: "idle" | "walk" | "attack" | "death" = reduced
          ? "idle"
          : attacking
            ? "attack"
            : moving
              ? "walk"
              : "idle";
        const facing: 1 | -1 = target !== undefined && target.x < sx ? -1 : 1;
        const interval = Math.max(250, (card?.hitSpeed ?? 1) * 1000);
        const cycle = ((now - spawnAt) % interval) / interval;
        const strike = attacking && !reduced ? Math.sin(Math.PI * Math.min(1, cycle * 1.55)) : 0;
        const dirX = target === undefined ? 0 : Math.sign(target.x - sx) || 0;
        const dirY = target === undefined ? 0 : Math.sign(target.y - sy) || 0;
        const lunge = attacking ? strike * 2.6 : 0;
        const bob = moving && !reduced
          ? Math.sin((now / 1000) * 10 + sx * 2 + sy) * 1.3
          : Math.sin((now / 1000) * 2.2 + sx + sy) * 0.55;
        const drawCx = cx + dirX * lunge;
        const drawCy = cy + dirY * lunge * 0.35 + bob;
        const drawScale = pop * (1 + strike * 0.055);
        const baseR = card?.type === "building" ? TW * 0.74 : TW * 0.64;
        const r = baseR * drawScale;
        const isBeam = BEAM_CARDS.has(u.cardId);

        // shadow
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.beginPath();
        c.ellipse(drawCx, drawCy + r * 0.8, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
        c.fill();

        // Team identity without a hard ring: a soft ground glow under the feet,
        // a drop shadow, and the team-coloured HP bar. The sprite itself is not
        // enclosed by a red/blue circle any more.
        const flash = now - (flashMap.get(u.id) ?? -1e9) < 120;
        c.save();
        c.globalAlpha = 0.34;
        c.fillStyle = u.owner === "blue" ? "#3b82f6" : "#ef4444";
        c.beginPath();
        c.ellipse(drawCx, drawCy + r * 0.74, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();

        // Real 2D strip art (soft feathered edges baked into the strip). The
        // static-art fallback keeps a circular clip so it never shows a square.
        let spriteDrawn = false;
        // Phase 19: a hidden unit (invisible Royal Ghost, buried Tesla) is
        // drawn faintly so the player can still see where it is.
        const hidden = u.invisible === true;
        if (hidden) {
          c.save();
          c.globalAlpha = 0.32;
        }
        upright(drawCx, drawCy, () => {
          spriteDrawn = drawCardSprite(c, u.cardId, state, now, r * 2.08, facing, 1, u.owner);
        });
        if (!spriteDrawn) {
          const art = artFor(u.cardId, u.owner);
          c.save();
          c.beginPath();
          c.arc(drawCx, drawCy, Math.max(1, r - 1), 0, Math.PI * 2);
          c.clip();
          upright(drawCx, drawCy, () => {
            if (art !== null && art.complete && art.naturalWidth > 0) {
              const d = r * 1.8;
              c.drawImage(art, -d / 2, -d / 2, d, d);
            } else {
              c.font = "13px serif";
              c.textAlign = "center";
              c.textBaseline = "middle";
              c.fillText(emojiFor(u.cardId), 0, 0.5);
            }
          });
          c.restore();
        }
        if (hidden) c.restore();

        if (flash) {
          c.save();
          c.globalAlpha = 0.5;
          c.fillStyle = "#ffffff";
          c.beginPath();
          c.arc(drawCx, drawCy, Math.max(1, r - 1), 0, Math.PI * 2);
          c.fill();
          c.restore();
        }

        // Deploy ring.
        if (spawnT < 1) {
          c.save();
          c.globalAlpha = 1 - spawnT;
          c.strokeStyle = u.owner === "blue" ? "#93c5fd" : "#fca5a5";
          c.lineWidth = 2;
          c.beginPath();
          c.arc(cx, cy, r * (1 + spawnT * 0.7), 0, Math.PI * 2);
          c.stroke();
          c.restore();
        }

        // Attack cadence: spawn one visible projectile/slash per hitSpeed.
        const lastShot = lastShotRef.current.get(u.id) ?? now;
        if (attacking && target !== undefined && now - spawnAt > 260 && now - lastShot >= interval) {
          lastShotRef.current.set(u.id, now);
          if (isBeam) {
            // Beam cards draw a continuous beam below; just spark on the target.
            burst(target.x, target.y, u.cardId === "electro-wizard" || u.cardId === "electro-dragon" ? "#fde047" : "#fb923c", 3);
          } else if ((card?.range ?? 0) > 1.5) {
            spawnProjectile(
              projectileStyle(u.cardId),
              sx,
              sy,
              target.x,
              target.y,
              now,
            );
          } else {
            spawnSlash(
              target.x,
              target.y,
              Math.atan2(target.y - sy, target.x - sx),
              now,
              u.owner === "blue" ? "#dbeafe" : "#fee2e2",
            );
          }
        }

        // Inferno / electro continuous beam.
        if (isBeam && attacking && target !== undefined) {
          const electro = u.cardId === "electro-wizard" || u.cardId === "electro-dragon" || u.cardId === "tesla" || u.cardId === "zappies";
          const beamColor = electro ? "#fde047" : "#fb923c";
          c.save();
          c.globalAlpha = 0.65 + Math.sin(now / 55) * 0.2;
          c.strokeStyle = beamColor;
          c.lineWidth = electro ? 2 : 3;
          c.shadowColor = beamColor;
          c.shadowBlur = 10;
          c.beginPath();
          c.moveTo(cx, cy);
          if (electro) {
            const segs = 6;
            for (let k = 1; k <= segs; k++) {
              const t = k / segs;
              const jitter = k === segs ? 0 : Math.sin(now / 40 + k * 2.4) * 0.22;
              c.lineTo(
                lerp(cx, (target.x + 0.5) * TW, t) + jitter * TW,
                lerp(cy, (target.y + 0.5) * TH, t) + jitter * TW,
              );
            }
          } else {
            c.lineTo((target.x + 0.5) * TW, (target.y + 0.5) * TH);
          }
          c.stroke();
          c.restore();
          const lastSpark = lastBeamSparkRef.current.get(u.id) ?? 0;
          if (now - lastSpark > 150) {
            lastBeamSparkRef.current.set(u.id, now);
            burst(target.x, target.y, beamColor, 2);
          }
        }

        // HP bar + level badge.
        const max = Math.max(1, u.maxHitPoints);
        const pct = clamp(u.hitPoints / max, 0, 1);
        const bw = TW * 1.5;
        upright(drawCx, drawCy, () => {
          const barY = -r - 8;
          drawUnitLevelBadge(c, u.level ?? 1, u.owner, -bw / 2 - 6.5, barY + 2.5, 11);
          c.fillStyle = "rgba(0,0,0,0.65)";
          c.fillRect(-bw / 2, barY, bw, 5);
          c.fillStyle = u.owner === "blue" ? "#3b82f6" : "#ef4444";
          c.fillRect(-bw / 2 + 0.5, barY + 0.5, (bw - 1) * pct, 4);
        });
      }

      // --- projectiles: O(p), p<=80; cosmetic only (server owns damage) ---
      {
        const proj = projectilesRef.current;
        let w = 0;
        const arcSign = sideRef.current === "blue" ? 1 : -1;
        for (let i = 0; i < proj.length; i++) {
          const pr = proj[i];
          const age = (now - pr.born) / pr.duration;
          if (age >= 1) {
            burst(pr.x1, pr.y1, pr.color, pr.kind === "fireball" || pr.kind === "shell" ? 8 : 3);
            continue;
          }
          proj[w++] = pr;
          const t = clamp(age, 0, 1);
          const x = lerp(pr.x0, pr.x1, t) * TW;
          const y = lerp(pr.y0, pr.y1, t) * TH - arcSign * pr.arc * TW * Math.sin(Math.PI * t);
          const px = lerp(pr.x0, pr.x1, Math.max(0, t - 0.18)) * TW;
          const py = lerp(pr.y0, pr.y1, Math.max(0, t - 0.18)) * TH - arcSign * pr.arc * TW * Math.sin(Math.PI * Math.max(0, t - 0.18));
          c.save();
          c.globalAlpha = 0.9;
          c.strokeStyle = pr.color;
          c.fillStyle = pr.color;
          c.lineCap = "round";
          if (pr.kind === "arrow" || pr.kind === "spear" || pr.kind === "dagger" || pr.kind === "bullet") {
            c.lineWidth = pr.kind === "bullet" ? 2 : 1.6;
            c.beginPath();
            c.moveTo(px, py);
            c.lineTo(x, y);
            c.stroke();
            const a = Math.atan2(y - py, x - px);
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x - Math.cos(a - 0.45) * 4, y - Math.sin(a - 0.45) * 4);
            c.lineTo(x - Math.cos(a + 0.45) * 4, y - Math.sin(a + 0.45) * 4);
            c.closePath();
            c.fill();
          } else if (pr.kind === "bolt") {
            c.lineWidth = 2.2;
            c.beginPath();
            c.moveTo(px, py);
            c.lineTo((px + x) / 2 + 4, (py + y) / 2 - 4);
            c.lineTo((px + x) / 2 - 4, (py + y) / 2 + 4);
            c.lineTo(x, y);
            c.stroke();
          } else if (pr.kind === "axe") {
            c.translate(x, y);
            c.rotate(t * Math.PI * 3);
            c.fillRect(-4, -1.5, 8, 3);
            c.fillStyle = "#94a3b8";
            c.fillRect(-1, -5, 3, 10);
          } else {
            const radius = pr.kind === "fireball" ? 4.5 : pr.kind === "energy" ? 4 : pr.kind === "cannonball" || pr.kind === "boulder" ? 3.6 : 3;
            c.shadowColor = pr.color;
            c.shadowBlur = pr.kind === "fireball" || pr.kind === "energy" ? 10 : 4;
            c.beginPath();
            c.arc(x, y, radius, 0, Math.PI * 2);
            c.fill();
            c.globalAlpha = 0.35;
            c.lineWidth = 2;
            c.beginPath();
            c.moveTo(px, py);
            c.lineTo(x, y);
            c.stroke();
          }
          c.restore();
        }
        proj.length = w;
      }

      // --- melee slashes / impact arcs ---
      {
        const slashes = slashesRef.current;
        let w = 0;
        for (let i = 0; i < slashes.length; i++) {
          const sl = slashes[i];
          const age = (now - sl.born) / 180;
          if (age >= 1) continue;
          slashes[w++] = sl;
          const x = (sl.x + 0.5) * TW;
          const y = (sl.y + 0.5) * TH;
          const rad = TW * (0.3 + age * 0.55);
          c.save();
          c.globalAlpha = 1 - age;
          c.strokeStyle = sl.color;
          c.lineWidth = 3;
          c.beginPath();
          c.arc(x, y, rad, sl.angle - 0.85, sl.angle + 0.85);
          c.stroke();
          c.restore();
        }
        slashes.length = w;
      }

      // --- death ghosts: last strip frame fading out ---
      {
        const ghosts = deathGhostsRef.current;
        let w = 0;
        for (let i = 0; i < ghosts.length; i++) {
          const g = ghosts[i];
          const age = (now - g.born) / 540;
          if (age >= 1) continue;
          ghosts[w++] = g;
          const gx = (g.x + 0.5) * TW;
          const gy = (g.y + 0.5) * TH;
          const size = TW * 1.35;
          upright(gx, gy, () => {
            if (!drawCardSprite(c, g.cardId, "death", g.born, size, 1, 1 - age, g.owner)) {
              // the new 10 frame sheets have no death row: fade the static
              // per-team card art out instead
              const art = artFor(g.cardId, g.owner);
              c.globalAlpha = 1 - age;
              if (art !== null && art.complete && art.naturalWidth > 0) {
                const d = size * 0.95;
                c.drawImage(art, -d / 2, -d / 2, d, d);
              } else {
                c.fillStyle = g.owner === "blue" ? "#93c5fd" : "#fca5a5";
                c.beginPath();
                c.arc(0, 0, TW * 0.5 * (1 - age * 0.4), 0, Math.PI * 2);
                c.fill();
              }
            }
          });
        }
        ghosts.length = w;
      }

      // --- spells: card-specific cast + impact VFX: O(s), s<=8 drawn ---
      const spellsArr = spellsRef.current;
      let spellsDrawn = 0;
      for (let si = 0; si < spellsArr.length && spellsDrawn < MAX_SPELLS_DRAWN; si++) {
        const s = spellsArr[si];
        const dur = s.durationMs ?? 1100;
        const age = (now - s.startedAt) / dur;
        if (age < 0 || age > 1.35) continue;
        spellsDrawn++;
        const t = clamp(age, 0, 1);
        const cx = (s.x + 0.5) * TW;
        const cy = (s.y + 0.5) * TH;
        const maxR = (s.radius ?? 2.5) * TW;
        const rad = maxR * (0.22 + 0.78 * easeOutCubic(t));
        const alpha = clamp(1 - t, 0, 1);
        const kind = s.kind;
        c.save();
        c.globalAlpha = alpha;
        c.textAlign = "center";
        c.textBaseline = "middle";
        const ring = (r: number, color: string, width = 3) => {
          c.strokeStyle = color;
          c.lineWidth = width;
          c.beginPath();
          c.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
          c.stroke();
        };
        const bolt = (x0: number, y0: number, x1: number, y1: number, color: string, width = 2) => {
          c.strokeStyle = color;
          c.lineWidth = width;
          c.beginPath();
          c.moveTo(x0, y0);
          const segs = 5;
          for (let k = 1; k <= segs; k++) {
            const q = k / segs;
            const jitter = k === segs ? 0 : (k % 2 === 0 ? -1 : 1) * maxR * 0.12;
            c.lineTo(lerp(x0, x1, q) + jitter, lerp(y0, y1, q));
          }
          c.stroke();
        };

        if (kind === "arrows") {
          ring(rad, "#f8fafc", 2);
          ring(rad * 0.72, "#e2e8f0", 1.5);
          ring(rad * 0.44, "#cbd5e1", 1);
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + t * 1.6;
            const rr = rad * (0.55 + (k % 3) * 0.16);
            const ax = cx + Math.cos(a) * rr;
            const ay = cy + Math.sin(a) * rr;
            c.strokeStyle = "#f8fafc";
            c.lineWidth = 1.4;
            c.beginPath();
            c.moveTo(ax, ay);
            c.lineTo(ax - Math.cos(a) * 6, ay - Math.sin(a) * 6);
            c.stroke();
          }
        } else if (kind === "zap" || kind === "lightning") {
          c.fillStyle = kind === "zap" ? "#fef08a" : "#f8fafc";
          c.beginPath();
          c.arc(cx, cy, rad * (kind === "zap" ? 0.75 : 0.35), 0, Math.PI * 2);
          c.fill();
          const bolts = kind === "lightning" ? 3 : 1;
          for (let k = 0; k < bolts; k++) {
            const bx = cx + (k - (bolts - 1) / 2) * maxR * 0.5;
            bolt(bx, cy - maxR * (1.3 + k * 0.15), bx, cy + rad * 0.4, "#fde047", 3);
            bolt(bx, cy - maxR * 1.1, bx, cy + rad * 0.2, "#fffbeb", 1.5);
          }
          ring(rad, "#facc15", 2);
        } else if (kind === "fireball" || kind === "rocket") {
          const big = kind === "rocket";
          const g = c.createRadialGradient(cx, cy, 2, cx, cy, rad);
          g.addColorStop(0, "#fffbeb");
          g.addColorStop(0.35, "#fbbf24");
          g.addColorStop(0.7, "#f97316");
          g.addColorStop(1, "rgba(185,28,28,0)");
          c.fillStyle = g;
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.fill();
          ring(rad * 0.9, "#f97316", big ? 5 : 3);
          ring(rad * 0.55, "#facc15", 2);
          if (big) {
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2 + 0.4;
              bolt(cx, cy, cx + Math.cos(a) * rad * 1.4, cy + Math.sin(a) * rad * 1.4, "#fbbf24", 2);
            }
          }
        } else if (kind === "poison" || kind === "goblin-curse" || kind === "void") {
          const color = kind === "poison" ? "#84cc16" : kind === "void" ? "#a855f7" : "#22c55e";
          c.fillStyle = kind === "void" ? "rgba(88,28,135,0.3)" : "rgba(74,222,128,0.16)";
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.fill();
          ring(rad, color, 2);
          for (let k = 0; k < 9; k++) {
            const a = (k / 9) * Math.PI * 2 + t * 2.2;
            const rr = rad * (0.2 + ((k * 37) % 10) / 14);
            const bx = cx + Math.cos(a) * rr;
            const by = cy + Math.sin(a) * rr - t * 14;
            c.fillStyle = color;
            c.globalAlpha = alpha * 0.7;
            c.beginPath();
            c.arc(bx, by, 2 + (k % 3), 0, Math.PI * 2);
            c.fill();
          }
        } else if (kind === "freeze" || kind === "giant-snowball") {
          c.fillStyle = "rgba(165,243,252,0.3)";
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.fill();
          ring(rad, "#a5f3fc", 2.5);
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const r0 = rad * 0.25;
            const r1 = rad * (0.75 + (k % 2) * 0.18);
            c.strokeStyle = "#e0f2fe";
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            c.stroke();
          }
          c.fillStyle = "#f0f9ff";
          c.beginPath();
          c.arc(cx, cy, rad * (kind === "giant-snowball" ? 0.35 : 0.18), 0, Math.PI * 2);
          c.fill();
        } else if (kind === "rage") {
          const g = c.createRadialGradient(cx, cy, 2, cx, cy, rad);
          g.addColorStop(0, "rgba(244,114,182,0.45)");
          g.addColorStop(1, "rgba(190,24,93,0)");
          c.fillStyle = g;
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.fill();
          ring(rad, "#f472b6", 2);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 - t * 2;
            c.strokeStyle = "#f9a8d4";
            c.lineWidth = 2;
            c.beginPath();
            c.arc(cx, cy, rad * (0.35 + (k % 3) * 0.18), a, a + 1.1);
            c.stroke();
          }
        } else if (kind === "tornado") {
          ring(rad, "#67e8f9", 1.5);
          for (let k = 0; k < 3; k++) {
            c.strokeStyle = k === 0 ? "#a5f3fc" : "#22d3ee";
            c.lineWidth = 2;
            c.beginPath();
            const rr = rad * (0.3 + k * 0.22);
            const a0 = t * 7 + k * 1.2;
            c.arc(cx, cy, rr, a0, a0 + Math.PI * 1.25);
            c.stroke();
          }
        } else if (kind === "earthquake") {
          for (let k = 0; k < 3; k++) {
            const ageK = clamp((t - k * 0.12) / 0.64, 0, 1);
            c.globalAlpha = alpha * (1 - ageK * 0.5);
            c.strokeStyle = k === 0 ? "#f59e0b" : "#a16207";
            c.lineWidth = 3 - k * 0.6;
            c.beginPath();
            c.arc(cx, cy, maxR * (0.18 + ageK * 0.82), 0, Math.PI * 2);
            c.stroke();
          }
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            c.strokeStyle = "#d97706";
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(cx + Math.cos(a) * rad * 0.35, cy + Math.sin(a) * rad * 0.35);
            c.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
            c.stroke();
          }
        } else if (kind === "the-log") {
          c.save();
          c.translate(cx, cy);
          c.rotate(-0.08);
          c.fillStyle = "#7c4a21";
          c.strokeStyle = "#451a03";
          c.lineWidth = 2;
          const logW = maxR * 1.3;
          const logH = maxR * 0.38;
          c.fillRect(-logW / 2, -logH / 2, logW, logH);
          c.strokeRect(-logW / 2, -logH / 2, logW, logH);
          for (let k = -2; k <= 2; k++) {
            c.beginPath();
            c.moveTo(k * logW * 0.14, -logH / 2);
            c.lineTo(k * logW * 0.18, logH / 2);
            c.stroke();
          }
          c.restore();
          c.globalAlpha = alpha * 0.5;
          ring(rad, "#a16207", 2);
        } else if (kind === "goblin-barrel" || kind === "barbarian-barrel" || kind === "royal-delivery") {
          const color = kind === "goblin-barrel" ? "#65a30d" : kind === "barbarian-barrel" ? "#f59e0b" : "#f8fafc";
          ring(rad, color, 3);
          c.strokeStyle = color;
          c.lineWidth = 3;
          c.strokeRect(cx - TW * 0.5, cy - TW * 0.6, TW, TW * 1.2);
          c.beginPath();
          c.moveTo(cx - TW * 0.5, cy - TW * 0.15);
          c.lineTo(cx + TW * 0.5, cy - TW * 0.15);
          c.moveTo(cx - TW * 0.5, cy + TW * 0.25);
          c.lineTo(cx + TW * 0.5, cy + TW * 0.25);
          c.stroke();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + t * 3;
            c.fillStyle = color;
            c.beginPath();
            c.arc(cx + Math.cos(a) * rad * 0.8, cy + Math.sin(a) * rad * 0.8, 2, 0, Math.PI * 2);
            c.fill();
          }
        } else if (kind === "graveyard") {
          c.fillStyle = "rgba(126,34,206,0.18)";
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.fill();
          ring(rad, "#a855f7", 2.5);
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2 + 0.6;
            const rr = rad * (0.2 + ((k * 29) % 9) / 14);
            const bx = cx + Math.cos(a) * rr;
            const by = cy + Math.sin(a) * rr;
            c.fillStyle = "#e9d5ff";
            c.beginPath();
            c.arc(bx, by, 2.2, 0, Math.PI * 2);
            c.fill();
            c.fillRect(bx - 1, by + 1, 2, 3);
          }
        } else if (kind === "clone") {
          ring(rad, "#38bdf8", 2);
          c.fillStyle = "rgba(56,189,248,0.22)";
          c.beginPath();
          c.arc(cx, cy, rad, 0, Math.PI * 2);
          c.fill();
        } else {
          ring(rad, "#f97316", 4);
          ring(rad * 0.7, "#facc15", 2);
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

      // Lightweight debug counters for visual verification/tests.
      const attachProj = String(projectilesRef.current.length);
      if (canvas.dataset.projectiles !== attachProj) canvas.dataset.projectiles = attachProj;
      const attachAtk = String(attackingCount);
      if (canvas.dataset.attacking !== attachAtk) canvas.dataset.attacking = attachAtk;
      const attachSpells = String(spellsDrawn);
      if (canvas.dataset.spells !== attachSpells) canvas.dataset.spells = attachSpells;
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
