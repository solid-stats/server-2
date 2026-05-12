---
phase: 13-diff-harness-contract-and-boundary-guards
plan: 01
status: complete
completed_at: 2026-05-12
requirements:
  - DIFF-01
  - DIFF-02
  - DIFF-03
  - DIFF-04
  - DIFF-05
  - DIFF-06
  - OPS-13
---

# Plan 13-01 Summary: Diff Contract and Boundary Guard

## Delivered

- Added `old-vs-new-diff.v1` TypeScript contract in `src/modules/statistics/diff/diff-contract.ts`.
- Defined full-corpus, partial-staging, and sample corpus metadata scopes.
- Added strict failure codes for missing players, missing matches, changed public aggregate totals, parser failures, export failures, and unexplained differences.
- Kept the default known-difference policy intentionally narrow: only `deaths_by_teamkills_duplicate_slot_respawn` is accepted.
- Added `.github/workflows` boundary guard in `src/operations/check-app-boundary-guards.ts`.
- Added `pnpm run ops:boundary:check` and wired it into `pnpm run verify`.

## Validation

- `pnpm vitest run src/modules/statistics/diff/tests/diff-contract.test.ts src/operations/check-app-boundary-guards.test.ts`
- `pnpm run ops:boundary:check`
- `pnpm run format`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test:coverage`

## Result

Phase 13 now has a backend-owned diff report contract and an executable workflow guard that prevents app CI from drifting back into staging SSH, kubectl, Kubernetes secret mutation, rollout orchestration, or direct kubeconfig ownership.
