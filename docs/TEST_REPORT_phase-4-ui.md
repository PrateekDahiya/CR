# TEST_REPORT — Phase 4 Frontend Shell, LIVE UI + Backend API Sanity (Chromium)

> Per MEMORY.md §17 (Live Testing): Playwright Chromium live UI + backend API sanity.
> Branch: `feature/phase-4-frontend-shell` | Date: 2026-10-17 | Agent: live-UI-tester (only live tester running; fixer finished)
> Scope: `frontend/tests/shell.spec.ts` (additive ISS-F4-004 fix), live run vs local dev servers, screenshots.
> Did NOT touch: `docs/ISSUES_*.md`, `docs/TEST_REPORT_phase-4-static.md`, fixer outputs, `CRclone`. No commit, no docker.

## 1. Environment

| Item | Value |
|------|-------|
| OS / shell | Windows (win32), PowerShell 5.1 |
| Node / npm | v24.16.0 / 11.13.0 |
| `@playwright/test` | 1.64.1 (`npx playwright --version`) |
| Chromium (headless) | 156.0.8078.4 (`chromium.launch()` → `browser.version()`; local builds `chromium-1248` / `chromium_headless_shell-1248`) |
| Backend | `D:\Documents\Projects\CR\backend`, `npm run dev` (tsx watch) on `PORT=4100` |
| Frontend | `D:\Documents\Projects\CR\frontend`, Next.js 14.2.5 `npm run dev -- --port 3100`, `NEXT_PUBLIC_BACKEND_URL=http://localhost:4100` |
| Base URL for tests | `PLAYWRIGHT_BASE_URL=http://localhost:3100` |

## 2. Commands (exact)

```powershell
# setup (from D:\Documents\Projects\CR)
Set-Location frontend; npm install
npx playwright install --with-deps chromium   # no-op on Win; fell back to:
npx playwright install chromium               # already present (chromium-1248)

# backend (ephemeral port 4100 per MEMORY#17)
$env:PORT=4100; Start-Job { Set-Location D:\Documents\Projects\CR\backend; $env:PORT=4100; npm run dev }
# + health poll until 200:
Invoke-WebRequest http://localhost:4100/health  # -> {"ok":true,"service":"backend"}

# frontend (ephemeral port 3100; WMI-detached so it survives the spawning shell —
# plain Start-Job children were reaped on shell exit and :3100 never bound)
$cmd = 'cmd.exe /c "set PORT=3100 && set NEXT_PUBLIC_BACKEND_URL=http://localhost:4100&& D: && cd D:\Documents\Projects\CR\frontend && npm run dev -- --port 3100"'
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
# + poll until Next "Ready" and GET / /deck /lobby all 200 (~30 s first compile)

# spec fix (additive, ISS-F4-004) then run:
$env:PLAYWRIGHT_BASE_URL='http://localhost:3100'; npx playwright test --project=chromium --reporter=list

# screenshots (1280x720 headless chromium):
node <temp>\shot-phase4.js   # -> docs/screenshots/phase-4-{home,deck,lobby}.png
# backend API sanity:
node <temp>\api-sanity.js    # health + socket ping/pong + queue:join + deck:select-invalid + queue:leave
```

## 3. Spec fix (ISS-F4-004, additive — `frontend/tests/shell.spec.ts` only)

- Home `/` renders Next.js `<Link>`s (`role="link"`, `data-testid` nav-play/nav-lobby/nav-deck), not `<button>`s — the old `getByRole("button", …)` asserts could never pass.
- Fix: test 1 now asserts `getByTestId("nav-play"/"nav-lobby"/"nav-deck")` + `getByRole("link", …)` for "Play vs AI" / "Play 1v1" / Deck-in-testid. Test count kept at **3** (none deleted); deck x8 `card-slot` + lobby `player-id-input` asserts untouched.

## 4. Results

### 4a. Playwright Chromium UI — 3/3 PASS (3.3 s, 1 worker)

| # | Case | Result | Time |
|---|------|--------|------|
| UI-1 | home `/` loads title `CR Clone` + 3 nav links (testids + link roles) | PASS | ~0.7 s |
| UI-2 | deck `/deck` renders exactly 8 `[data-testid="card-slot"]`, all visible | PASS | ~1.1 s |
| UI-3 | lobby `/lobby` shows `[data-testid="player-id-input"]` (fallback: any visible text input) | PASS | ~0.9 s |

Raw: `3 passed (3.3s)` — `tests\shell.spec.ts:23 home … 3 nav links / :39 deck … 8 slots / :49 lobby … player input`.

### 4b. Backend API sanity (live, `http://localhost:4100`) — 5/5 PASS

| # | Case | Expected | Actual | Result |
|---|------|----------|--------|--------|
| API-1 | `GET /health` | `200 {ok:true, service:"backend"}` | `200 {"ok":true,"service":"backend"}` | PASS |
| API-2 | socket connect + `ping → pong` | `pong {received, serverTime}` | connected, `pong={"received":{"t0":…},"serverTime":…}` (Δ ~1 ms) | PASS |
| API-3 | `queue:join` valid 8-card starter deck (GAME_DESIGN §4, avg 3.375) | `ack {ok:true, position}` | `{ok:true, position:1}` | PASS |
| API-4 | `deck:select` invalid deck `["knight"]` | `ok:false BAD_DECK` | `{ok:false, error:{code:"BAD_DECK", message:"deck must contain exactly 8 cards"}}` | PASS |
| API-5 | `queue:leave` (idempotent cleanup) | `ack {ok:true}` | `{ok:true}` | PASS |

Queue left empty after API-5 (joiner removed; no stray match); socket disconnected.

### 4c. Visual evidence — `docs/screenshots/`

| File | Size | Verified content |
|------|------|------------------|
| `phase-4-home.png` | ~20 KB | `CR Clone` h1, **online** backend badge (`GET http://localhost:4100/health`), Play vs AI / Play 1v1 / Deck links |
| `phase-4-deck.png` | ~68 KB | Deck Builder 8/8 valid, avg 3.38, spells 1/2, 12-card pool grid |
| `phase-4-lobby.png` | ~26 KB | Lobby, Player ID input, deck preview 8/8, Join Queue / Leave |

## 5. Observations (no code change; for fixer/sibling agents)

1. **Env hygiene (bit us once):** `cmd set VAR=value && …` (space before `&&`) bakes a **trailing space** into the value. First frontend launch had `NEXT_PUBLIC_BACKEND_URL="http://localhost:4100 "` → in-browser `fetch("http://localhost:4100 /health")` rejected at URL parse → status dot stayed **offline** while direct health checks passed. Relaunched without the space → dot **online** (trace also shows the expected StrictMode dev double-fetch: one `ERR_ABORTED`, one `200`). Suggest quoting (`set "VAR=value"`) in run docs; `frontend/app/page.tsx` could `.trim()` the env URL (left for fixer — out of this agent's write scope).
2. **Harness note:** `Start-Job` children did not reliably survive the spawning shell on this box (frontend `:3100` never bound twice); a WMI-detached `Win32_Process.Create` launcher survived and served the whole run. Backend via `Start-Job` orphan survived fine.
3. Pre-existing stale `node` listener on `:4100` (PID 25580, not mine) was stopped before the run so results reflect current branch code.

## 6. Verdict

**PASS — 8/8 (3 UI + 5 API), 3 screenshots.** Phase 4 shell loads, navigates (home/deck/lobby all HTTP 200), deck shows 8 slots, lobby shows player input, backend health + socket handshake + queue validation all live-verified on ephemeral ports. No docker used (local dev per task).

## 7. Cleanup

```powershell
# killed only processes owned by this run (by listening-port owner, never by name):
Stop-Process -Id <owner-of-:4100-listen> -Force   # backend tsx/node
Stop-Process -Id <owner-of-:3100-listen> -Force   # frontend next/node
# + reaped the two WMI launcher cmd.exe parents; verified:
Get-NetTCPConnection -LocalPort 4100,3100 -State Listen  # -> no rows (both ports free)
```

Cleanup executed 2026-10-17 after the run: **both ports free, no servers left running.** Temp helpers (`shot-phase4.js`, `api-sanity.js`, `diag-*.js`, `fe-3100.log`) live outside the repo in `%TEMP%\opencode\` and were not committed.
