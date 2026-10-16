# ISSUES template — copy to `docs/ISSUES_<feature>.md` per review cycle

> Rule (MEMORY.md §11, step 3): code-review agents file ALL findings here. One file per feature.
> Copy this file: `Copy-Item docs/ISSUES_TEMPLATE.md docs/ISSUES_<feature>.md`, then replace `<feature>`.

# ISSUES — <feature> (YYYY-MM-DD, reviewer: <agent-id>)

## Summary
- Scope reviewed: <paths>
- Commit/branch: <branch>@<sha>
- Verdict: <pass | pass-with-issues | fail>

## Issues
### ISS-001 — <short title>
- **Severity**: blocker | major | minor
- **Status**: open
- **File**: `<path>:<line>`
- **Category**: correctness | security | perf | conventions | docs
- **Description**: <what is wrong + why it matters>
- **Repro**: <steps / command>
- **Suggested fix**: <concrete change>
- **Fixes**: <left for fix agent — `Fixes: ISS-001` + commit>

<!-- copy block per issue; keep IDs sequential and stable; never reuse IDs -->

## Counts
- blocker: 0 | major: 0 | minor: 0 | verified: 0
