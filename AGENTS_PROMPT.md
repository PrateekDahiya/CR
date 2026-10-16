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
