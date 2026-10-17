# ISSUES — phase-5-arena (2026-10-17, reviewer: arena-canvas-review-agent)

> Scope: exact-CR arena canvas review per MEMORY#18 + docs/UI_REFERENCE.md §§2-4 + docs/GAME_DESIGN.md §§5-9.
> Read-only elsewhere; no commits; sibling outputs untouched (docs/ISSUES_phase-5-flow.md, docs/TEST_REPORT_phase-5-static.md).
> Reference screenshots (MEMORY#18) consulted as spec context: wikipedia 1v1/2v2 portrait, supercell.com arena colors/card style, fandom Arenas river/bridges/towers layout.

## Summary
- Scope reviewed: `frontend/components/battle/ArenaCanvas.tsx` (619 lines), `frontend/components/battle/TowerView.tsx` (160 lines), `shared/types.ts` (`Tower`/`Unit`/`GameState` wire surface)
- Commit/branch: `feature/phase-5-battle-client@4aff0d1`
- Verdict: pass-with-issues (no blockers; 1 major, 7 minor; 16 PASS checks)
- Note: `docs/ISSUES_phase-5-arena.md` did not exist at review start — created by this agent. No other files created/edited.

## Issues
### ISS-A5-001 — Pocket cells marked invalid (valid check ignores 4-tile pocket bands)
- **Severity**: major
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:354-359`
- **Category**: correctness
- **Description**: `valid = !onRiver && inOwn` where `inOwn` is only the own half (`[0,14]` blue / `[17,31]` red). GAME_DESIGN §5.3 pocket (`Blue y=17-20`, `Red y=11-14` on taken lane side) is legally playable after a princess kill, but the canvas paints those cells with the red-invalid fill + X. Player gets wrong deploy feedback (server would accept, canvas says invalid).
- **Repro**: Read lines 284-286 (ownY/foeY) vs 354-359 (valid). Select a card as blue, tap `(x=3, y=18)` after left princess kill — canvas shows red X, server per §5.3/§11.2 accepts.
- **Suggested fix**: Compute pocket from towers prop (enemy princess destroyed on lane side → extend valid band to `y<=20` blue / `y>=11` red for `x<9` / `x>=9`), matching the dotted rects at lines 300-309. Reuse one `isValidDeploy(x,y)` helper for tint + X + click gating.
- **Fixes**:

### ISS-A5-002 — Pocket dotted rects always drawn, even before any princess falls
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:295-313`
- **Category**: correctness
- **Description**: Both pocket rects stroke unconditionally every frame. UI_REFERENCE §3 presents the pocket as a post-kill deploy extension; always-on dotted boxes mislead (suggests pocket playable from `t=0`) and compound ISS-A5-001 (boxes drawn but cells inside marked invalid).
- **Repro**: Render with full-HP towers — dotted `y17-20` boxes still visible.
- **Suggested fix**: Only stroke a pocket rect when the corresponding enemy princess `destroyed === true` (derive from `towersRef`), or only while a card is selected. Otherwise skip.
- **Fixes**:

### ISS-A5-003 — Enemy-half red tint on any selection, spec says red only on hover-invalid
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:287-292`
- **Category**: correctness
- **Description**: On any `sel`, whole enemy half gets `rgba(239,68,68,0.16)`. UI_REFERENCE §3: own half blue tint on card select; enemy half red tint on hover-invalid. Current behavior pre-paints the full enemy half red even when hovering a valid own-half cell.
- **Repro**: Select card, tap own-half cell — enemy half still red.
- **Suggested fix**: Keep blue own-half tint on select; paint red only the hovered invalid cell (already done at 367-378) or the enemy half only when `sel` itself is in the enemy half/river.
- **Fixes**:

### ISS-A5-004 — King activation visual missing (no eyes-open / active state)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:393-406`; `shared/types.ts:39-47`
- **Category**: correctness
- **Description**: UI_REFERENCE §3 requires "king activation eyes open". Canvas draws `👑` identically active or inactive, and `Tower` has no `active` flag so the renderer cannot distinguish (GAME_DESIGN §6.2 activation exists server-side only).
- **Repro**: Compare inactive vs damaged king — identical pixels.
- **Suggested fix**: Add optional `active?: boolean` to `Tower` (additive per GAME_DESIGN §12.3), pass through `state:update`, render inactive king dimmed/eyes-closed (e.g. grey disc + `😴`/`👑` with `zzz`) vs active normal. Document placeholder in code comment ("inspired by, not copied").
- **Fixes**:

### ISS-A5-005 — Fixed 100ms interp, no adaptive delay / gap-freeze; dead prev assignment; serverTimeMs unused
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:166,178-186,253-267`
- **Category**: perf
- **Description**: (a) `prevRef.current = prev.size === 0 ? next : prev` at line 182 is immediately overwritten by line 184 (`= currRef.current`) — dead code, confusing. (b) `SNAP_MS = 100` fixed + `void serverTimeMs` (line 166): GAME_DESIGN §10 wants adaptive 100-250ms interp and gap >300ms extrapolate-≤200ms-then-freeze. Jitter >~150ms will visibly teleport; no freeze path. HP/timer snap is correct, only positions affected.
- **Repro**: Read lines cited; throttle snapshots to 300ms gaps — units snap instead of freezing.
- **Suggested fix**: Delete line 182, keep 184-185. Add rolling arrival-delta estimator (clamp 100-250ms) for `SNAP_MS`, and if `now - lastSnap > 300` freeze at last `curr` (stop advancing alpha past 1 — already clamped — plus skip velocity extrapolation). Use `serverTimeMs` for HUD clock downstream (parent-owned).
- **Fixes**:

### ISS-A5-006 — Arrows visual is concentric rings, spec says rain lines
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:492-502`
- **Category**: correctness
- **Description**: UI_REFERENCE §3: "Arrows ➶ rain lines". Code draws 3 expanding white rings + `➶`. Fireball ring + Zap flash match spec; Arrows deviates (rings read as Zap/Fireball variant).
- **Repro**: Trigger `spells=[{kind:"arrows",...}]` — rings, no falling lines.
- **Suggested fix**: Draw ~8 short vertical line streaks converging inside radius + `➶` center, same 600ms fade envelope. Keep rings for Fireball only.
- **Fixes**:

### ISS-A5-007 — Destroyed-tower rendering bypasses TowerView helper (no 0-HP bar; emoji helper duplicated)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:383-426` vs `frontend/components/battle/TowerView.tsx:100-143,26-28`
- **Category**: conventions
- **Description**: Live towers use `drawTowerHpBar` (consistent bar) but the `destroyed` branch draws bespoke rubble + pulsing crown and never calls the helper — so canvas shows no 0-HP bar while the DOM `TowerView` overlay shows a 0 bar + bouncing crown for the same state. Also `towerEmoji()` helper exists but ArenaCanvas inlines its own ternary (line 406). No double-crown bug (branches are exclusive), purely a consistency drift risk.
- **Repro**: Destroy a princess — canvas: rubble, no bar; mount `<TowerView tower={same}/>` — 0 bar + crown.
- **Suggested fix**: Either call `drawTowerHpBar` for destroyed towers too (shows 0 bar + static crown, canvas pulse remains), or document "canvas rubble replaces bar" in both files. Replace inline ternary with `towerEmoji(t)`.
- **Fixes**:

### ISS-A5-008 — No devicePixelRatio scaling (fixed 360x640 backing store upscaled by CSS)
- **Severity**: minor
- **Status**: open
- **File**: `frontend/components/battle/ArenaCanvas.tsx:101-104,605-617`
- **Category**: perf
- **Description**: Backing store is fixed `360x640` while CSS stretches to `max-w-[420px]` (and 390px phones). No `dpr` scaling → text/emoji/HP bars blur on hidpi, and thin 1px lines (river shimmer, plank seams) alias. No functional break.
- **Repro**: Open `/battle` on dpr=2/3 phone — compare edge sharpness vs DOM chrome.
- **Suggested fix**: Size backing store to `cssWidth*dpr` (cap dpr 2) with `ctx.scale(dpr,dpr)`, keep logical `W/H` math unchanged. Re-verify 60fps after.
- **Fixes**:

## PASS checks (16)
- **PASS-01 portrait 18x32**: `COLS=18, ROWS=32` (71-72), backing `W=360 H=640` (101-104), `aspectRatio:"18 / 32"` + `max-w-[420px]` wrapper (606-613) — vertical CR column, 390x844 primary + centered on desktop.
- **PASS-02 grass checker hexes**: `GRASS_A #7ec850 / GRASS_B #8fd45a` (79-80) with `(x+y)%2` loop (276-281) — exact UI_REFERENCE §3 hexes.
- **PASS-03 river y15-16 + banks**: `RIVER_Y0=15, RIVER_Y1=16` (73-74), fill `#4aa3ff` + banks `#2f7fd0` (82,316-320) — matches GAME_DESIGN §5.2 band.
- **PASS-04 bridges x3-4 / x13-14**: `BRIDGES [[3,4],[13,14]]` (75-78), wood `#a9744f` + edge `#7a4f2c` + plank seams (332-351) — exact §5.2 lanes.
- **PASS-05 deploy tint**: own-half blue `rgba(59,130,246,0.28)` + foe red wash on selection (287-292), side-aware via `mySide` (284-286, blue `y0-14` per §5.3).
- **PASS-06 pocket dotted 4-tile**: dashed `strokeRect`s for blue `y17-20` / red `y11-14` split at `x=9` (295-313) — correct bands per §5.3 (modulo ISS-A5-002 gating).
- **PASS-07 invalid X**: river/enemy-half selection gets red fill + red X (361-378); valid cell gets yellow highlight (361-366) — matches "river red X for invalid".
- **PASS-08 towers + HP bars via helper**: live towers call `drawTowerHpBar(c,t,cx,cy-baseR-4,TW*2.4)` (407); helper uses `towerHpPct` clamp + blue `#3b82f6`/red `#ef4444` fill + dark track + white text + 0-on-destroyed (TowerView.tsx:30-38,100-134) — Princess 1400 / King 2400 sourced from `Tower.hitPoints/maxHitPoints` wire type.
- **PASS-09 crown popup + explosion**: tower-kill detection via `destroyed` transition → `burst` 42 orange + 24 white particles + `👑` float (215-230,234-250); destroyed branch renders rubble + pulsing crown (409-425).
- **PASS-10 units emoji + HP + team ring + bob/flash**: `UNIT_EMOJI` covers all 8 troops + cannon + 3 spells (86-99, spec §3 set exact); body + 3px blue/red ring + 13px emoji (444-457), HP bar blue/red with black track (459-465), walk bob `sin(timeS*8…)` (435), hit flash white <120ms (445-446), death poof burst (205-208).
- **PASS-11 spell rings**: fireball double orange ring + 🔥, zap yellow flash + ⚡, arrows rings + ➶ with 600ms expand-fade envelope (468-521) — matches "spells rings" (arrows line-style delta logged as ISS-A5-006).
- **PASS-12 damage numbers**: HP-drop detection → white (blue owner) / yellow `#fde047` (red) floats, black stroke, 26px rise over 900ms, cap 40 + 1.2s GC, external-prop override (188-201,544-576) — matches "floating white/yellow -HP".
- **PASS-13 60fps rAF interp 100ms buffer**: `requestAnimationFrame` loop (253-267,589-590) with `SNAP_MS=100` alpha + `lerp(prev,curr,alpha)` (263,431-434); HP/towers snap, positions interp — matches GAME_DESIGN §9 10Hz→60fps (adaptivity gap logged as ISS-A5-005).
- **PASS-14 wooden border**: outer `#7c4a21` 6px + inner white 1.5px highlight (578-586) + `rounded-lg` canvas chrome (612) — matches "wooden border".
- **PASS-15 click→tile**: `getBoundingClientRect` scale → `floor(px/rect.width*COLS)` clamped (593-603) → `onTileClick(tx,ty)`; parent owns `card:play` emit — correct separation.
- **PASS-16 no socket import + TowerView consistency**: ArenaCanvas imports only `react` + `shared/types` + `./TowerView` (23-25); TowerView imports only `shared/types` (13) — transport isolation holds (grep `socket` in `frontend/components/battle/` hits only comments). Bar colors/track/pct logic identical between canvas helper and DOM component (see PASS-08).

## Counts
- blocker: 0 | major: 1 | minor: 7 | verified: 0

## Reviewer notes (for fixer + main agent)
- Coordinate convention ambiguity (not filed as defect): entity pixels use `(pos+0.5)*T` (ArenaCanvas.tsx:385-386,434-436) while tiles/bridges use `tile*T`. Uniform half-tile SE offset, internally consistent (lane 3.5 centers on drawn bridge). Suggest a one-line comment locking "position = 1x1 footprint top-left, center = pos+0.5" or a `tileToPx` helper shared by towers/units/spells/particles.
- Did not touch: `frontend/app/battle/`, `frontend/lib/battle/`, `Hand.tsx`, `BattleTopBar.tsx`, `ElixirBar.tsx`, `battle.spec.ts` (sibling scopes) — `git status` shows them untracked/new; left alone per MEMORY#16.
- Did not kill preview servers (:3000/:4000 belong to main agent per MEMORY#19); no live-server testing in this static review.
- Legal: original Canvas/emoji code only, no Supercell assets — holds.
