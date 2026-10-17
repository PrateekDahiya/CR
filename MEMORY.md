# MEMORY - Persistent Project Instructions (NEVER FORGET)

> This file is the source of truth for operating rules. It must stay in context for every phase, every agent, every commit.
> Last updated: 2026-10-17 | Project: CR Clone (Clash Royale clone) | Workspace: `D:\Documents\Projects\CR` | Repo: https://github.com/PrateekDahiya/CR.git

## 0. Origin
User instruction dated 2026-10-16: "PUT THIS INTO YOUR MEMORY SO EVEN IF THE CONTEXT WINDOW OVER YOU SHOULD REMEMBER ALL THIS" — all points below are mandatory and persistent.

## 1. Goal
- Create a CR (Clash Royale) clone from scratch.
- There already exists a directory named `CRclone` at `D:\Documents\Projects\CRclone` — DO NOT take reference from there. Start from scratch in `D:\Documents\Projects\CR`.
- Never read, copy, or import from `CRclone`.

## 2. Context Files Per Directory
- Every top-level directory (`frontend/`, `backend/`, `ai-service/`, `infra/`, `docs/`, `shared/`, etc.) MUST contain a `CONTEXT.md` explaining: purpose, tech, structure, how to run/test, key files, conventions.
- Keep context files updated at the end of every phase.

## 3. README
- Maintain a proper `README.md` at repo root for all building, running, deployment instructions.
- Must include: prerequisites, quickstart (docker + local), env vars, scripts, ports, troubleshooting, deployment (dev/staging/prod).
- Keep README updated per phase.

## 4. Review + Commit + Push Per Phase
- After each phase: review changes, then commit and push.
- Only phase-by-phase commits land in `main` (rule 12). No micro-commits to main.
- Commit message format: `phase(n): <short-title> - <what was built/tested/docs updated>`

## 5. Phase Tracking File
- Maintain `PROJECT_PHASES.md` to track: DONE, CURRENTLY IN PROGRESS, NEXT.
- Update it at start and end of every phase. No phase is complete without this update.

## 6. Suggestions File
- Maintain `SUGGESTIONS.md`. Whenever user provides any suggestion in between, append it there with date + status (`pending` / `scheduled:<phase>` / `implemented`).
- Do NOT work on suggestions right away. Implement only when working on related features.

## 7. Autonomy Rule
- DO NOT ask for choice. Pick the best option for current project.
- EXCEPTION: confirm main things like tech stack choice once, then proceed autonomously for all sub-steps.

## 8. Git Branching & Repo
- Remote: https://github.com/PrateekDahiya/CR.git
- Default branch: `main` (create it).
- Never push directly to `main` for big features. Create separate branches per big feature: `feature/<phase>-<slug>` e.g. `feature/phase-1-scaffolding`.
- Directly merge feature branch into `main` via `git merge --no-ff`, no PR, no waiting for approval.
- `main` history must be clean phase-by-phase merges only.

## 9. Multi-Agent Workflow + Prompt Logging
- Spawn multiple agents for independent work.
- Document EVERY prompt used for those agents in `AGENTS_PROMPT.md` with requirement + goals clearly mentioned per prompt.
- No undocumented agent work.

## 10. Product + Tech Direction
- Task: Clash Royale clone.
- Allowed frontend: html, css, react, next, tailwindcss → CHOSEN: Next.js (React) + TailwindCSS + TypeScript + Canvas for battle rendering (see README/decision log; confirmed with user once).
- Allowed backend: javascript with express, python → CHOSEN: Node.js + Express + Socket.io authoritative game server (real-time), Python + FastAPI microservice for bots/AI + balance analytics.
- Supporting: Redis (pubsub/matchmaking/ephemeral state), Postgres (profiles/decks/matches/leaderboard via Prisma), Docker Compose for all services.
- Agent may pick best sub-libraries without asking after stack confirmation.

## 11. Execution Pipeline Per Feature (6 steps)
1. Make plan per agent (role, scope, inputs, outputs, done-criteria, no-overlap paths).
2. Spawn coding agents (isolated paths).
3. Spawn code-review agents per coding agent (review correctness, security, perf, conventions; file issues in `docs/ISSUES_<feature>.md`).
4. Spawn test agents which test the feature (unit/integration/e2e/manual via docker; log in `docs/TEST_REPORT_<feature>.md`).
5. Spawn agents to fix reported issues (link issue IDs, verify fix).
6. Collision avoidance: if required create multiple git worktrees/subtrees to work independently (`infra/worktrees/` or `.worktrees/<agent>-<feature>`), merge later into feature branch, after phase complete merge into `main`.

## 12. Main-Only Phase Commits
- There must be only phase-by-phase commits in `main`. All intermediate/agent commits stay in feature branches/worktrees.

## 13. Docker Usage
- Docker is available (v29.5.3). Use docker to run multiple required containers and test the project.
- Every phase that adds a service must update `infra/docker-compose*.yml` + README run instructions + verify via `docker compose`.

## 14. How This File Stays In Context
- All coding/review/test/fix agents must be instructed (via their prompt in AGENTS_PROMPT.md) to read `MEMORY.md`, relevant `CONTEXT.md`, `PROJECT_PHASES.md`, `README.md` first.
- At phase boundaries, re-read all four files before planning next phase.

## 15. Auto-Continue Across Phases (added 2026-10-17 per user)
- DO NOT stop after each phase. If a phase is done (reviewed, merged to `main`, pushed), immediately move to the next phase with no confirmation prompt.
- No per-phase gate: no question tool, no "shall I proceed?" — proceed autonomously through PROJECT_PHASES.md NEXT list.
- Still obey rules 4,5,8,12: review→commit (feature branch)→merge --no-ff to main→push, update PHASES/README/CONTEXTs/AGENTS_PROMPT per phase.
- Only stop for: missing credentials/blocked push, unrecoverable docker/build failure after fix cycle, or explicit user `stop/pause` instruction. Otherwise keep chaining phases.
- Log auto-continuation in PROJECT_PHASES.md Phase Log (e.g. "auto-continued to Phase N").

## 16. Parallel-Agent Awareness (added 2026-10-17 per user - MANDATORY in every subagent prompt)
- ALWAYS tell every subagent explicitly that OTHER AGENTS ARE ALSO WORKING ON THE SAME PROJECT AT THE SAME TIME on the same branch/tree, so they must NOT accidentally change/delete/overwrite others' files.
- Every coding/review/test/fix prompt MUST contain: (1) "Other parallel agents are working on <list sibling scopes> - do NOT touch their paths", (2) exact allowed paths (whitelist) + forbidden paths (blacklist incl. sibling agent dirs + CRclone), (3) "If you see unexpected files from other agents (e.g. in git status), leave them alone - do NOT delete/revert/edit", (4) "Only create/edit your assigned file(s); read-only elsewhere; no git commits".
- Plan step (rule 11.1) must assign disjoint file sets per agent; merger/fixer is the ONLY role allowed to touch cross-agent files, and only after coders/reviewers/testers finish.
- If a prompt omits this clause, it violates MEMORY#16. Main agent must re-issue prompt with clause added. Log compliance in AGENTS_PROMPT.md Constraints field.

## 17. Live Testing - APIs + Playwright Chromium UI (added 2026-10-17 per user)
- Test agents MUST go beyond static checks: RUN the servers and HIT the APIs with all possible test cases (happy path + edge + invalid + rate-limit + auth if present).
- Backend/API live test procedure: `npm install` (if needed in worktree/docker), start service (`npm run dev` or `docker compose up <svc>` on free ports), wait for health, then hit: GET /health, socket connect/ping, queue:join/leave, deck:select (valid + invalid deck), card:play (valid, NO_ELIXIR, BAD_POSITION, BAD_HAND_INDEX, STALE_TICK, RATE_LIMITED), emote:send + throttle, match flow to match:end if feasible, POST /bot/move (easy/medium/hard + invalid difficulty), GET /balance/cards. Log every case PASS/FAIL with status/code in `docs/TEST_REPORT_<feature>-live.md`. Kill server after. Never leave ports hanging.
- UI tests MUST use Playwright with Chromium: frontend test agents install `@playwright/test` + `playwright install --with-deps chromium` (or use `mcr.microsoft.com/playwright` image in docker), write `frontend/tests/*.spec.ts` covering load `/`, click Play/Lobby/Deck, deck select 8 cards, lobby join, battle canvas renders, deploy click, responsive 1280x720 + 390x844. Screenshots to `docs/screenshots/`. Headless `chromium.launch()`, never firefox/webkit unless asked. Log in `docs/TEST_REPORT_<feature>-ui.md`.
- Infra must keep `infra/docker-compose.test.yml` (or test profile) with frontend/backend/ai + playwright service for CI e2e. Every phase with API/UI changes must update + run live tests; static-only TEST_REPORT is insufficient after Phase 3.
- Safety: use ephemeral ports/dbs (e.g. 4100/8100, separate redis db), no prod data, `docker compose down -v` after e2e. Document commands + cleanup in CONTEXT.md.

## 18. Exact Clash Royale UI Match (added 2026-10-17 per user - MANDATORY for all frontend)
- User requirement: "i want exact ui as real clash royale, pick screenshot from web" - ALL frontend (menu/lobby/deck/battle) MUST visually match the real Clash Royale game, not generic Tailwind placeholders.
- Reference screenshots (web, picked 2026-10-17 - agents must open these FIRST before coding UI):
  1. https://en.wikipedia.org/wiki/Clash_Royale - 1v1 + 2v2 battle screenshots (arena portrait, towers, elixir bar, card hand, timer)
  2. https://supercell.com/en/games/clashroyale/ - official art + arena colors + card style
  3. https://clashroyale.fandom.com/wiki/Arenas - all arenas look + river/bridges/towers layout
  4. https://clashroyale.fandom.com/wiki/Elixir - elixir bar (purple fill, 0-10 pips, "full" shake) + 5 start / 1 per 2.8s
  5. https://royaleapi.com/blog/2026-q2-update-may-2026-preview-2?lang=en - recent arena/event UI variations
- What "exact" means (see docs/UI_REFERENCE.md for breakdown): portrait arena 18x32 (vertical, river middle, 2 bridges, grass/checker tiles), blue (bottom) vs red (top) sides, 2x Princess + 1x King per side with HP bars + crowns, top bar (timer center, enemy name/trophies left, player right, emote button), bottom elixir bar (purple, 10 pips, number) + 4-card hand + Next card preview, card deploy (tap card then tap arena, valid/invalid highlight), damage numbers, tower explosion + crown popup, win/lose overlay with crowns/stars, sounds via WebAudio stub.
- Legal/safety: RECREATE layout/style with original code + CSS/Canvas (no ripped Supercell sprites/audio). Use emoji/CSS shapes/gradients as placeholders (e.g. 🏰 towers, 🟣 elixir) until Phase 8 art pass; never commit copyrighted PNGs. Docs must note "inspired by, not copied".
- Enforcement: every frontend prompt must include "Match docs/UI_REFERENCE.md + reference screenshots above pixel-close; verify with Playwright Chromium screenshots side-by-side". Reviewers must file ISS-UI-*** for any deviation (wrong bar color, missing pips, landscape instead of portrait, wrong tower HP bar). Live UI tester must screenshot /battle and attach diff notes in TEST_REPORT.
- Plans updated: Phase 5 = exact-CR battle client (was generic Canvas), Phase 4 shell already merged stays as base but Phase 5 must reskin menu/lobby/deck to CR style (blue gradient, gold buttons, card rarities) + add /battle route. PROJECT_PHASES.md Phase 5/6 descriptions updated accordingly.

## 19. Keep UI + Backend Running for User Preview (added 2026-10-17 per user)
- ALWAYS keep the UI (frontend :3000) and backend (:4000) running in background during development so the user can view themself at http://localhost:3000 (frontend) + http://localhost:4000/health (backend) + http://localhost:8000/health (ai-service if Phase 6+).
- How: main agent starts `backend: npm run dev (PORT=4000)` + `frontend: npm run dev (PORT=3000, NEXT_PUBLIC_BACKEND_URL=http://localhost:4000)` as detached PowerShell jobs (or `docker compose up -d` once Phase 1 compose is stable) at the start of every phase, restarts them when new features land (kill + start), and verifies health before reporting URLs.
- Subagents MUST NOT kill these preview servers (use ephemeral ports 4100/3100/8100 for their live tests per MEMORY#17). Only main agent manages :3000/:4000/:8000.
- If a server crashes, restart it + log in PROJECT_PHASES.md. Never leave user without preview for more than one phase. Report URLs + `docker ps` / job status in every phase summary.

## 20. Best Possible Time + Space Complexity (added 2026-10-17 per user - MANDATORY for all logic)
- User: "WE MUST TRY TO WRITE ALL METHOD LOGICS IN BEST possible optimization of time complexity and space complexity as every going to add up when are going to a real game."
- EVERY method/function in backend engine/net, AI service, frontend battle/render, shared libs MUST be written (and refactored) to the best realistically achievable time complexity (target O(1)/O(log n)/O(n) per tick, never O(n^2) on hot paths) and minimal space (no per-tick allocations on hot paths, reuse buffers/pools, cap collections: units 40, snapshots ring-buffer, events bounded).
- Budgets (enforced by reviewers/testers): 10Hz server tick p95 <5ms for 40 units (Node), tick snapshot ≤4KB JSON, broadcast fan-out O(rooms) with stringify-once-per-room, client 60fps frame p95 <8ms (Canvas, no layout thrash, DPR-capped), elixir/interp O(1) per frame, socket payloads delta-friendly. AI /bot/move p95 <50ms (sync rule-based, no per-request model load).
- Coding prompts MUST include: "Optimize for best time+space complexity; state Big-O per function in comments; avoid nested loops on units/towers (use spatial partition or single-pass), preallocate arrays, reuse objects, early-outs." Reviewer prompts MUST include: "File ISS-PERF-*** for any hot-path >O(n), per-tick allocation, unbounded growth, or stringify-per-client; verify with counts (units=40 worst case) + propose O() fix." Test prompts MUST include: "Measure tick ms (40 units), snapshot bytes, frame ms; log in TEST_REPORT."
- Plan: Phase 5 gets a perf migration pass FIRST (audit current engine/net/battle, migrate to optimal, re-run 33 unit + live tests) before merge; all future phases inherit §20 automatically. Log Big-O notes in CONTEXT.md per dir.

## 21. Do Not Stop Until Whole Game Done AND Tested (added 2026-10-17 per user - OVERRIDES all pause points)
- User: "donot stop until whole game done and tested."
- Run Phases 5→9 straight through to completion with NO stopping between phases (extends §15 auto-continue): after each phase merge+push, immediately start the next phase. No summaries asking "shall I proceed", no waiting for user input, no idle ends. The ONLY stops allowed: blocked push/credentials, unrecoverable build failure after fix cycle, or explicit user `stop/pause`.
- "Done" definition (all must hold): every phase 0-9 merged to `main` with --no-ff + pushed; every phase has ISSUES + TEST_REPORT files with reviewer sign-off; live API tests PASS (backend 39/39-style coverage on final code); Playwright Chromium UI tests PASS on `/`, `/deck`, `/lobby`, `/battle` (desktop + mobile screenshots); `docker compose config` PASS + full `docker compose up --build` boots all services; preview servers :3000/:4000 verified alive at the end.
- Accordingly: Phase 8 (Testing & Hardening) is a full gate - bot-vs-bot e2e, perf budgets (§20) measured, security pass - and nothing is called "done" until Phase 8 + Phase 9 (deployment, tag v0.1.0) are merged. If any test FAILs at any phase, spawn fixers and re-test in the same phase; never defer failures forward except as tracked ISSUE IDs.
- Progress visibility without stopping: keep updating PROJECT_PHASES.md Phase Log + AGENTS_PROMPT.md per phase as usual; the final message (only after v0.1.0 push) summarizes all phases + URLs + test counts.

## 22. Authentic CR Content (educational) + Aiven MySQL (added 2026-10-17 per user)
- User: "I WANT TO ADD COMPLETELY SAME CARDS, UI, MENUS, NAMING AS CLASH ROYALE, THERE IS NO NEED TO WORRY ABOUT COPYRIGHT, IT IS JUST FOR EDUCATION PURPOSE" + provided Aiven MySQL creds (DB_HOST mysql-1711824d-dahiyaprateek27-76b5.k.aivencloud.com, DB_USER avnadmin, DB_NAME cr, DB_PORT 27884, DB_SSL true).
- Interpretation (mandatory): use the SAME card roster/naming/stats, menu labels, and screen structure as Clash Royale for a faithful educational clone. BUT never commit ripped Supercell binaries (PNG/MP3/fonts) - recreate all art with original Canvas/CSS/emoji/SVG placeholders and note "inspired by, not copied" in docs/UI_REFERENCE.md. Names of generic troops (Knight, Archers, Giant...) and layout concepts are fine; actual sprite files must be user-supplied originals.
- DB: connect backend to the Aiven MySQL `cr` database via env vars ONLY (DB_HOST/DB_USER/DB_PASS/DB_NAME/DB_PORT/DB_SSL). NEVER commit real credentials to git (they ride in gitignored `infra/.env` + local env, examples only in `.env.example` with placeholders). Store all required game data there: cards (12 roster + stats), sprites metadata (name, atlas coords, placeholder path - NOT binary rips), menus (labels/structure), plus users/decks/matches/leaderboard mirrors. Provide `infra/mysql/schema.sql` + seed, `backend/src/mysql.ts` (mysql2 optional dynamic import + memory fallback, O(1) ops, SSL per DB_SSL), and `/content/*` REST endpoints.
- DB: connect backend to the Aiven MySQL `cr` database via env vars ONLY (DB_HOST/DB_USER/DB_PASS/DB_NAME/DB_PORT/DB_SSL). NEVER commit real credentials to git (they ride in gitignored `infra/.env` + local env, examples only in `.env.example` with placeholders). Store all required game data there: cards (12 roster + stats), sprites metadata (name, atlas coords, placeholder path - NOT binary rips), menus (labels/structure), plus users/decks/matches/leaderboard mirrors. Provide `infra/mysql/schema.sql` + seed, `backend/src/mysql.ts` (mysql2 optional dynamic import + memory fallback, O(1) ops, SSL per DB_SSL), and `/content/*` REST endpoints.
- Enforcement: every content prompt must include "same CR naming/structure, original art only, secrets via env never committed". Reviewers file ISS-CNT-*** for deviations (wrong card name/stat, missing menu, committed secret/binary). Live tester verifies MySQL rows + /content endpoints + no secrets in `git ls-files`.

## 23. Exact UI From User Screenshots + Full Catalog (added 2026-10-17 per user)
- User shared 8 phone screenshots in `docs/gameUI/` (renamed to state: `01-decks-tab`, `02-collection-tab`, `03-home-battle-tab`, `04-game-modes-sheet`, `05-social-leaderboard-tab`, `06-deck-edit-popup`, `07-shop-tab`, `08-clan-wars-battle`). ALL frontend chrome must match these pixel-close: dark-blue diamond-plate bg, gold/blue 3D buttons, rarity card frames (common grey-blue / rare orange / epic purple / legendary rainbow / champion gold), elixir-drop cost badges, Level labels + upgrade progress bars, top resource bar (cards/gold/gems), bottom 5-tab nav, purple Social leaderboard rows, gold Battle button, Daily Deals + Trader shop cards.
- Reference shots stay LOCAL ONLY (`docs/gameUI/` is gitignored, never committed - they are copyrighted game captures). Recreate layout/style with original code + CSS/emoji/SVG. Card art: `CardArt` component tries local `frontend/public/cards/<id>.png` (gitignored user-supplied folder) with emoji fallback; NEVER commit downloaded card art (deckshop.pro/fandom images are Supercell copyright - the user drops their own files locally; no fetch script ships for rips).
- Full catalog: card names/elixir/rarity/type are FACTS - seed `card_catalog` in MySQL from public data (fandom/wiki/lists), playable 12 keep full GAME_DESIGN stats. Collection screen shows live Found count from `/content/catalog`.
- Enforcement: reviewers file ISS-UI11-*** for layout deviations vs the 8 refs. Live tester screenshots each route at 390x844 and notes deltas in TEST_REPORT.
