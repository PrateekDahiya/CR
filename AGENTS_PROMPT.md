# AGENTS_PROMPT - Log of Every Sub-Agent Prompt

> Rule from MEMORY.md #9: document EVERY prompt used for sub-agents with requirement + goals clearly mentioned per prompt.
> Format per entry: `## <ID> - <date> - <role> - <feature/phase>` + `Requirement` + `Goals` + `Prompt (verbatim)` + `Outputs` + `Branch/worktree` + `Status`.

## PROMPT-000 - 2026-10-16 - planner - phase-0-foundation
- **Requirement**: Establish operating system before any code (MEMORY.md rules 1-13).
- **Goals**: (1) Inspect workspace without touching CRclone, (2) persist MEMORY/PHASES/SUGGESTIONS/README skeleton, (3) lock tech stack pending user confirm, (4) define branching + multi-agent pipeline.
- **Prompt (verbatim)**: N/A - executed by main agent directly (no sub-agent spawned yet). Foundation files created manually to bootstrap audit trail.
- **Outputs**: MEMORY.md, PROJECT_PHASES.md, SUGGESTIONS.md, README.md (skeleton), this file.
- **Branch/worktree**: `feature/phase-0-foundation` (to be created)
- **Status**: done

## PROMPT-001 - 2026-10-16 - coder - phase-1-frontend
- **Requirement**: Scaffold minimal Next.js frontend from scratch, isolated to `frontend/`.
- **Goals**: package.json (next14/react18/socket.io-client/tailwind), configs, app/layout+page+globals.css, Dockerfile EXPOSE 3000, .env.example, CONTEXT.md; valid syntax; no npm install; no commit.
- **Prompt (verbatim condensed)**: "Read MEMORY/README/PHASES/.gitignore first, obey isolation (only frontend/, never CRclone). Create all files listed, ensure build-conceptual validity, verify via listing + show package.json/Dockerfile."
- **Inputs**: MEMORY.md, README.md, PROJECT_PHASES.md
- **Constraints**: isolated paths: frontend/ only; no overlap with backend/ai-service/infra.
- **Done criteria**: frontend/ with 12 files + CONTEXT.md, valid JSON/JS/TS.
- **Outputs**: 12 files created (see Task ses_eb924848...); noted missing lockfile issue.
- **Branch/worktree**: `feature/phase-1-scaffolding` (shared tree, disjoint paths - no worktree needed)
- **Status**: done

## PROMPT-002 - 2026-10-16 - coder - phase-1-backend
- **Requirement**: Scaffold Express+Socket.io stub, isolated to `backend/`.
- **Goals**: package.json, tsconfig, src/index.ts (health+socket ping/pong), matchmaking.ts FIFO, .env.example, Dockerfile EXPOSE 4000, CONTEXT.md.
- **Prompt (verbatim condensed)**: "Read MEMORY/README/PHASES/.gitignore, only backend/, create files, valid TS, no npm install, no commit, verify via listing + show index.ts."
- **Inputs**: MEMORY.md, README.md, PROJECT_PHASES.md
- **Constraints**: backend/ only.
- **Done criteria**: 8 files + CONTEXT.md, health+socket present.
- **Outputs**: backend/ scaffolded (Task ses_eb924847...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-003 - 2026-10-16 - coder - phase-1-ai-service
- **Requirement**: Scaffold FastAPI AI stub, isolated to `ai-service/`.
- **Goals**: requirements.txt, main.py (/health,/bot/move,/balance/cards), test_main.py, Dockerfile EXPOSE 8000, CONTEXT.md.
- **Prompt (verbatim condensed)**: "Read MEMORY/README/PHASES/.gitignore, only ai-service/, valid Python, no pip install, no commit, verify via py_compile + listing."
- **Inputs**: MEMORY.md, README.md, PROJECT_PHASES.md
- **Constraints**: ai-service/ only.
- **Done criteria**: 6 files + CONTEXT.md.
- **Outputs**: ai-service/ scaffolded + httpx addition noted (Task ses_eb924846...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-004 - 2026-10-16 - coder - phase-1-infra-shared-docs
- **Requirement**: Scaffold infra+shared+docs, isolated to those dirs.
- **Goals**: infra/docker-compose.yml (5 services) + prod stub + .env.example + CONTEXT.md; shared/types.ts + package.json + CONTEXT.md; docs/GAME_DESIGN_STUB + CONTEXT + ISSUES_TEMPLATE.
- **Prompt (verbatim condensed)**: "Read MEMORY/README/PHASES/.gitignore, only infra/shared/docs, valid YAML, do NOT run docker, no commit, verify programmatically."
- **Inputs**: MEMORY.md, README.md, PROJECT_PHASES.md
- **Constraints**: infra/,shared/,docs/ only; contexts must be ../frontend etc (not ./frontend).
- **Done criteria**: 12 files, 5-service compose valid.
- **Outputs**: 12 files (Task ses_eb924845...); noted typo em:ote + compose path decision.
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-005 - 2026-10-16 - reviewer - phase-1-frontend
- **Requirement**: Review frontend scaffold, read-only except one ISSUES file.
- **Goals**: Check Next/Tailwind wiring, Dockerfile, env, compose; write docs/ISSUES_phase-1-frontend.md (ISS-FE-001... + PASS).
- **Prompt (verbatim condensed)**: "Read MEMORY + frontend files + compose frontend service, do NOT edit, only write ISSUES file, verdict pass-with-issues."
- **Inputs**: MEMORY.md, frontend/*, infra/docker-compose.yml
- **Constraints**: write docs/ISSUES_phase-1-frontend.md only.
- **Done criteria**: file exists with 3+ checks.
- **Outputs**: 9 issues (1 blocker missing lockfile) (Task ses_eb92264f...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-006 - 2026-10-16 - reviewer - phase-1-backend
- **Requirement**: Review backend stub.
- **Goals**: Check TS/express/socket/matchmaking/Dockerfile; write docs/ISSUES_phase-1-backend.md (ISS-BE-001...).
- **Prompt (verbatim condensed)**: "Read MEMORY + backend files + compose backend service, no edit, only write backend ISSUES file."
- **Inputs**: MEMORY.md, backend/*
- **Constraints**: docs/ISSUES_phase-1-backend.md only.
- **Done criteria**: file exists.
- **Outputs**: 10 issues (1 major lockfile) (Task ses_eb92264e...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-007 - 2026-10-16 - reviewer - phase-1-ai-shared
- **Requirement**: Review ai-service + shared types.
- **Goals**: Check FastAPI routes, httpx, tests, typo em:ote; write docs/ISSUES_phase-1-ai-shared.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + ai-service + shared/types.ts, no edit, only write ai-shared ISSUES file."
- **Inputs**: MEMORY.md, ai-service/*, shared/types.ts
- **Constraints**: docs/ISSUES_phase-1-ai-shared.md only.
- **Done criteria**: file exists.
- **Outputs**: 0 blocker/3 major/9 minor (Task ses_eb92264e...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-008 - 2026-10-16 - reviewer - phase-1-infra
- **Requirement**: Review compose/env/ignores.
- **Goals**: Check 5 services, contexts, ports, volumes, env, ignores; write docs/ISSUES_phase-1-infra.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + infra files + ignores, no edit, only write infra ISSUES file."
- **Inputs**: MEMORY.md, infra/*
- **Constraints**: docs/ISSUES_phase-1-infra.md only.
- **Done criteria**: file exists.
- **Outputs**: 0 blocker/1 major/6 minor (Task ses_eb92264e...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-009 - 2026-10-16 - tester - phase-1-static
- **Requirement**: Static/syntax tests, no heavy installs.
- **Goals**: JSON load, node --check, py_compile, yaml load, Dockerfile strings, CONTEXT existence; write docs/TEST_REPORT_phase-1-static.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + all ISSUES files, run read-only checks, only write static TEST_REPORT, no edits."
- **Inputs**: MEMORY.md, docs/ISSUES_*.md
- **Constraints**: docs/TEST_REPORT_phase-1-static.md only.
- **Done criteria**: PASS/FAIL per check + linked ISS IDs.
- **Outputs**: STATIC-SYNTAX PASS / DOCKER-BUILD FAIL as filed (Task ses_eb9215c9...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-010 - 2026-10-16 - tester - phase-1-docker
- **Requirement**: Docker config validation only.
- **Goals**: docker compose config, contexts exist, lockfile check; write docs/TEST_REPORT_phase-1-docker.md; skip build by design.
- **Prompt (verbatim condensed)**: "Read MEMORY + compose + Dockerfiles, run config (not full build if predicted FAIL), only write docker TEST_REPORT."
- **Inputs**: MEMORY.md, infra/docker-compose.yml, Dockerfiles
- **Constraints**: docs/TEST_REPORT_phase-1-docker.md only.
- **Done criteria**: config exit 0, lockfile FAIL linked.
- **Outputs**: config PASS, lockfiles missing confirmed (Task ses_eb9215c9...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-011 - 2026-10-16 - fixer - phase-1-dockerfiles
- **Requirement**: Fix ISS-FE-001 + ISS-BE-001 blockers (npm ci without lockfile).
- **Goals**: Replace npm ci with npm install in both Dockerfiles (+comment), verify config still exit 0, no commit.
- **Prompt (verbatim condensed)**: "Read MEMORY + ISSUES frontend/backend + TEST_REPORT docker + Dockerfiles, only edit 2 Dockerfiles minimal, verify EXPOSE/CMD + compose config."
- **Inputs**: MEMORY.md, docs/ISSUES_*.md, Dockerfiles
- **Constraints**: frontend/Dockerfile + backend/Dockerfile only.
- **Done criteria**: both fixed, config valid.
- **Outputs**: 2 files edited (Task ses_eb91f395...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-012 - 2026-10-16 - fixer - phase-1-typo-cleanup
- **Requirement**: Fix safe small issues + cleanup.
- **Goals**: Fix em:ote->emote:send (ISS-SH-001), delete __pycache__, append compose-path note to infra/CONTEXT.md, defer majors.
- **Prompt (verbatim condensed)**: "Read MEMORY + ai-shared/infra ISSUES + types.ts + .gitignore, only edit types.ts + infra/CONTEXT.md + delete pycache, no commit."
- **Inputs**: MEMORY.md, docs/ISSUES_*.md, shared/types.ts
- **Constraints**: shared/types.ts + infra/CONTEXT.md only (+ pycache delete).
- **Done criteria**: typo fixed, pycache gone, note added.
- **Outputs**: fixed + deferred list (Task ses_eb91f395...).
- **Branch/worktree**: `feature/phase-1-scaffolding`
- **Status**: done

## PROMPT-013 - 2026-10-17 - coder - phase-2-cards
- **Requirement**: Draft cards + balance (isolated file).
- **Goals**: 12 cards with elixir/hp/dps/speed/range/targets, balance table 0.45-0.55, counters, 8-card max-2-spells deck rule; write docs/DRAFT_CARDS.md only.
- **Prompt (verbatim condensed)**: "Read MEMORY#15 + PHASES + STUB + shared/types, only DRAFT_CARDS.md, concrete 3-min + double-elixir numbers."
- **Inputs**: MEMORY.md, PROJECT_PHASES.md, docs/GAME_DESIGN_STUB.md, shared/types.ts
- **Constraints**: docs/DRAFT_CARDS.md only.
- **Done criteria**: table present, 1-6 elixir.
- **Outputs**: 74 lines / 9145B (Task ses_eb91c2d6...).
- **Branch/worktree**: `feature/phase-2-game-design`
- **Status**: done

## PROMPT-014 - 2026-10-17 - coder - phase-2-arena
- **Requirement**: Draft arena/towers/elixir/tick/win.
- **Goals**: 18x32, river/bridges, 1400/2400 towers + king activation, elixir 1/2.8s + 1/1.4s double cap10, 3min+60s OT, 10Hz tick + interp + anti-cheat; write docs/DRAFT_ARENA.md only.
- **Prompt (verbatim condensed)**: "Read MEMORY#15 + PHASES + STUB + backend/infra CONTEXTs, only DRAFT_ARENA.md."
- **Inputs**: MEMORY.md, PROJECT_PHASES.md, docs/GAME_DESIGN_STUB.md
- **Constraints**: docs/DRAFT_ARENA.md only.
- **Done criteria**: all sections present.
- **Outputs**: 11454B (Task ses_eb91c2d5...).
- **Branch/worktree**: `feature/phase-2-game-design`
- **Status**: done

## PROMPT-015 - 2026-10-17 - coder - phase-2-protocol
- **Requirement**: Draft socket + REST protocol.
- **Goals**: client->server (queue:join/leave, deck:select, card:play, emote:send, ping) + server->client (matched, state:update 10Hz, match:end, error) + REST + additive types proposal + sequence; write docs/DRAFT_PROTOCOL.md only, do NOT edit types.ts.
- **Prompt (verbatim condensed)**: "Read MEMORY#15 + PHASES + types.ts + backend index + frontend page + ai main, only DRAFT_PROTOCOL.md, keep health/ping/emote names."
- **Inputs**: MEMORY.md, shared/types.ts, backend/src/index.ts
- **Constraints**: docs/DRAFT_PROTOCOL.md only.
- **Done criteria**: events + REST + types snippet present.
- **Outputs**: 14914B (Task ses_eb91c2d5...).
- **Branch/worktree**: `feature/phase-2-game-design`
- **Status**: done

## PROMPT-016 - 2026-10-17 - reviewer - phase-2-cards-arena
- **Requirement**: Review cards + arena drafts.
- **Goals**: Elixir math, tower vs troop TTK, coverage, OT/tick; write docs/ISSUES_phase-2-design.md (ISS-D2-001... + PASS).
- **Prompt (verbatim condensed)**: "Read MEMORY + DRAFT_CARDS/ARENA + types.ts, no edit, only write issues file (fallback _cards-arena on collision)."
- **Inputs**: MEMORY.md, docs/DRAFT_*.md
- **Constraints**: docs/ISSUES_phase-2-design.md only.
- **Done criteria**: file with 3+ checks.
- **Outputs**: 7 major/8 minor/15 PASS (Task ses_eb91b54f...).
- **Branch/worktree**: `feature/phase-2-game-design`
- **Status**: done

## PROMPT-017 - 2026-10-17 - reviewer - phase-2-protocol
- **Requirement**: Review protocol draft.
- **Goals**: Names vs code, additive types, REST, tick size, AI compat; write docs/ISSUES_phase-2-protocol.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + DRAFT_PROTOCOL + types.ts + backend/ai code, no edit, only protocol issues file."
- **Inputs**: MEMORY.md, docs/DRAFT_PROTOCOL.md
- **Constraints**: docs/ISSUES_phase-2-protocol.md only.
- **Done criteria**: file exists.
- **Outputs**: 0 blocker/2 major/5 minor + 8 PASS (Task ses_eb91b54e...).
- **Branch/worktree**: `feature/phase-2-game-design`
- **Status**: done

## PROMPT-018 - 2026-10-17 - tester - phase-2-design
- **Requirement**: Static consistency tests, no docker.
- **Goals**: 3 drafts exist, elixir 1-6 + deck rule, arena 18x32 + towers + 10Hz, protocol events + emote:send, no CRclone refs, types.ts intact; write docs/TEST_REPORT_phase-2-design.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + 3 drafts + types.ts, run python/powershell checks, only write TEST_REPORT, no edits."
- **Inputs**: MEMORY.md, docs/DRAFT_*.md
- **Constraints**: docs/TEST_REPORT_phase-2-design.md only.
- **Done criteria**: PASS/FAIL table + links.
- **Outputs**: 6/6 PASS (Task ses_eb91b54e...).
- **Branch/worktree**: `feature/phase-2-game-design`
- **Status**: done

## PROMPT-019 - 2026-10-17 - fixer/merger - phase-2-merge
- **Requirement**: Combine 3 drafts to final GAME_DESIGN.md + additive types.ts patch + cleanup.
- **Goals**: GAME_DESIGN.md >20KB with fixes (Archers Zap, King 100, Giant 14s, state:update canonical, pocket 4, avg 3.375 + bonus majors), types.ts add CardStats/DeployRequest/ServerTick via Omit (no break), delete DRAFT_*.md, update docs/CONTEXT.md note.
- **Prompt (verbatim condensed)**: "Read MEMORY#15 + PHASES + 3 drafts + 2 ISSUES + TEST_REPORT + types.ts + CONTEXT, create GAME_DESIGN.md, patch types.ts additively, delete drafts, no commit."
- **Inputs**: MEMORY.md, docs/DRAFT_*.md, docs/ISSUES_*.md, shared/types.ts
- **Constraints**: docs/GAME_DESIGN.md (new) + shared/types.ts + docs/CONTEXT.md + delete drafts only.
- **Done criteria**: GAME_DESIGN>20KB, types has CardStats/DeployRequest, no drafts.
- **Outputs**: 43561B/619 lines + types additive, drafts deleted (Task ses_eb91a25f...).
- **Branch/worktree**: `feature/phase-2-game-design`
- **Status**: done

## PROMPT-020 - 2026-10-17 - coder - phase-3-engine
- **Requirement**: Authoritative 10Hz engine under backend/src/game/ only.
- **Goals**: cards.ts 12 cards, arena.ts 18x32/towers/deploy, engine.ts createGame/tickGame/playCard + elixir/win/validation; pure TS deterministic.
- **Prompt (verbatim condensed)**: "Read MEMORY#15 + GAME_DESIGN + types + backend CONTEXT/index/matchmaking; only game/ (cards/arena/engine), no socket/redis, no commit, verify node --check."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, shared/types.ts
- **Constraints**: backend/src/game/ only; other agents on net/tests - do NOT touch (MEMORY#16 pending formalization, observed via disjoint paths).
- **Done criteria**: 3 files valid syntax.
- **Outputs**: cards 9KB + arena 5KB + engine 25KB, tsc strict PASS + runtime 8 rejects verified (Task ses_eb9178bc...).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-021 - 2026-10-17 - coder - phase-3-net
- **Requirement**: Net layer rooms/validation/redis + index/matchmaking wiring.
- **Goals**: rooms 10Hz broadcast state:update, validation 8 codes, redis fallback, tryMatch pairing, index twins; import engine, no duplication.
- **Prompt (verbatim condensed)**: "Read MEMORY + GAME_DESIGN protocol + types + index/matchmaking; only net/ + index/matchmaking edits, never game/tests."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, backend/src/index.ts
- **Constraints**: backend/src/net/ + index/matchmaking only.
- **Done criteria**: 3 new + 2 edited, tsc scope PASS.
- **Outputs**: rooms/validation/redis + wiring, 24 smoke PASS incl real engine (Task ses_eb9178bb...; noted engine:598 typo - later proven absent).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-022 - 2026-10-17 - coder - phase-3-tests
- **Requirement**: Unit tests under backend/tests/ only.
- **Goals**: engine.test 16 tests + validation.test 17 tests (node:test, no jest), README, package.json test script tsx --test.
- **Prompt (verbatim condensed)**: "Read MEMORY + GAME_DESIGN + types + package.json; only tests/ + package.json test line, no other edits."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, backend/package.json
- **Constraints**: backend/tests/ + package.json test script only.
- **Done criteria**: 33 tests runnable npm test.
- **Outputs**: 33 pass / 0 fail (Task ses_eb9178ba...; adapted to real engine API).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-023 - 2026-10-17 - reviewer - phase-3-engine
- **Requirement**: Review engine + tests, no edits.
- **Goals**: Cards/arena/tick/king/win/codes/coverage; write docs/ISSUES_phase-3-engine.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + GAME_DESIGN + game/*.ts + tests; no edit, only engine issues file."
- **Inputs**: MEMORY.md, backend/src/game/, backend/tests/
- **Constraints**: docs/ISSUES_phase-3-engine.md only; other reviewers on net - do NOT touch.
- **Done criteria**: file with checks.
- **Outputs**: pass-with-issues 1maj/7min + 8 PASS, 33/33 pass, tsc clean, :598 typo NOT present (Task ses_eb91229d...).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-024 - 2026-10-17 - reviewer - phase-3-net
- **Requirement**: Review net, no edits.
- **Goals**: 10Hz, tryMatch, 8 codes, twins, redis fallback, no duplication; write docs/ISSUES_phase-3-net.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + GAME_DESIGN + net/*.ts + index/matchmaking + types; no edit, only net issues file."
- **Inputs**: MEMORY.md, backend/src/net/
- **Constraints**: docs/ISSUES_phase-3-net.md only.
- **Done criteria**: file exists.
- **Outputs**: PASS 0blk/0maj/4min (Task ses_eb91229d...).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-025 - 2026-10-17 - tester - phase-3-static
- **Requirement**: Static + unit (no live yet - pre MEMORY#17).
- **Goals**: node --check, npm test 33/33, tsc --noEmit, 10Hz/elixir/win, compose config; write docs/TEST_REPORT_phase-3-backend.md.
- **Prompt (verbatim condensed)**: "Read MEMORY + GAME_DESIGN + package.json; run checks, only write TEST_REPORT, no edits."
- **Inputs**: MEMORY.md, backend/package.json
- **Constraints**: docs/TEST_REPORT_phase-3-backend.md only.
- **Done criteria**: 7/7 table.
- **Outputs**: 7/7 PASS (Task ses_eb91229d...).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-026 - 2026-10-17 - fixer - phase-3-minors
- **Requirement**: Fix cheap safe minors (MEMORY#16 parallel clause included).
- **Goals**: rooms.ts MAX_LIVE_UNITS 40 cap + stringify guards (ISS-N3-001/004), backend/CONTEXT.md §9 Phase 3 note; defer coverage/tuning.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: other agents finished, you are only fixer - do NOT touch ISSUES/TEST_REPORT/MEMORY/index/matchmaking; read MEMORY#11/15/16 + ISSUES + engine/rooms/CONTEXT; only rooms.ts + backend/CONTEXT.md."
- **Inputs**: MEMORY.md, docs/ISSUES_phase-3-*.md, backend/src/net/rooms.ts
- **Constraints**: backend/src/net/rooms.ts + backend/CONTEXT.md only (MEMORY#16 compliant).
- **Done criteria**: cap present, node --check PASS.
- **Outputs**: fixed N3-001/004 + deferred list (Task ses_eb910140...).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-027 - 2026-10-17 - live-tester - phase-3-live (MEMORY#17 first run)
- **Requirement**: Live API test - run servers + hit all cases (MEMORY#17).
- **Goals**: Backend 4100: health, TCP, 404, socket handshake, ping, deck valid/invalid, queue join/leave/match twins, card:play 6 rejects + valid + NO_ELIXIR/RATE_LIMITED, emote + throttle, sync, legacy leave; AI 8100: health, bot/move easy/med/hard/invalid/missing + range, balance, 404/405; write docs/TEST_REPORT_phase-3-live.md; kill servers.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: you are only live tester - do NOT touch game/net/tests/ISSUES; read MEMORY#15-17 + GAME_DESIGN + index/package + ai main; run backend 4100 + ai 8100 jobs, hit 39 cases, write live report, cleanup ports."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, backend/src/index.ts, ai-service/main.py
- **Constraints**: docs/TEST_REPORT_phase-3-live.md only; no commits; ephemeral ports 4100/8100.
- **Done criteria**: 10+ cases logged, ports freed.
- **Outputs**: 39/39 PASS, PIDs killed, netstat empty (Task ses_eb90ee02...).
- **Branch/worktree**: `feature/phase-3-backend-server`
- **Status**: done

## PROMPT-028 - 2026-10-17 - coder - phase-4-shell
- **Requirement**: App shell + routing (MEMORY#16 clause).
- **Goals**: app/page menu (Play vs AI/1v1/Deck + health dot), app/lobby (playerId + deck preview + Join/Leave), layout nav, globals .btn; write app/* only.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: deck agent on components/deck+lib, net agent on lib/socket+lobby... do NOT touch their paths; read MEMORY#15-17 + GAME_DESIGN§12 + CONTEXT + page/layout + types; only app/page,lobby,layout,globals."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, frontend/app/page.tsx, shared/types.ts
- **Constraints**: frontend/app/* only; deck/lib/tests forbidden.
- **Done criteria**: shell pages exist.
- **Outputs**: page+lobby+nav+btn (Task ses_eb90ad0d...; TODO socket wiring).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-029 - 2026-10-17 - coder - phase-4-deck-lib
- **Requirement**: Deck builder + card lib.
- **Goals**: lib/cards.ts 12 cards + validateDeck, CardTile, DeckBuilder 8 slots max2spells localStorage, app/deck/page; pure TSX no socket.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: shell on app/* + net on lib/socket + tests; do NOT touch app/*, socket, tests; read MEMORY + GAME_DESIGN§§1-4 + types; only components/deck + lib/cards + app/deck."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, shared/types.ts
- **Constraints**: frontend/components/deck/ + lib/cards.ts + app/deck/page only.
- **Done criteria**: 4 files, node --check cards PASS.
- **Outputs**: 12 cards avg 3.375 valid, no socket import (Task ses_eb90ad0c...).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-030 - 2026-10-17 - coder - phase-4-net-tests
- **Requirement**: Socket client + api + Playwright setup (MEMORY#17).
- **Goals**: lib/socket.ts (queue/deck/card/emote + twins + serverTimeMs), lib/api.ts (health/bot/balance), tests/shell.spec.ts 3 Chromium tests, tests/README, package.json +@playwright/test + test:e2e.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: shell + deck agents... do NOT touch app/*, deck; read MEMORY#17 + GAME_DESIGN§12 + types + backend index + package; only lib/socket,api + tests + package.json."
- **Inputs**: MEMORY.md, shared/types.ts, backend/src/index.ts
- **Constraints**: frontend/lib/socket.ts,api.ts + tests/ + package.json only.
- **Done criteria**: net scaffolds + 3 specs.
- **Outputs**: socket 278 lines + api + spec (noted data-testid contracts needed) (Task ses_eb90ad0b...).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-031 - 2026-10-17 - reviewer - phase-4-shell-deck
- **Requirement**: Review shell + deck (MEMORY#16).
- **Goals**: Routing, Tailwind, 8 slots, starter 3.375, data-testid contracts, localStorage keys, spec button vs link; write docs/ISSUES_phase-4-shell.md.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: other reviewer on net/tests... do NOT touch net issues/reports; read MEMORY + GAME_DESIGN + app/deck/components/lib/cards + types; only shell issues file."
- **Inputs**: MEMORY.md, frontend/app/, frontend/components/
- **Constraints**: docs/ISSUES_phase-4-shell.md only.
- **Done criteria**: file with checks.
- **Outputs**: FAIL 1blk/4maj/5min (missing testids, key mismatch, button/link, missing playwright config) + 10 PASS (Task ses_eb9094c6...).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-032 - 2026-10-17 - reviewer - phase-4-net
- **Requirement**: Review net + Playwright (MEMORY#16).
- **Goals**: Events vs backend, REST, chromium-only, baseURL, 3 specs; write docs/ISSUES_phase-4-net.md.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: shell reviewer + tester running... do NOT touch shell issues/reports; read MEMORY#17 + GAME_DESIGN§12 + socket/api/spec + backend index + types; only net issues file."
- **Inputs**: MEMORY.md, frontend/lib/, backend/src/index.ts
- **Constraints**: docs/ISSUES_phase-4-net.md only.
- **Done criteria**: file exists.
- **Outputs**: pass-with-issues 0blk/2maj/5min (missing config, onMatched double-fire) (Task ses_eb9094c5...).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-033 - 2026-10-17 - tester - phase-4-static
- **Requirement**: Static checks (MEMORY#16).
- **Goals**: node --check lib, package.json, routes, 8 slots, validateDeck, 3 specs, data-testid scan; write docs/TEST_REPORT_phase-4-static.md.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: reviewers writing ISSUES... do NOT touch ISSUES; read MEMORY + package + app/lib/spec; only static TEST_REPORT."
- **Inputs**: MEMORY.md, frontend/package.json
- **Constraints**: docs/TEST_REPORT_phase-4-static.md only.
- **Done criteria**: 9 checks table.
- **Outputs**: FAIL 5/9 (0 testids, button/link mismatch) (Task ses_eb9094c5...).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-034 - 2026-10-17 - fixer - phase-4-blockers
- **Requirement**: Fix e2e contract blockers (MEMORY#16).
- **Goals**: DeckBuilder data-testid card-slot, lobby player-id-input + key cr-clone-deck-v1 + validateDeck, page nav-play/lobby/deck testids (keep Links), create playwright.config.ts chromium; defer N4-002 + minors.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: you are only fixer... do NOT touch ISSUES/static report; read MEMORY#16-17 + ISSUES + DeckBuilder/lobby/page/spec/package; only DeckBuilder + lobby + page + playwright.config."
- **Inputs**: MEMORY.md, docs/ISSUES_phase-4-*.md
- **Constraints**: DeckBuilder + lobby/page + page + playwright.config only.
- **Done criteria**: testids present.
- **Outputs**: fixed F4-001..005/N4-001, deferred N4-002 + spec link update (Task ses_eb907e86...).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-035 - 2026-10-17 - live-tester - phase-4-ui (MEMORY#17 Playwright Chromium)
- **Requirement**: Live UI + API sanity with Playwright Chromium (MEMORY#17).
- **Goals**: npm install + playwright install chromium, run backend 4100 + frontend 3100, fix spec additively (button->link/nav-*), run playwright --project=chromium 3 tests, API ping/join/deck/leave, screenshots home/deck/lobby, write docs/TEST_REPORT_phase-4-ui.md, kill jobs.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: fixer finished, you are only live tester... do NOT touch ISSUES/static; allowed spec additive + README + ui report + screenshots; read MEMORY#17 + GAME_DESIGN + config/spec/page + backend index; run 3100+4100, 8 cases, cleanup."
- **Inputs**: MEMORY.md, frontend/playwright.config.ts, backend/src/index.ts
- **Constraints**: shell.spec.ts (additive) + tests/README + TEST_REPORT_phase-4-ui.md + screenshots only; ports 3100/4100.
- **Done criteria**: 3 UI + API PASS, ports freed.
- **Outputs**: PASS 8/8 (3 UI + 5 API), Playwright 1.64.1 Chromium 156.0.8078.4, screenshots 3 (Task ses_eb906eeb...).
- **Branch/worktree**: `feature/phase-4-frontend-shell`
- **Status**: done

## PROMPT-036 - 2026-10-17 - coder - phase-5-arena-canvas (MEMORY#18 exact UI)
- **Requirement**: Arena Canvas portrait 18x32 exact-CR (MEMORY#16 + #18).
- **Goals**: ArenaCanvas.tsx (grass checker, river/bridges, deploy tint, pocket dotted, towers HP bars + crown + explosion, units emoji + interp lerp, spells, damage numbers, 60fps rAF, click->tile, no socket) + TowerView.tsx (HP bar + canvas helper); match UI_REFERENCE §§2-4 + wiki/supercell screenshots, original code only.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: elixir-hand + battle-flow agents... do NOT touch their paths; read MEMORY#15-18 + UI_REFERENCE + GAME_DESIGN§§5-9 + CONTEXT + types + socket(transport only); only ArenaCanvas + TowerView."
- **Inputs**: MEMORY.md, docs/UI_REFERENCE.md, docs/GAME_DESIGN.md, shared/types.ts
- **Constraints**: frontend/components/battle/ArenaCanvas.tsx + TowerView.tsx only.
- **Done criteria**: 2 files, no socket import.
- **Outputs**: 21KB + 4.9KB, tsc 0 errors in files, offscreen terrain noted (Task ses_eb8f7558...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-037 - 2026-10-17 - coder - phase-5-elixir-hand (MEMORY#18)
- **Requirement**: Elixir bar + hand + top bar exact-CR.
- **Goals**: ElixirBar.tsx (purple gradient, 10 pips, number, shake at 10, leak prop), Hand.tsx (4 slots rarity borders + cost + Next preview + testids), BattleTopBar.tsx (names/trophies, timer m:ss + OT, mute/emote); no socket.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: arena + flow agents... do NOT touch their paths; read MEMORY#18 + UI_REFERENCE§§4-6 + GAME_DESIGN§§1/7 + cards + types; only ElixirBar + Hand + BattleTopBar."
- **Inputs**: MEMORY.md, docs/UI_REFERENCE.md, frontend/lib/cards.ts
- **Constraints**: 3 component files only.
- **Done criteria**: testids elixir-bar/card-hand-0..3 present.
- **Outputs**: 3 files, tsc clean (Task ses_eb8f7557...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-038 - 2026-10-17 - coder - phase-5-battle-flow
- **Requirement**: /battle route + hook + sfx + spec.
- **Goals**: app/battle/page.tsx (localStorage, socket flow, overlays, tap-deploy + sfx), lib/battle/useBattle.ts (serverTimeMs clock, 60fps interp, elixir extrap, hand cycle, isDeployValid), sfx.ts (WebAudio + mute), tests/battle.spec.ts (3 Chromium tests + screenshots); local fallbacks w/ swap notes (siblings landed mid-task).
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: arena + elixir agents... do NOT touch components; read MEMORY#17-18 + UI_REFERENCE + GAME_DESIGN§12 + socket/api + lobby + types; only battle page + lib/battle + spec."
- **Inputs**: MEMORY.md, frontend/lib/socket.ts, shared/types.ts
- **Constraints**: app/battle/page + lib/battle/* + tests/battle.spec only.
- **Done criteria**: 4 files, tsc 0 errors.
- **Outputs**: 4 files, fallback-vs-sibling drift flagged for merger (Task ses_eb8f7556...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-039 - 2026-10-17 - reviewer - phase-5-arena (MEMORY#16 + #18)
- **Requirement**: Review arena canvas for exact-CR match.
- **Goals**: 18x32, hexes, river/bridges, tint/pocket/X, towers HP/crown/explosion, units/spells/numbers, rAF interp, border, click, no socket; write docs/ISSUES_phase-5-arena.md.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: flow reviewer + tester running... only arena issues file; read MEMORY#16-19 + UI_REFERENCE + GAME_DESIGN + ArenaCanvas + TowerView + types; refs wiki/supercell/fandom."
- **Inputs**: MEMORY.md, docs/UI_REFERENCE.md, frontend/components/battle/
- **Constraints**: docs/ISSUES_phase-5-arena.md only; no server kills.
- **Done criteria**: file with 10+ checks.
- **Outputs**: pass-with-issues 1maj/7min + 16 PASS (Task ses_eb8eea03...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-040 - 2026-10-17 - reviewer - phase-5-flow (MEMORY#16 + #18)
- **Requirement**: Review hand/flow/spec.
- **Goals**: Elixir 10 pips, hand contracts, topbar, localStorage keys, socket events + twins, sfx, spec screenshots; write docs/ISSUES_phase-5-flow.md.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: arena reviewer + tester... only flow issues file; read MEMORY#16-19 + UI_REFERENCE + GAME_DESIGN§12 + components + page + useBattle + sfx + spec + socket + types."
- **Inputs**: MEMORY.md, frontend/components/battle/, frontend/app/battle/
- **Constraints**: docs/ISSUES_phase-5-flow.md only; no server kills.
- **Done criteria**: file exists.
- **Outputs**: pass-with-issues 1blk/5maj/6min (fallback-vs-sibling props not swappable blocker) (Task ses_eb8eea02...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-041 - 2026-10-17 - tester - phase-5-static (MEMORY#16)
- **Requirement**: Static checks (no live).
- **Goals**: node --check lib, package.json, /battle route, 5 components, lib/battle files, testids grep, spec count, tsc; write docs/TEST_REPORT_phase-5-static.md.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: reviewers writing ISSUES... do NOT touch ISSUES; read MEMORY + package + components + page + spec; only static report; no ports."
- **Inputs**: MEMORY.md, frontend/package.json
- **Constraints**: docs/TEST_REPORT_phase-5-static.md only.
- **Done criteria**: table + verdict.
- **Outputs**: CONDITIONAL PASS (testid/props drift S1/S2/S3, merger must reconcile) (Task ses_eb8eea01...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-042 - 2026-10-17 - fixer/merger - phase-5-contracts
- **Requirement**: Reconcile fallback-vs-sibling contract (MEMORY#16 + #18).
- **Goals**: page.tsx imports siblings (ArenaCanvas/ElixirBar/Hand/BattleTopBar, delete fallbacks); useBattle OT-vs-double-elixir split + pocket-4 + flat setState + Play-Again reset; spec additive OR-locators + 4th pips test.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: you are ONLY fixer... do NOT touch ISSUES/static report; read MEMORY#16-19 + UI_REFERENCE + ISSUES + static + page + components + useBattle; only page + useBattle + spec."
- **Inputs**: MEMORY.md, docs/ISSUES_phase-5-*.md, frontend/app/battle/page.tsx
- **Constraints**: page.tsx + useBattle.ts + battle.spec.ts (additive) only; components read-only.
- **Done criteria**: sibling imports, no fallback defs, pocket bands present.
- **Outputs**: reconciled, tsc 0 battle errors, deferred polish to Phase 8 (Task ses_eb8ecf94...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-043 - 2026-10-17 - perf - phase-5-migration (MEMORY#20 first run)
- **Requirement**: Migrate hot paths to best time+space (MEMORY#20).
- **Goals**: engine tickGame O(u·(u+t)) zero-alloc + dist²/AABB, playCard O(1) zero-alloc, rooms syncWire zero-alloc + stringify-once-per-room, useBattle O(v) scratch, ArenaCanvas offscreen blit + DPR cap 2 + ring buffers + dirty-check; Big-O comments; 33/33 green; measure tick ms + snapshot bytes; CONTEXT Big-O notes.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: you are ONLY agent... do NOT touch ISSUES/reports/UI_REFERENCE; read MEMORY#20 + GAME_DESIGN§§9-11 + engine + rooms + useBattle + ArenaCanvas + tests; only engine + rooms + useBattle + ArenaCanvas + CONTEXT appends; npm test only, no ports."
- **Inputs**: MEMORY.md, backend/src/game/engine.ts, backend/src/net/rooms.ts
- **Constraints**: 4 code files + 2 CONTEXT appends only.
- **Done criteria**: 33/33 PASS + measurements logged.
- **Outputs**: tick 0.034-0.046ms (~100x headroom), snapshot 6105B@40u / 3979B@22u, 33/33 PASS, tsc clean (Task ses_eb8e24a7...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done

## PROMPT-044 - 2026-10-17 - live-tester - phase-5-ui (MEMORY#17 + #18, retry)
- **Requirement**: Playwright Chromium live battle (MEMORY#17 + #18, #16).
- **Goals**: Backend :4100 + frontend :3100 ephemeral, 4 battle tests, /battle screenshots mobile+desktop vs UI_REFERENCE §8, TEST_REPORT_phase-5-ui.md, kill only own ports, verify preview :3000/:4000 intact.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: you are only live tester... code read-only, allowed spec additive + README + ui report + screenshots; read MEMORY#17-19 + UI_REFERENCE§§7-8 + spec + config + page + backend index; run 3100+4100, cleanup, verify preview."
- **Inputs**: MEMORY.md, docs/UI_REFERENCE.md, frontend/tests/battle.spec.ts
- **Constraints**: spec additive + README + TEST_REPORT_phase-5-ui.md + screenshots only; ports 4100/3100; no commits.
- **Done criteria**: 4 tests PASS + screenshots + preview intact.
- **Outputs**: 4/4 PASS (spec MouseEvent + path fixes), screenshots mobile+desktop, preview :4000 ok but :3000/ 404 (stale dev cache, flagged for main-agent restart) (Task ses_eb8daae4...).
- **Branch/worktree**: `feature/phase-5-battle-client`
- **Status**: done
## PROMPT-045 - 2026-10-17 - coder - phase-6-bot-brain (SUBAGENT FAILED, main executed)
- **Requirement**: Rule-based bot brain (MEMORY#20 <50ms + Big-O).
- **Goals**: bot.py easy O(h) / medium O(h+t) / hard O(h+t+u), cards mirror GAME_DESIGN, no I/O.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: routes + analytics agents... only bot.py; read MEMORY#16-17/#20/#21 + GAME_DESIGN§§1-2/12.4 + main + CONTEXT + types; no commits."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, ai-service/main.py
- **Constraints**: ai-service/bot.py (+cards_data if needed) only.
- **Done criteria**: compiles, no new deps.
- **Outputs**: FAILED to spawn (Model muse-spark-1.3-contributor-free deprecated, Task ses_eb8cadb8...). Recovered: files present from earlier partial run (bot.py 624 lines); main-agent fixed Mapping import + dict-hand + side-aware _scan_enemies, verified legal moves.
- **Branch/worktree**: `feature/phase-6-ai-service`
- **Status**: done (main-agent recovery)

## PROMPT-046 - 2026-10-17 - coder - phase-6-routes (SUBAGENT FAILED, main executed)
- **Requirement**: Upgrade routes (MEMORY#20 p95 <50ms, ISS-P2-002 handIndex).
- **Goals**: lazy bot import, hand resolve + substituted + took_ms, difficulty 200 default, balance reads analytics else stub; test_main 6 tests.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: bot + analytics agents... only main.py/requirements/test_main/CONTEXT; read MEMORY + GAME_DESIGN§12.4 + ISS-P2-002 + main/test/CONTEXT."
- **Inputs**: MEMORY.md, ai-service/main.py, ai-service/test_main.py
- **Constraints**: main.py + test_main.py + CONTEXT append only.
- **Done criteria**: 6 tests, no new deps.
- **Outputs**: FAILED to spawn (Task ses_eb8cadb9...). Recovered: main.py already upgraded (canonical signature missing - main-agent added); test_main.py rewritten 7 tests by main-agent; pytest 12/12 green.
- **Branch/worktree**: `feature/phase-6-ai-service`
- **Status**: done (main-agent recovery)

## PROMPT-047 - 2026-10-17 - coder - phase-6-analytics (SUBAGENT FAILED, main executed)
- **Requirement**: Balance store O(k)/O(c)/O(n+c) (MEMORY#20).
- **Goals**: analytics.py ring-buffer + record_match/game + card_stats + flag_outliers + 5 tests.
- **Prompt (verbatim condensed)**: "PARALLEL-AGENT AWARENESS: bot + routes agents... only analytics.py + test_analytics.py; read MEMORY + GAME_DESIGN§2 + CONTEXT."
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md
- **Constraints**: ai-service/analytics.py + test_analytics.py only.
- **Done criteria**: 2 files.
- **Outputs**: FAILED to spawn (Task ses_eb8cadb7...). Recovered: files present (analytics.py 297 lines, test_analytics.py 103 lines); verified 12-card pool + eviction exact.
- **Branch/worktree**: `feature/phase-6-ai-service`
- **Status**: done (main-agent recovery)

## PROMPT-048 - 2026-10-17 - reviewer/tester - phase-6-ai (main-agent, no subagent)
- **Requirement**: Review + pytest + live 8100 matrix (MEMORY#16-17/#20).
- **Goals**: Fix Mapping/signature/hand/scan/balance issues, pytest 12/12, live 9/9, write ISSUES + TEST_REPORT.
- **Prompt (verbatim condensed)**: N/A - main-agent direct (subagent infra deprecated). Only ai-service/* + docs/ISSUES_phase-6-ai.md + docs/TEST_REPORT_phase-6-ai.md.
- **Inputs**: MEMORY.md, ai-service/*, docs/GAME_DESIGN.md
- **Constraints**: ai-service/* + 2 docs only; ephemeral 8100; preview :3000/:4000 untouched.
- **Done criteria**: 12 unit + 9 live PASS + docs.
- **Outputs**: ISS-AI6-001..006 (5 fixed, 1 deferred ConfigDict), TEST_REPORT 12/12 + 9/9 live, balance 5->12 fixed, took_ms 0.05ms.
- **Branch/worktree**: `feature/phase-6-ai-service`
- **Status**: done

## PROMPT-049 - 2026-10-17 - builder/tester - phase-7-persistence (main-agent, no subagents)
- **Requirement**: Prisma schema + db/auth/meta + leaderboard UI + tests + live (MEMORY#18/#20/#21).
- **Goals**: schema.prisma User/Deck/Match, db.ts Prisma-or-memory O(1)/O(n log n), auth.ts guest token, meta.ts 6 routes, meta.test.ts 2 suites, frontend leaderboard + api, tsc clean, npm test 35/35, live :4000 7/7.
- **Prompt (verbatim condensed)**: N/A - main-agent direct (subagent infra deprecated). Only backend/prisma+src/db+auth+meta+tests + frontend leaderboard/api + 2 docs + CONTEXTs.
- **Inputs**: MEMORY.md, docs/GAME_DESIGN.md, backend/src/index.ts, frontend/lib/api.ts
- **Constraints**: listed paths only; preview :3000/:8000 untouched, :4000 restarted once for live test (MEMORY#19).
- **Done criteria**: 35/35 + 7/7 live + docs.
- **Outputs**: schema + db/auth/meta + 35/35 PASS + 7/7 live (db:false fallback), ISS-M7-001..003 + TEST_REPORT_phase-7-meta.md.
- **Branch/worktree**: `feature/phase-7-persistence`
- **Status**: done

