# frontend/tests — Playwright e2e (Chromium only)

Smoke tests for the Phase 4 shell (`shell.spec.ts`):
- `/` loads title `CR Clone`, buttons **Play / Lobby / Deck** visible
- `/deck` renders exactly 8 `[data-testid="card-slot"]` nodes
- `/lobby` shows a player-id input (`[data-testid="player-id-input"]`,
  fallback: any visible text input)

Per MEMORY.md §17: UI tests MUST use Playwright with Chromium, headless.
Firefox/WebKit are never used.

## Prerequisites

```powershell
Set-Location frontend
npm install
# one-time browser download (heavy — do NOT run in scaffolding agents):
npx playwright install --with-deps chromium
```

## Run

```powershell
Set-Location frontend
npm run dev      # -> http://localhost:3000 (keep running in another shell)
npx playwright test --project=chromium
```

Or via the npm script (same thing):

```powershell
npm run test:e2e
```

Target a non-default URL:

```powershell
$env:PLAYWRIGHT_BASE_URL="http://localhost:3000"; npx playwright test --project=chromium
```

## Notes

- Tests expect the `playwright.config.ts` chromium project (owned by the
  infra/app-shell agent). These specs run on whatever project is selected,
  but `--project=chromium` is the canonical invocation.
- Deck-agent contract: the deck builder at `/deck` must expose exactly 8
  nodes with `data-testid="card-slot"` (card pool uses a different id).
- Lobby-agent contract: `/lobby` must expose `[data-testid="player-id-input"]`
  (a visible text input is accepted as fallback).

## Live run 2026-10-17 (branch `feature/phase-4-frontend-shell`)

- Backend on `:4100` (`npm run dev`), frontend on `:3100` with
  `NEXT_PUBLIC_BACKEND_URL=http://localhost:4100`.
- Spec fix (ISS-F4-004, additive): home asserts `button` -> `link` /
  `data-testid` `nav-play` / `nav-lobby` / `nav-deck` (3 tests kept).
- Result: **3/3 PASS** on `--project=chromium`
  (`PLAYWRIGHT_BASE_URL=http://localhost:3100`):
  home nav links, deck 8 slots, lobby player input.
- Backend sanity live: `GET /health` 200, socket `ping->pong`,
  `queue:join` valid ack, `deck:select` invalid -> `BAD_DECK`,
  `queue:leave` ok.
- Screenshots: `docs/screenshots/phase-4-{home,deck,lobby}.png`.
- Full log: `docs/TEST_REPORT_phase-4-ui.md`. Servers stopped after run
  (ports 4100/3100 verified free). No docker, no commit.
