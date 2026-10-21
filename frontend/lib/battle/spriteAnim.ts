/**
 * 2D strip animation for deployed cards.
 *
 * Strips are built by `scripts/make_card_sprites_from_sheet.py` from the 4x5
 * sprite sheets in `docs/card-art/sheets/` (rendered from the CC0 3D models
 * by `scripts/make_card_sheets.py`):
 *
 *   0-4 walk, 5-9 attack  (10 frames, 96x96)
 *
 * The older strips (built by `scripts/make_card_sprites.py` from the static
 * card art) are still supported as a fallback:
 *
 *   0-1 idle, 2-5 walk, 6 attack, 7 death  (8 frames, 96x96)
 *
 * Every card has TWO views, exactly like the towers:
 *
 *   front -> the red team (the character seen from the front)
 *   back  -> the blue team (the character seen from behind)
 *
 * The loader is lazy and caches one Image per card+view. A missing strip
 * returns false so the canvas can fall back to the static per-team card art
 * and, if that is missing too, to the glyph - a match never breaks.
 */

import { resolveCardArtId } from "../cardAliases";

export type SpriteState = "idle" | "walk" | "attack" | "death";
export type SpriteView = "front" | "back";
export type SpriteTeam = "red" | "blue";

export const SPRITE_FRAME = 96;

const FPS: Record<SpriteState, number> = {
  idle: 2.4,
  walk: 9,
  attack: 12,
  death: 1,
};

/** The sheet strips: 10 frames (5 walk + 5 attack). */
const FRAME_INDEX_10: Record<SpriteState, readonly number[]> = {
  idle: [0],
  walk: [0, 1, 2, 3, 4],
  attack: [5, 6, 7, 8, 9],
  // the sheets have no death row: the last walk frame is faded out instead
  death: [4],
};
/** Current strips: 8 frames. Legacy strips (the old generator) have 6. */
const FRAME_INDEX_8: Record<SpriteState, readonly number[]> = {
  idle: [0, 1],
  walk: [2, 3, 4, 5],
  attack: [6],
  death: [7],
};
const FRAME_INDEX_6: Record<SpriteState, readonly number[]> = {
  idle: [0, 1],
  walk: [2, 3],
  attack: [4],
  death: [5],
};

/**
 * The team decides which view is drawn: red plays the front art, blue plays
 * the back art (the blue player sees their own side from behind) - the same
 * rule the king and princess towers use.
 */
export function spriteViewForTeam(team: SpriteTeam): SpriteView {
  return team === "blue" ? "back" : "front";
}

interface Entry {
  view: HTMLImageElement | null;
  viewFailed: boolean;
}

const cache = new Map<string, Entry>();
const legacyCache = new Map<string, HTMLImageElement | "missing">();

function slugFor(cardId: string): string {
  return resolveCardArtId(cardId).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function entryFor(slug: string, view: SpriteView): Entry {
  const key = `${slug}:${view}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const entry: Entry = { view: null, viewFailed: false };
  if (typeof window !== "undefined") {
    const img = new Image();
    img.decoding = "async";
    img.onerror = () => {
      entry.viewFailed = true;
    };
    img.src = `/sprites/${slug}-${view}.png`;
    entry.view = img;
  }
  cache.set(key, entry);
  return entry;
}

/** The old warped team strips (8 frames) - only used when a sheet is missing. */
function legacyTeamImage(slug: string, view: SpriteView): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const key = `${slug}:${view}`;
  const hit = legacyCache.get(key);
  if (hit !== undefined) return hit === "missing" ? null : hit;
  const img = new Image();
  img.decoding = "async";
  img.onerror = () => legacyCache.set(key, "missing");
  img.src = `/sprites/legacy/${slug}-${view}.png`;
  legacyCache.set(key, img);
  return img;
}

/** The old team-neutral strip - only used when a team strip is missing. */
function legacyImage(slug: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const hit = legacyCache.get(slug);
  if (hit !== undefined) return hit === "missing" ? null : hit;
  const img = new Image();
  img.decoding = "async";
  img.onerror = () => legacyCache.set(slug, "missing");
  img.src = `/sprites/${slug}.png`;
  legacyCache.set(slug, img);
  return img;
}

function ready(img: HTMLImageElement | null): boolean {
  return img !== null && img.complete && img.naturalWidth > 0;
}

/**
 * The strip to draw for a card: the team strip first, the old warped team
 * strip and then the old team neutral one as a fallback. Returns null while
 * nothing is usable yet.
 */
export function spriteImage(cardId: string, team: SpriteTeam = "red"): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const slug = slugFor(cardId);
  const view = spriteViewForTeam(team);
  const entry = entryFor(slug, view);
  if (ready(entry.view)) return entry.view;
  if (entry.viewFailed) {
    const old = legacyTeamImage(slug, view);
    if (ready(old)) return old;
    const legacy = legacyImage(slug);
    return ready(legacy) ? legacy : legacy;
  }
  return entry.view;
}

export function preloadCardSprite(cardId: string, team: SpriteTeam = "red"): void {
  spriteImage(cardId, team);
}

/**
 * Draw one animation frame centred at (0,0) in the current canvas space.
 * Returns false when no strip exists (caller should fall back to card art).
 * O(1): one drawImage, no allocations in the hot path.
 */
export function drawCardSprite(
  c: CanvasRenderingContext2D,
  cardId: string,
  state: SpriteState,
  nowMs: number,
  size: number,
  facing: 1 | -1 = 1,
  alpha = 1,
  team: SpriteTeam = "red",
): boolean {
  const img = spriteImage(cardId, team);
  if (!ready(img)) return false;
  const frames = Math.max(1, Math.round((img as HTMLImageElement).naturalWidth / SPRITE_FRAME));
  const layout = frames >= 10 ? FRAME_INDEX_10 : frames >= 8 ? FRAME_INDEX_8 : FRAME_INDEX_6;
  const indices = layout[state];
  if (indices.length === 0) return false;
  const fps = FPS[state];
  const idx = indices[Math.floor((nowMs / 1000) * fps) % indices.length];
  c.save();
  c.globalAlpha = alpha;
  c.scale(facing, 1);
  c.drawImage(
    img as HTMLImageElement,
    idx * SPRITE_FRAME,
    0,
    SPRITE_FRAME,
    SPRITE_FRAME,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  c.restore();
  return true;
}
