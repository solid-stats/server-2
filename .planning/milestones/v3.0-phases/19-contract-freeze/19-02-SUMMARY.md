---
phase: 19-contract-freeze
plan: 02
subsystem: ci
tags: [openapi, oasdiff, breaking-change-gate, ci, contract-freeze, branch-protection]

# Dependency graph
requires:
  - phase: 19-01
    provides: "OpenAPI artifact pinned to 1.0.0 (the stable baseline the contract-diff gate diffs against) + DB-free frozen-contract test"
provides:
  - "CI contract-diff job (oasdiff/oasdiff-action/breaking@v0.0.56, fail-on ERR) classifying OpenAPI diffs: additive pass, ERR breaking fail"
  - "README semver bump policy + two-gate layering (openapi:verify drift gate + oasdiff classification gate) + PG integration freeze gate confirmation"
  - "FREEZE-04 verify-and-keep confirmation: existing Verify job's pnpm run verify -> test:integration is the PG integration freeze gate, unchanged"
affects: [web (contract compatibility now CI-enforced), maintainer branch-protection settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Breaking-change classification as a CI-only GitHub Action (Go binary), zero new package.json/runtime dependency"
    - "Git-revision base syntax (origin/<base_ref>:path) + fetch-depth:0 + PR-only guard — no manual base checkout / git show"
    - "Separate required CI job (parallel to the heavy docker-compose verify job) rather than an inline step"

key-files:
  created:
    - .planning/phases/19-contract-freeze/19-02-SUMMARY.md
  modified:
    - .github/workflows/cd.yml
    - README.md

key-decisions:
  - "oasdiff pinned to exact immutable tag v0.0.56 (never floating @v0) — supply-chain hygiene (T-19-04 / Security V14); action releases ~daily"
  - "fail-on: ERR not WARN — additive evolution passes freely; only definite breaking changes block (RESEARCH Pattern 2)"
  - "contract-diff is a SEPARATE sibling job (not a step in verify) — parallelizes and keeps the heavy docker-compose job independent; both required gates block merge"
  - "FREEZE-04 verify-and-keep: zero edit to the verify job or package.json — confirmed by inspection only (RESEARCH locked decision)"

requirements-completed: [FREEZE-03, FREEZE-04]

# Metrics
duration: ~5min
completed: 2026-06-07
---

# Phase 19 Plan 02: Contract Freeze (CI breaking-change gate + bump policy) Summary

**A separate exact-tag-pinned oasdiff `contract-diff` CI job now classifies OpenAPI diffs (additive pass, ERR breaking fail) on top of the existing byte-equality drift gate, the README documents the semver bump policy and two-gate layering, and the existing Verify job is confirmed (unchanged) as the PostgreSQL integration freeze gate.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 2 code tasks executed + 1 human-verify checkpoint documented as a manual follow-up
- **Files modified:** 2 (`.github/workflows/cd.yml`, `README.md`)

## Accomplishments

- Added a new top-level `contract-diff` job (display name `Contract diff`) to `.github/workflows/cd.yml`, sibling to the existing `verify` and `image` jobs. The job is guarded `if: github.event_name == 'pull_request'` (github.base_ref is empty on push), `timeout-minutes: 10`, checks out with `fetch-depth: 0` so `origin/${{ github.base_ref }}` is resolvable for the git-revision base, and runs `oasdiff/oasdiff-action/breaking@v0.0.56` with `base: 'origin/${{ github.base_ref }}:openapi/server-2.openapi.json'`, `revision: 'HEAD:openapi/server-2.openapi.json'`, `fail-on: ERR`.
- Verified `verify` and `image` jobs are byte-unchanged (the diff adds only the new job — zero removed lines), and `package.json` is unchanged (no oasdiff dependency; CI-only Go binary).
- Validated the workflow YAML parses (`python3 -c "import yaml; yaml.safe_load(...)"`) and its `jobs` map contains exactly `verify`, `contract-diff`, `image`.
- Added a README "Contract version and bump policy" subsection adjacent to the contract-artifact line: 1.0.0 frozen baseline; additive -> minor; breaking -> major + regenerated-and-committed baseline in the same PR; the two complementary gates (openapi:verify byte-equality drift gate vs oasdiff contract-diff classification gate); the `/stats/*`-scoped pagination assertion note (operator `/operations/*` keeps offset pagination, out of public scope); and the PG integration freeze gate confirmation sentence. The existing "AI agents + GSD workflow" statement is retained.
- Confirmed (no edit) that the existing `verify` job spins up docker-compose postgres/rabbitmq/minio and runs `pnpm run verify`, whose `test:integration` step runs the real-pg suite including `src/test/integration/steamid-leak-guard.test.ts` — FREEZE-04 is satisfied by verify-and-keep.

## Task Commits

1. **Task 1: Add the oasdiff contract-diff CI job and document the bump policy** — `4bb489f` (feat)
2. **Task 2: Confirm the existing verify job is the PostgreSQL integration freeze gate (FREEZE-04, verify-and-keep)** — no separate commit. This is a confirmation-only task with no code change to the `verify` job or `package.json`; the single README confirmation sentence was authored as part of the bump-policy block and landed in commit `4bb489f`.

## Files Created/Modified

- `.github/workflows/cd.yml` — added the `contract-diff` job (sibling to `verify`/`image`); both existing jobs byte-unchanged.
- `README.md` — added the "Contract version and bump policy" subsection (semver policy, two-gate layering, `/stats/*` scope note, PG integration freeze-gate confirmation).

## Decisions Made

- **Exact-tag pin `v0.0.56`** (never floating `@v0`): the action releases ~daily; an exact immutable tag is supply-chain hygiene (threat T-19-04, ASVS V14). A future maintenance PR can bump it deliberately.
- **`fail-on: ERR` (not WARN):** a freeze gate must let additive/backward-compatible evolution pass freely; WARN-level ambiguous findings would false-positive-block legitimate additive changes (RESEARCH Pattern 2).
- **Separate required job (not an inline `verify` step):** parallelizes the lightweight diff against the heavy docker-compose `verify` job; both remain required status checks so each blocks merge.
- **FREEZE-04 verify-and-keep:** zero changes to the `verify` job YAML and `package.json` — confirmed by inspection only (locked decision; do NOT rebuild a parallel CI path).
- **No package install:** oasdiff is a CI-only GitHub Action (Go binary), not an npm package — honors the zero-new-runtime-dependency posture; the npm package-legitimacy gate is N/A.

## Deviations from Plan

None — both code tasks executed exactly as written. All verification commands pass:
- grep checks: `oasdiff/oasdiff-action/breaking@v0.0.56`, `fail-on: ERR`, `fetch-depth: 0`, `event_name == 'pull_request'`, README `bump`.
- YAML valid; `jobs` = {verify, contract-diff, image}.
- `verify` job + `package.json` byte-unchanged; `package.json` has no oasdiff dependency.
- Task 2 greps: `pnpm run verify`, `docker compose up -d postgres rabbitmq minio`, `test:integration`, README `integration`.

## REQUIRED MANUAL FOLLOW-UP (Task 3 — branch protection, maintainer action)

Task 3 is a `checkpoint:human-verify` for **GitHub repository branch-protection settings**, which live in GitHub's UI **outside this repository** and cannot be set via code, CLI, or API within this phase's scope. Per the execution directive it is **auto-acknowledged (non-blocking)** and recorded here as a required manual step for the maintainer.

The new `contract-diff` gate (and the existing `Verify` gate) only **block merges** once they are marked as **required status checks** on the protected branch. Until then the gates are advisory (they run and report, but do not enforce). To complete the freeze (threat T-19-05 mitigation):

1. Open a PR (e.g. the PR that lands this phase) so both CI jobs report status checks named **`Verify`** and **`Contract diff`**.
2. GitHub: repo -> **Settings** -> **Branches** -> branch protection rule for the default branch (**master**) -> enable **"Require status checks to pass before merging"**.
3. In the required-checks search box, add **BOTH** `Verify` **and** `Contract diff` as required checks. **Save.**
4. Confirm enforcement: open a PR with a deliberately breaking OpenAPI change (e.g. remove a public field, then `pnpm run openapi:export`); the `Contract diff` check must FAIL and the merge button must be blocked. Revert the experiment.

## Known Stubs

None — no stubs, placeholders, or hardcoded empty values introduced. The job references the live committed artifact; the README documents real, in-place gates.

## Threat Surface

No new runtime attack surface introduced (CI job + docs only). Threat-register dispositions honored: T-19-04 (exact-tag pin), T-19-05 (branch-protection follow-up documented), T-19-06 (fetch-depth:0 + PR-only guard so the base diff is real, not trivially empty).

## Next Phase Readiness

- FREEZE-03 (CI breaking-change classification) and FREEZE-04 (PG integration freeze gate, confirmed) are satisfied. Combined with 19-01 (FREEZE-01/02 + frozen-contract test), all four FREEZE requirements are code-complete.
- The only remaining action to fully enforce the freeze is the maintainer's branch-protection step above — outside repo scope, documented as a required manual follow-up.

---
*Phase: 19-contract-freeze*
*Completed: 2026-06-07*

## Self-Check: PASSED
- `.github/workflows/cd.yml` present with `contract-diff` job; `README.md` bump-policy section present.
- Task 1 commit `4bb489f` present in git history.
- `verify`/`image` jobs and `package.json` byte-unchanged (confirmed via git diff).
