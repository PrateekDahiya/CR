# CONTEXT.md — docs/

> Per MEMORY.md §2: purpose, tech, structure, how to run/test, key files, conventions.

## Purpose
Human + agent documentation hub. Design specs, per-feature issue logs and test reports,
and templates that keep the 6-step execution pipeline (MEMORY.md §11) auditable.

## Tech
- Markdown only (GitHub-flavored). No build step; preview in any editor or `github.com`.
- Normative game spec: `docs/GAME_DESIGN.md` (Phase 2+). This phase only ships the stub.
- Source of truth (Phase 3+): `docs/GAME_DESIGN.md` is the normative spec (cards/balance, arena/towers/elixir/tick/win, protocol). All Phase 3+ server/client work implements it; DRAFT_*.md working files removed.

## Structure
- `GAME_DESIGN_STUB.md` — placeholder headings for Phase 2 (overview, win conditions, cards,
  elixir, arenas, towers, tick rate, protocol, balance). Becomes `GAME_DESIGN.md` in Phase 2.
- `CONTEXT.md` — this file.
- `ISSUES_TEMPLATE.md` — template review agents copy to `docs/ISSUES_<feature>.md`.
- `ISSUES_<feature>.md` (Phase 3+; review agents) — correctness/security/perf findings with IDs (`ISS-001`…).
- `TEST_REPORT_<feature>.md` (Phase 3+; test agents) — unit/integration/e2e + docker manual results.
- `tower-art/` - the tower art sources + contact sheet + the hand-edit list
  (`scripts/fetch_tower_art.py`, `scripts/make_tower_art.py`,
  `scripts/prepare_edited_tower_art.py`).
- `card-art/` - the per-team card art sources (front + back view), the in-game
  preview clips, two contact sheets and the list of files that still need hand
  editing (`scripts/fetch_card_art.py`, `scripts/make_card_art.py`,
  `scripts/make_card_sprites.py`, `scripts/prepare_edited_card_art.py`).
  It also holds the **4x5 animation sheets** of every card
  (`sheets/<card>.png`, 480x384) that are rendered from the CC0 KayKit 3D
  models by `scripts/make_card_sheets.py` + `scripts/blender/render_card_sheet.py`
  (recipe: `scripts/card-sheets/spec.py`), their provenance
  (`SHEET_SOURCES.json`), the licence notes (`CREDITS.md`) and the review
  pages that compare a sheet with the original card render
  (`scripts/card-sheets/compare_sheets.py` -> `review/`).
  It also holds `SOURCES_AND_TOOLS.md` (the free sprite packs, the free AI
  generators and the licence matrix for the next animation pass) and
  `NEXT_SESSION_PROMPT.md` (the handover prompt for that task).
- `UI_REFERENCE.md` - the Clash Royale look, broken down per screen (§7 now
  covers the battle log sheet: battles/tournaments tabs, the per-battle deck
  rows and the Practice/Watch buttons).

## How to run / test
Docs need no build. Conventions check (manual):
```powershell
# from repo root
Get-ChildItem docs/
# expect: CONTEXT.md, GAME_DESIGN_STUB.md, ISSUES_TEMPLATE.md (Phase 1)
```

## Key files
- `docs/GAME_DESIGN_STUB.md:1` — Phase-2 outline (STUB status header).
- `docs/ISSUES_TEMPLATE.md:1` — copy-me template (`ISS-###` IDs, severity, status lifecycle).
- `docs/CONTEXT.md:1` — this map.

## Conventions (from MEMORY.md §11 — mandatory for review/test/fix agents)
- Review agents file issues ONLY in `docs/ISSUES_<feature>.md` (copied from template).
  IDs stable: `ISS-001`, `ISS-002`, … with `Severity: blocker|major|minor` and
  `Status: open|fixed|verified|wontfix`.
- Test agents log ONLY in `docs/TEST_REPORT_<feature>.md` (env, steps, expected/actual, verdict).
- Fix agents link `Fixes: ISS-00X` and flip status; verifier flips to `verified`.
- Never edit `GAME_DESIGN_STUB.md` to add real numbers — write `docs/GAME_DESIGN.md` in Phase 2 instead.
- Keep this `CONTEXT.md` updated at every phase boundary.
