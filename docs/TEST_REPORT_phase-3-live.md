# TEST_REPORT phase-3-live — Backend + AI live API tests

> MEMORY#17 live testing. Branch `feature/phase-3-backend-server`. Read-only except this file; no commits. Sibling agent paths untouched.

## 1. Env
- Date: 2026-10-17, OS: Windows (win32, PowerShell 5.1), Node v24.16.0, npm 11.13.0, Python 3.12.10
- Deps: backend `node_modules` present (no install needed); ai-service `fastapi 0.115.6`, `uvicorn 0.34.0`, `httpx 0.28.1`, `pytest 8.3.4` present
- Ports: backend `4100` (avoid 4000 clash), ai-service `8100` (avoid 8000 clash). Both free before start, both freed after.
- Commit: `cf00bdb` on `feature/phase-3-backend-server`
- Spec: `docs/GAME_DESIGN.md` normative, `backend/src/index.ts`, `ai-service/main.py`

## 2. Commands
```powershell
# backend (from D:\Documents\Projects\CR)
Start-Process cmd.exe "/c set PORT=4100 && npm run dev > ...\backend-4100.log 2>&1" -WorkingDirectory "D:\Documents\Projects\CR\backend" -WindowStyle Hidden
# wait 8-9s, check backend-4100.log "[backend] listening on :4100", netstat :4100 LISTENING
Invoke-WebRequest http://localhost:4100/health
Invoke-WebRequest http://localhost:4100/socket.io/?EIO=4&transport=polling
# socket suite (temp dir only, NOT repo):
# C:\Users\prate\AppData\Local\Temp\opencode\live-test\ npm init -y; npm install socket.io-client@4
node run-backend-live.js

# ai-service
Start-Process cmd.exe "/c uvicorn main:app --host 127.0.0.1 --port 8100 > ...\ai-8100.log 2>&1" -WorkingDirectory "D:\Documents\Projects\CR\ai-service"
Invoke-WebRequest http://localhost:8100/health
Invoke-WebRequest http://localhost:8100/bot/move -Method POST -ContentType "application/json" -Body '{"difficulty":"..."}'
Invoke-WebRequest http://localhost:8100/balance/cards
python -c "urllib bot/move case/range check"

# cleanup
Stop-Process -Id <4100-pid> -Force; Stop-Process -Id <8100-pid> -Force
netstat -ano | Select-String ":4100.*LISTENING|:8100.*LISTENING" # expect empty
```

## 3. Backend live (PORT 4100) — 29 cases, all PASS
HTTP baseline:

| ID | Case | Expected | Actual | Verdict |
|----|------|----------|--------|---------|
| B1 | GET /health | 200 `{ok:true,service:backend}` | 200 `{"ok":true,"service":"backend"}` | PASS |
| B2 | TCP connect 127.0.0.1:4100 | connected | `TcpClient.Connected=True` | PASS |
| B3 | GET /nope-not-here | 404 | 404 | PASS |
| B4 | POST /health (invalid method) | 404 (no POST route) | 404 | PASS |
| B5 | GET /socket.io/?EIO=4&transport=polling | 200 `0{"sid":...}` | 200 `0{"sid":"Pdw-...","upgrades":["websocket"],...}` | PASS |

Socket.io suite (`run-backend-live.js`, `socket.io-client@4`, 24/24 PASS):

| ID | Case | Expected | Actual | Verdict |
|----|------|----------|--------|---------|
| S1 | socket connect | connect | `id=ZhI_...` | PASS |
| S2 | ping→pong | `pong.serverTime:number` | `{"received":{"t0":...},"serverTime":...}` | PASS |
| S3 | deck:select valid 8 | ack ok:true | ok:true | PASS |
| S4 | deck:select 7 cards | ok:false BAD_DECK | `deck must contain exactly 8 cards` | PASS |
| S5 | deck:select 3 spells | ok:false BAD_DECK | `deck allows at most 2 spells` | PASS |
| S6 | queue:join bad deck | ok:false BAD_DECK | ok:false | PASS |
| S7 | queue:leave not-queued | ok:true idempotent | ok:true | PASS |
| S8 | two clients connect | both connect | both | PASS |
| S9/S10 | queue:join P1/P2 valid | ok:true position | position 1 / 2 | PASS |
| S11 | queue:matched both | same matchId | `m-mvbknnwp-2reyqn` both sides | PASS |
| S12 | legacy match:found twin | same matchId | present | PASS |
| S13 | match:start both | both receive | true/true | PASS |
| S14 | state:update stream | ≥1 in 1.5s | 14 ticks, tick=0 | PASS |
| S15 | card:play handIndex 9 | BAD_HAND_INDEX | `handIndex must be an integer 0..3` | PASS |
| S16 | card:play enemy half y=25 (blue) | BAD_POSITION | `position outside your deploy zone` | PASS |
| S17 | card:play clientTick 999999 | STALE_TICK | `stale tick (client 999999, server 14)` | PASS |
| S18 | card:play cardId mismatch | CARD_REJECTED | `cardId echo does not match authoritative hand` | PASS |
| S19 | card:play valid x=4 y=5 | ok:true (elixir 5 start) | ok:true | PASS |
| S20 | burst 6× card:play | RATE_LIMITED | `[NO_ELIXIR×4, RATE_LIMITED×2]` — also proves NO_ELIXIR | PASS |
| S21 | emote:send wave | ok:true | ok:true | PASS |
| S22 | emote immediate 2nd | RATE_LIMITED | `emote rate-limited (1 per 5s)` | PASS |
| S23 | match:sync | state:update snapshot | tick=25 | PASS |
| S24 | legacy match:leave alias | ok:true | ok:true | PASS |

Notes: `match:end` not forced (would need full 180s/game kill; tick + win path covered by static 33/33 suite). Validation covered live (not just import): BAD_DECK/BAD_HAND_INDEX/BAD_POSITION/STALE_TICK/CARD_REJECTED/NO_ELIXIR/RATE_LIMITED all observed from server acks.

## 4. AI live (PORT 8100) — 10 cases, all PASS

| ID | Case | Expected | Actual | Verdict |
|----|------|----------|--------|---------|
| A1 | GET /health | 200 `{ok:true,service:ai}` | 200 exact | PASS |
| A2 | POST /bot/move easy | 200 echo easy, x[0,18] y[0,32] | `{"card":"fireball","x":15.52,"y":14.85,"difficulty":"easy"}` | PASS |
| A3 | POST /bot/move medium | 200 | `{"card":"fireball","x":14.21,"y":28.24,"difficulty":"medium"}` | PASS |
| A4 | POST /bot/move hard | 200 | `{"card":"knight","x":9.69,"y":6.91,"difficulty":"hard"}` | PASS |
| A5 | POST /bot/move nightmare (invalid) | 200 normalized medium | `{"card":"giant",...,"difficulty":"medium"}` | PASS |
| A6 | POST /bot/move {} (missing) | 200 default medium | `{"card":"giant",...,"difficulty":"medium"}` | PASS |
| A7 | GET /balance/cards | 200 cards[5] + note | 5 stub cards win 0.5/pick 0.2 + `stub data` note | PASS |
| A8 | GET /nope | 404 | 404 | PASS |
| A9 | GET /bot/move (wrong method) | 405 | 405 | PASS |
| A10 | POST EASY/Medium/HARD case + range | lowercased, in-range, known card | easy/medium/hard all in `x[0,18] y[0,32]`, cards ∈ stub pool | PASS |

## 5. Verdict
**PASS — 39/39 live cases** (5 HTTP + 24 socket + 10 AI). Backend `/health`, socket handshake, queue/match/state flow, all validation codes, emote throttle, sync + legacy twins verified live. AI health/bot difficulties + invalid→medium + balance stub + 404/405 verified live.

## 6. Cleanup
- `Stop-Process 8256 (backend)`, `Stop-Process 20760 (ai)` — both `KILLED`
- `netstat :4100.*LISTENING` → empty `PORT_4100_FREED`; `:8100.*LISTENING` → empty `PORT_8100_FREED`
- No jobs left (used OS processes, not PS jobs). Temp logs in `C:\Users\prate\AppData\Local\Temp\opencode\` only; repo untouched except this file. No commits. `D:\Documents\Projects\CRclone` never touched.
