# CONTEXT.md — docs/

> Per MEMORY.md §2: purpose, tech, structure, how to run/test, key files, conventions.

## Purpose
Human + agent documentation hub. Design specs, per-feature issue logs and test reports,
and templates that keep the 6-step execution pipeline (MEMORY.md §11) auditable.

## Tech
- Markdown only (GitHub-flavored). No build step; preview in any editor or `github.com`.
- Normative game spec: `docs/GAME_DESIGN.md` (Phase 2+). This phase only ships the stub.

## Structure
- `GAME_DESIGN_STUB.md` — placeholder headings for Phase 2 (overview, win conditions, cards,
  elixir, arenas, towers, tick rate, protocol, balance). Becomes `GAME_DESIGN.md` in Phase 2.
- `CONTEXT.md` — this file.
- `ISSUES_TEMPLATE.md` — template review agents copy to `docs/ISSUES_<feature>.md`.
- `ISSUES_<feature>.md` (Phase 3+; review agents) — correctness/security/perf findings with IDs (`ISS-001`…).
- `TEST_REPORT_<feature>.md` (Phase 3+; test agents) — unit/integration/e2e + docker manual results.

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
