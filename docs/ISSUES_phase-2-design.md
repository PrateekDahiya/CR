# ISSUES — phase-2-design (2026-10-17, reviewer: cards-arena-review)

> Scope: `docs/DRAFT_CARDS.md`, `docs/DRAFT_ARENA.md`, `shared/types.ts` (read-only reference).
> Branch: `feature/phase-2-game-design`. No runtime code reviewed (design drafts only).
> Requirement: playability/consistency — elixir math, tower HP/dps vs troop HP,
> 12-card coverage, win/OT clarity, 10 Hz tick feasibility.
> ID scheme: `ISS-D2-001…` (phase-2 design namespace, avoids collision with `ISS-001` template series).

## Summary
- Scope reviewed: `docs/DRAFT_CARDS.md:1-91`, `docs/DRAFT_ARENA.md:1-172`, `shared/types.ts:1-89` (+ `docs/DRAFT_PROTOCOL.md` cross-ref only)
- Commit/branch: `feature/phase-2-game-design` @ `9fa59fb` (+ untracked DRAFT_*.md)
- Verdict: **pass-with-issues** (no blockers; 5 majors must be resolved at `GAME_DESIGN.md` merge)

## Issues

### ISS-D2-001 — Archers "Dies to Zap" contradicts Zap-vs-Archers ruling
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:20` vs `docs/DRAFT_CARDS.md:28`
- **Category**: correctness
- **Description**: Table row 2 Notes says Archers "Dies to Zap (220)", but row 11 explicitly rules "Archers (300) survive full Zap" (220 < 300 — correct). Both cannot hold. Counter-chain §3 ("Mini P.E.K.K.A … outranged by Archers/Musketeer") assumes Archers survive Zap and need follow-up, so :20 is the wrong one.
- **Fix**: Change :20 Notes to "Survives full Zap (300 > 220); dies to Arrows/Fireball. Outranges Cannon on tie — see ISS-D2-012."

### ISS-D2-002 — Balanced starter deck average miscalculated
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:84`
- **Category**: correctness
- **Description**: "Balanced" deck (Knight 3 + Archers 3 + Musketeer 4 + Baby Dragon 4 + Giant 5 + Skeletons 1 + Fireball 4 + Cannon 3) sums to 27, avg = 27/8 = **3.375**, not 3.25 claimed. Pool avg 42/12 = 3.5 itself is correct (verified). Heavy deck 30/8 = 3.75 claimed correctly.
- **Fix**: Change "avg 3.25" to "avg 3.375". Both examples still satisfy the 2.8–4.2 SHOULD band, so no rule change.

### ISS-D2-003 — King DPS assumption mismatch (130 vs 100)
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:9` vs `docs/DRAFT_ARENA.md:60-61`
- **Category**: correctness
- **Description**: Cards draft assumes "king dps ~130"; arena draft specifies King 100 dmg / 1.0 s = **100 DPS** (Princess 90/0.8 s = 112.5 DPS ≈ cards "110" — that one matches). Every card-side sanity check involving king TTK/defense is therefore ~30% off. Tower HP (1400/2400) is consistent across both files — only the DPS diverges.
- **Fix**: Pick one at merge. Recommended: keep arena 100 DPS (slower king = comeback-friendly, matches 24 s King-vs-King reference :64) and edit cards :9 to "king dps ~100". Re-verify any kill-time note that assumed 130.

### ISS-D2-004 — Giant bridge-to-tower time understated (~10 s vs ~14 s)
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:48`
- **Category**: correctness
- **Description**: "Giant reaches tower in ~10 s from bridge" — geometry says otherwise. Bridge exit y≈15–16 to enemy princess y≈6.5/24.5 is 8.5–9 tiles (arena §1.4). At Giant 0.6 t/s that is 14–15 s (9/0.6 = 15 s), before targeting/wobble. Claim underpins "unsupported Giant trades ~1–2 tower shots" — at 15 s walk + 112.5 DPS incoming, unsupported Giant takes ~1600+ tower damage en route and arrives badly chipped, which actually *strengthens* the "needs support" conclusion but with wrong numbers.
- **Fix**: Recompute with arena geometry: "Giant walks bridge→princess ≈ 14–15 s; unsupported it arrives at ~half HP, trades ~1–2 tower hits — intended." Keep design intent, fix the number.

### ISS-D2-005 — Snapshot event name mismatch (`match:state` vs `state:update`)
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_ARENA.md:135` vs `shared/types.ts:86` + `docs/DRAFT_PROTOCOL.md:116`
- **Category**: conventions
- **Description**: Arena §5 says snapshots broadcast over `match:state`; types and protocol use `state:update` (10 Hz). A merger copying arena text verbatim introduces a second wire name.
- **Fix**: Edit arena :135 to `` `state:update` `` (canonical). Never emit `match:state`.

### ISS-D2-006 — Pocket deploy depth contradicts itself (8 vs 4 tiles)
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_ARENA.md:36`
- **Category**: correctness
- **Description**: Same sentence promises "up to y ± 8 tiles past river" then "Simplified Phase 2: … extends 4 tiles into enemy half". Server validation (§7) cannot implement both.
- **Fix**: Lock one number at merge. Recommended: keep 4 tiles (smaller aggro/pocket surface for Phase 2) and delete the "± 8" clause. Mirror in `GAME_DESIGN.md` deploy-zone table with exact y-bands per side + lane-side x-split.

### ISS-D2-007 — Card stat fields have no home in `shared/types.ts:Card`
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:32-44` vs `shared/types.ts:23-36`
- **Category**: correctness
- **Description**: Drafts normatively use `speed` (tiles/s), `hit-speed` (s/attack), `targets` (ground/air+ground/buildings), `sightRange`, `lifetime` (Cannon 30 s), `deploy time`, `stun` (Zap 0.5 s), `death burst` (Golem 280), crown-tower damage scalar (40%). `Card` only offers `damage?, hitPoints?, range?, radius?, count?, durationMs?`. A verbatim "map each row to Card fields" handoff (§5) is therefore lossy. `DRAFT_PROTOCOL.md:194-205` already sketches additive `CardStats` — cards/arena drafts never reference it.
- **Fix**: At merge, adopt protocol §3 `CardStats` (additive, optional fields) as the stat block; map `lifetime→durationMs`, `stun/death-burst→new optional fields`. Do NOT edit `types.ts` in this design phase (protocol constraint holds). File a Phase-3 task: server card table is authoritative, client-sent cost ignored (already required by arena §7.1).

### ISS-D2-008 — Coverage is thin on swarm / air / building answers
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:11-30` (12-card set)
- **Category**: perf (design balance risk — not a contradiction)
- **Description**: Roles present: tanks (Knight/Giant/Golem/MP), ranged (Archers/Musketeer/Baby Dragon), spells (Fireball/Arrows/Zap), building (Cannon). But: only ONE swarm (Skeletons ×3 — no 5+ horde/gang punishes splash), only ONE flier (Baby Dragon — air game is "have Musketeer/Archers or lose"), only ONE building (Cannon — every control deck runs the same answer; no spawner/Tesla alternative; Cannon is dead weight vs air per :30). Playable for a 12-card starter, but meta will be solved fast.
- **Fix**: No change for Phase 2 (ship the 12). Log as open design debt in `GAME_DESIGN.md`: Phase 4+ adds ≥1 true horde, ≥1 air tank/harasser, ≥1 alt building. Watch pick-rate guardrails (§2: Cannon/Baby Dragon lower bounds) for early staleness signal.

### ISS-D2-009 — Win/OT tiebreak ambiguous; chipped 0–0 skips overtime
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_ARENA.md:109,115-121`
- **Category**: correctness
- **Description**: (a) "Lowest enemy-tower HP%" — over standing towers only, or do destroyed towers count as 0%? In a 1–1 each side has King + 1 Princess; if a king is chipped, is king in the "lowest" set? (b) OT triggers ONLY on exact tie of crowns AND HP% — float equality with no epsilon. (c) Consequence: 0–0 at 180 s with towers 1399 vs 1400 ends immediately on HP% with NO overtime, contrary to player expectation that tied crowns → sudden death. That may be intended (reward chip) but it contradicts the §4.3 example flow and standard CR feel.
- **Fix**: Define at merge: (1) tiebreak = min HP% over all REMAINING towers (destroyed excluded; state whether king included — recommend include, else king-chip is free); (2) OT iff crowns tied AND |ΔHP%| ≤ epsilon (e.g. 0.5%); else HP% wins at 180 s; (3) rewrite :118 in plain words ("the player whose enemy's weakest standing tower has the lower HP% wins") and add a 0–0-chipped example alongside the three in §4.3.

### ISS-D2-010 — Fireball note self-contradicts ("never one-shots … = kills")
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:49` (also table row 9, :29)
- **Category**: docs
- **Description**: "never one-shots equal-level Musketeer+? (600 < 700 = kills) — intended" asserts never-kills then proves kills. Table row itself is unambiguous (700 vs 600 → kills) and §3's "die to Fireball (premium)" confirms intent.
- **Fix**: Delete the "never one-shots" clause; keep "Fireball (700) one-shots Musketeer (600) and Archers (300) — intended premium answer at 4 elixir."

### ISS-D2-011 — Golem guardrail lower bound violates global no-ship rule
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:66` vs `docs/DRAFT_CARDS.md:72`
- **Category**: correctness
- **Description**: Golem target 0.48 ± 0.04 → 0.44–0.52; global rule bans shipping any card with measured win < 0.45. The target interval itself dips below the ban line, so a Golem at exactly its target (0.44) would auto-flag.
- **Fix**: Tighten to 0.49 ± 0.03 (0.46–0.52) or restate global rule as "flag if outside 0.44–0.56 for Golem-class 6-cost". Former is simpler.

### ISS-D2-012 — Range-tie first-shot rule missing (Archers 5.5 vs Cannon 5.5)
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_CARDS.md:20,30` + `docs/DRAFT_ARENA.md:75-80`
- **Category**: correctness
- **Description**: "Archers outrange Cannon" (:20) but both are range 5.5 — it is a tie, not outrange. Tower ranges (7.5/7.0) outrange every troop (max 6.0 Musketeer), so troops always eat at least one tower shot — intended but unstated. No rule for simultaneous-acquire ties (who fires first at 10 Hz?).
- **Fix**: Correct :20 to "ties Cannon range; wins with tower help / first-shot". Add to `GAME_DESIGN.md` tick section: "ties broken by lower tickId then lower entity id; tower shots resolve before troop shots within a tick" (or the reverse — just lock one).

### ISS-D2-013 — Inactive-king aggro/targeting unspecified (king-snipe is instant win)
- **Severity**: major
- **Status**: open
- **File**: `docs/DRAFT_ARENA.md:66-80`
- **Category**: correctness
- **Description**: King starts inactive but "can be damaged" and "sniped = instant win" (§4.1). §2.3 says towers acquire nearest-in-range, king "once active, behaves identically" — but do lane troops WALK PAST an inactive king, or do they aggro it when it is nearest? If troops ignore inactive king, backdoor king-snipe is only via spells; if they aggro it, any central leak ends the game. Load-bearing for win clarity.
- **Fix**: Lock one sentence at merge, e.g.: "Troops target inactive king normally when it is nearest in their sight range (no immunity); inactivity only suppresses the king's own attacks until triggered." Adjust if design wants king-immune pathing instead — but state it.

### ISS-D2-014 — Elixir wire type ambiguous (float vs floored int)
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_ARENA.md:88` vs `shared/types.ts:65`
- **Category**: conventions
- **Description**: Arena: server accumulates float, "displayed floored + partial bar". `GameState.elixir: Record<PlayerSide, number>` does not say whether the wire carries float (server truth) or floored int (display value). Anti-cheat (§7.1) checks cost against "server-side elixir float" — so wire SHOULD be float, but a client flooring locally then echoing could desync.
- **Fix**: `GAME_DESIGN.md` + protocol: "`state:update.elixir` carries server float (0–10); clients floor for display only and never send elixir back." One line.

### ISS-D2-015 — Tower "projectiles" have no entity/snapshot model
- **Severity**: minor
- **Status**: open
- **File**: `docs/DRAFT_ARENA.md:63` vs `shared/types.ts:50-58` + `docs/DRAFT_ARENA.md:131-137`
- **Category**: perf (tick feasibility)
- **Description**: Towers fire "single-target projectiles" but `Unit`/`GameState` has no projectile array and the tick EXE order lists "resolve combat" with no travel-time step. Either shots are hitscan (then "projectile" is visual-only — fine) or they travel (then 10 Hz must integrate them and snapshots must carry them, contradicting "small snapshot" claim).
- **Fix**: Declare hitscan for Phase 2 ("tower damage applies on the firing tick; projectile is client visual only"). If travel-time is wanted, add optional `projectiles?` to the snapshot (additive per shared conventions) and cost it in the 10 Hz budget.

## PASS list (verified — no issue filed)
- **P-01 Elixir income ≈ 90/match**: 5 start + 120/2.8 (42.86) + 60/1.4 (42.86) = 90.7 ≈ "~90" ✔
- **P-02 Pool avg 3.5**: total 3+3+5+1+4+4+4+6+4+3+2+3 = 42; 42/12 = 3.5 ✔ (starter SHOULD band 2.8–4.2 sane)
- **P-03 Tower HP consistent**: 1400 princess / 2400 king in both drafts ✔
- **P-04 Kill-time spot checks**: Musk→Knight 1450/200 = 7.25 s (~7.3 claimed) ✔; MP→Giant 3400/344 = 9.9 s ✔; Giant→Cannon 750/140 = 5.36 s dealing 5.36×262 ≈ 1404 ✔; BD↔Musk 5.5 s vs 6.4 s (Musk wins 1v1) ✔
- **P-05 Spell ladder**: Fireball 700 > Musk 600/Archers 300 ✔; Arrows 300 = Archers 300 (kills) > Skeletons 80 but < Musk 600 ✔; Zap 220 kills Skeletons, NOT Archers ✔ (see ISS-D2-001 for the one contradicting note)
- **P-06 Tower-vs-tower TTK**: 1400/112.5 = 12.4 s (~12.5) ✔; 2400/100 = 24 s ✔
- **P-07 Roles covered** (thin but present): tank / ranged / swarm / spell / building each ≥1 ✔ (depth risk → ISS-D2-008)
- **P-08 Deck rule**: exactly 8 distinct, max 2 spells, Cannon is building not spell ✔; Heavy example avg 3.75 ✔
- **P-09 Clock structure**: 180 s regulation, double 120–180 s + all OT, 60 s sudden-death OT, hard cap 240 s ✔
- **P-10 Win priority order** (king-snipe > crowns > HP% > draw) is stated with examples ✔ (wording/edge cases → ISS-D2-009)
- **P-11 King activation** (inactive until damaged or princess lost) blocks turn-1 snipe meta ✔ (aggro gap → ISS-D2-013)
- **P-12 10 Hz tick feasible**: max speed 1.2 t/s → 0.12 tile/tick; full-snapshot broadcast of 6 towers + ~dozens of units is small; 100 ms interp + 100–250 ms adaptive buffer plausibly absorbs ≤150 ms jitter; no-prediction acceptable for card battler; EXE order (actions→elixir→move→combat→win→broadcast) sane ✔
- **P-13 Anti-cheat five**: elixir / positions / hand / clock-rate / match-access each with a named reject code ✔
- **P-14 Cap-10 economy**: full bar affords any single card (max 6) ✔; single-time ≈ one 3–4 play/10 s, double ≈ trade-for-trade ✔
- **P-15 Balance guardrails**: 0.45–0.55 ship band + auto-flag + per-card patch levers present ✔ (Golem edge → ISS-D2-011)

## Counts
- blocker: 0 | major: 7 | minor: 8 | pass: 15

## Handoff (merger)
- Resolve ISS-D2-003/004/005/006/007/009/013 before writing `docs/GAME_DESIGN.md` normative sections; rest may ride as known-issues.
- Collision note: this file is `docs/ISSUES_phase-2-design.md` (primary per review prompt; no collision existed at review time — `docs/` contained no `ISSUES_phase-2-*`). A second reviewer sharing the feature should use `docs/ISSUES_phase-2-cards-arena.md`.
- Never read/copied from `CRclone` (per `MEMORY.md` §1). No code edited; only this issues file created.
