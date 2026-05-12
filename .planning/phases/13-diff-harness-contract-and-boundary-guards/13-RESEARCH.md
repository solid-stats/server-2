# Phase 13 Research: Diff Harness Contract and Boundary Guards

**Status:** complete
**Completed:** 2026-05-12

## Existing Code and Artifacts

- Phase 12 added `legacy-public-export.v1` and `pnpm run ops:stats:legacy-export`.
- `docs/legacy-public-export.md` documents deterministic new-stat export metadata and field formulas.
- `.github/workflows/cd.yml` currently runs verification, builds the image, and pushes it to GHCR. It does not run staging SSH, `kubectl`, Secret mutation, or rollout commands.
- `docs/k3s-staging.md` still documents infrastructure/staging operations. That is acceptable as documentation, but app workflows must not execute those commands.
- `.planning/research/v2-full-run-findings.md` explicitly calls out the need for a CI guard against app-workflow orchestration drift.

## Implementation Direction

1. Add `src/modules/statistics/diff/diff-contract.ts`:
   - `old-vs-new-diff.v1` contract version.
   - strict failure code constants.
   - single default known difference code for `deaths.byTeamkills` duplicate-slot/respawn cases.
   - report builder that always sets `reviewRequired: true`.
   - helper that rejects broadening the known-difference allowlist by default.
2. Add `src/operations/check-app-boundary-guards.ts`:
   - Scan `.github/workflows/**/*.{yml,yaml}`.
   - Fail on staging SSH/SCP/rsync, `kubectl`, Kubernetes Secret mutation, rollout orchestration, or direct Kubernetes config/env execution patterns.
   - Print actionable findings and return non-zero when violations exist.
3. Add `pnpm run ops:boundary:check` and include it in `pnpm run verify`.
4. Document the diff report contract, strict failures, known difference policy, corpus scopes, review requirement, and app/infrastructure boundary.

## Test Direction

- Unit-test diff contract report construction with sample, partial-staging, and full-corpus metadata.
- Unit-test strict failure and known-difference constants.
- Unit-test boundary guard success and failure cases with temporary workflow directories.
- Preserve 100% V8 coverage.

## Boundaries

- Do not implement legacy SSH/SCP snapshot capture.
- Do not run `kubectl` from app workflows.
- Do not mutate Kubernetes Secrets from app workflows.
- Do not add deployment rollout orchestration to `server-2`.
- Do not make diff reports automatic production cutover approval.
