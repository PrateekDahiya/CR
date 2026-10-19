import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { CHILD_CARD_ALIAS, resolveCardArtId, unitGlyph } from "../lib/cardAliases";

/**
 * Phase 14 — spawned children must never render as an unresolved "?" glyph.
 *
 * Child templates use singular ids (`barbarian`) while the art and catalog use
 * the deck-card id (`barbarians`), so a Barbarian Hut used to spawn a perfectly
 * good Barbarian that drew as "?".
 */

const repoRoot = path.resolve(__dirname, "..", "..");
const templates = JSON.parse(
  readFileSync(path.join(repoRoot, "infra", "mysql", "spawn_templates.json"), "utf8"),
) as Record<string, unknown>;
const childIds = Object.keys(templates);

const artDir = path.join(repoRoot, "frontend", "public", "cards");
const hasArt = (slug: string): boolean => existsSync(path.join(artDir, `${slug}.png`));

test.describe("spawned child rendering", () => {
  test("every child template has a glyph (never the unknown marker)", () => {
    for (const id of childIds) {
      const glyph = unitGlyph(id);
      expect(glyph, `${id} has no glyph`).toBeTruthy();
      expect(glyph).not.toBe("❓");
      expect(glyph).not.toBe("?");
    }
  });

test("every child template renders as art or a legible glyph", () => {
    // A child resolves to real art through its alias; anything without art must
    // still have a glyph (asserted above), so this test just proves no child
    // silently resolves to a missing asset that would fall back to nothing.
    for (const id of childIds) {
      const slug = resolveCardArtId(id);
      if (slug === id) continue; // not aliased -> glyph fallback path
      expect(hasArt(slug), `${id} aliases to ${slug} but that art is missing`).toBe(true);
    }
  });

  test("aliases point at real art files", () => {
    for (const [child, cardId] of Object.entries(CHILD_CARD_ALIAS)) {
      expect(childIds, `${child} is not a child template`).toContain(child);
      expect(hasArt(cardId), `alias ${child} -> ${cardId} has no art file`).toBe(true);
      expect(resolveCardArtId(child)).toBe(cardId);
    }
  });

  test("deck cards pass through the resolver unchanged", () => {
    expect(resolveCardArtId("giant")).toBe("giant");
    expect(resolveCardArtId("barbarian-hut")).toBe("barbarian-hut");
  });

  test("known catalogue cards all have real art and a glyph", async () => {
    const { CARD_LIST } = await import("../lib/cards");
    for (const card of CARD_LIST) {
      expect(unitGlyph(card.id), `${card.id} glyph`).toBeTruthy();
      expect(hasArt(card.id), `${card.id} has no art file`).toBe(true);
    }
  });
});