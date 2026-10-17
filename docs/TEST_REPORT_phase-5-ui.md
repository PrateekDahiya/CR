# TEST_REPORT_phase-5-ui — Live Playwright Chromium battle test

> Phase 5 Exact-CR Battle client (`feature/phase-5-battle-client`).
> Live UI tester (MEMORY#17 + #18). No commits. App/engine code READ-ONLY.

## 1. Environment

| Item | Value |
|---|---|
| Date (UTC) | 2026-10-17 |
| Branch | `feature/phase-5-battle-client` |
| OS / shell | Windows / PowerShell 5.1 |
| Node / npm | v24.16.0 / 11.13.0 |
| Next.js | 14.2.5 |
| Playwright | CLI `1.64.1` (`@playwright/test` per `frontend/package.json`) |
| Chromium | bundled headless build present (`%LOCALAPPDATA%\ms-playwright\chromium-1248*`); `npx playwright install` NOT needed, browsers pre-installed |
| `node_modules` | present in both `frontend/` and `backend/` → no `npm install` run |
| Network for npx | not needed (all local); nothing BLOCKED |

## 2. Servers (ephemeral ports only — preview :3000/:4000 untouched)

| Server | Port | PID | Outcome |
|---|---|---|---|
| Backend | `:4100` | 30688 (PRE-EXISTING, started 05:22, same-repo `tsx watch src/index.ts`) | `GET /health` → 200 `{"ok":true}`. REUSED as-is (not mine → NOT killed). |
| Frontend (mine) | `:3100` | 20524 (`cmd /c npm run dev`, `PORT=3100`, `NEXT_PUBLIC_BACKEND_URL=http://localhost:4100`) | `next dev` Ready in ~2s; `/battle` → 200. Killed after run; port verified free (connection refused, only TIME_WAIT remains). |

Setup notes:
- `Start-Job`/session env does NOT survive across tool-call sessions here, so the frontend was launched detached via `Start-Process cmd.exe "/c npm run dev"` with inherited env (`PORT`, `NEXT_PUBLIC_BACKEND_URL`) + log redirect to `%TEMP%\opencode\frontend-3100.log` (`Ready in 1871ms`, `Local: http://localhost:3100`).
- Poll: `curl.exe … /health` (backend, ≤60s) and `/battle` (frontend, ≤90s) — both 200 before tests.

## 3. Commands

```powershell
Set-Location frontend
$env:PLAYWRIGHT_BASE_URL="http://localhost:3100"
npx playwright test tests/battle.spec.ts --project=chromium --reporter=list
```

## 4. Results

First run: **3/4 PASS** — `tap-to-deploy` FAILED (`battle-error` never appeared).
Final run (after 2 additive spec fixes, §5): **4/4 PASS** (3.9s).

| # | Test | Result | Notes |
|---|---|---|---|
| 1 | renders canvas + elixir bar + 4-card hand + timer | PASS | Offline idle: gold BATTLE entry (`battle-join`) visible; dual-contract locators match sibling testids (`arena-canvas`, `card-hand-0..3`, `card-next`). |
| 2 | tap-to-deploy: card select then arena tap attempts deploy | PASS (after fix) | Knight slot shows `aria-pressed=true`; canvas tap → offline deploy notice (`battle-error`), no crash. |
| 3 | screenshots 390x844 + 1280x720 to docs/screenshots | PASS | Wrote `docs/screenshots/phase-5-battle-mobile.png` (58KB) + `phase-5-battle-desktop.png` (64KB). |
| 4 | battle-canvas render check with elixir pips count 10 | PASS | `elixir-pip*` count exactly 10; timer + hand + Next present. |

## 5. Spec fixes (additive ONLY — `frontend/tests/battle.spec.ts`, no app code touched)

1. **Deploy click vs idle overlay (test 2):** in idle phase the `battle-join` overlay covers the canvas, so hit-tested clicks (`page.mouse.click`, even `force:true` — the topmost element still receives them) never reach `ArenaCanvas.onClick`. Fix: dispatch a real bubbling `MouseEvent("click", {clientX, clientY})` on the canvas at own-half coords (0.5, 0.75) via `locator.evaluate` — React `onClick → onTileClick → card:play` wiring runs exactly as a user tap does in-match. Verified: `battle-error` appears.
2. **Screenshot path (test 3):** spec ran with cwd `frontend/`, so `"docs/screenshots/…"` landed in `frontend/docs/screenshots/` (stray, since removed). Fix: `"../docs/screenshots/phase-5-battle-{mobile,desktop}.png"` → files now land in repo `docs/screenshots/`.

No testid drift found — all asserted testids (`battle-page`, `arena-canvas`, `elixir-bar`, `battle-timer`, `card-hand-0..3`, `card-next`/`next-card`, `battle-join`, `battle-error`) exist as written.

## 6. Screenshots + UI-match checklist (vs `docs/UI_REFERENCE.md` §8)

Files: `docs/screenshots/phase-5-battle-mobile.png` (390x844), `docs/screenshots/phase-5-battle-desktop.png` (1280x720).

| §8 item | Observed |
|---|---|
| Portrait arena | ✅ tall 18x32 column, `max-w-[420px]`, centered (desktop shows sky-blue gradient + centered column). |
| River / bridges | ✅ desktop: blue river band + brown plank bridges mid-arena; mobile: river band visible behind idle overlay tint. |
| 3+3 towers + HP bars | ✅ 2× Princess (1400) + 1× King (2400) per side, HP bars above (blue top / red bottom), 👑/🏰 emoji. |
| Timer | ✅ `3:00` center top; enemy `??? (searching)` left, player `spec-player` right, emote + mute buttons. |
| Elixir 10 pips | ✅ purple bar, `5` left, 10 diamond pips (test-asserted count = 10). |
| 4-card hand + Next | ✅ DOM-verified (Knight/Archers/Musketeer/Baby-Dragon + Next); in screenshots the dock sits at/below the fold at these viewport heights (page scrolls) — layout, not a bug. |
| Deploy works | ✅ test 2 (offline-notice path; no crash). |
| Win overlay crowns | ⚠️ NOT exercised — single-client offline run cannot reach `match:end`; needs 2-player live pairing (suggested follow-up, out of scope). |

Match style notes: grass checker `#7ec850/#8fd45a`, gold 3D BATTLE button, blue/red side rings — pixel-close to UI_REFERENCE §§2-4 with original Canvas/CSS art (no external assets). No `ISS-UI-*` filed by this agent (reviewers own `docs/ISSUES_*.md` — untouched).

## 7. Cleanup + preview verification (MEMORY#19)

- Killed ONLY my process: frontend `:3100` PID 20524 → port free (verified `000`/refused).
- `:4100` left RUNNING (PID 30688, not mine) — `GET /health` → **200** after run.
- Preview backend `:4000/health` → **200** `{"ok":true}` ✅ intact (never touched).
- Preview frontend `:3000` → listener alive (PID 10664), `/battle` → **200**, BUT `/` → **404** at 05:3x (was 200 with Phase-4 shell at start of run). `frontend/app/page.tsx` on disk is intact (valid `Home` export); a sibling agent is actively editing frontend routes (`frontend/app/battle/` untracked, reskin in flight) — likely transient dev-server state during their edit. NOT caused by this agent (never touched :3000/:4000, app code, or preview env). Flagged for the page owner; no action taken (code files read-only for this role).

## 8. Verdict

**PASS (live)** — 4/4 Playwright Chromium tests on `/battle` against ephemeral `:3100`+`:4100`; screenshots captured; preview backend intact; preview frontend `/` 404 noted (pre-existing sibling churn, out of scope). No commit (per instructions). No network BLOCKED.
