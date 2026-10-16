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
