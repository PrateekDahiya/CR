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
