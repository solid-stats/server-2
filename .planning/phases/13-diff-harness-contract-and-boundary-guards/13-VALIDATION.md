---
phase: "13"
slug: diff-harness-contract-and-boundary-guards
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-12
---

# Phase 13 Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run src/modules/statistics/diff/tests/diff-contract.test.ts src/operations/check-app-boundary-guards.test.ts` |
| Full suite command | `pnpm run verify` |
| Estimated runtime | ~35 seconds |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 13-01-01 | 13-01 | 1 | DIFF-01 | Define the new-stat export side consumed by old-vs-new diff tooling. | unit | `pnpm vitest run src/modules/statistics/diff/tests/diff-contract.test.ts` | yes | green |
| 13-01-02 | 13-01 | 1 | DIFF-02 | Define strict parity failure codes for missing players, missing matches, changed public aggregate totals, parser/export failures, and unexplained differences. | unit | `pnpm vitest run src/modules/statistics/diff/tests/diff-contract.test.ts` | yes | green |
| 13-01-03 | 13-01 | 1 | DIFF-03 | Keep the default known-difference policy limited to documented teamkill-death duplicate-slot/respawn cases. | unit | `pnpm vitest run src/modules/statistics/diff/tests/diff-contract.test.ts` | yes | green |
| 13-01-04 | 13-01 | 1 | DIFF-04 | Include old/new metadata, snapshot metadata, summary counts, strict failures, known differences, and `review_required`. | unit | `pnpm vitest run src/modules/statistics/diff/tests/diff-contract.test.ts` | yes | green |
| 13-01-05 | 13-01 | 1 | DIFF-05 | Support sample, partial-staging, and full-corpus comparison metadata. | unit | `pnpm vitest run src/modules/statistics/diff/tests/diff-contract.test.ts` | yes | green |
| 13-02-01 | 13-02 | 2 | DIFF-06 | Document that broadening the allowlist requires explicit human planning decision. | docs check | `rg -n "Broadening the known-difference allowlist requires" docs/diff-harness-contract.md` | yes | green |
| 13-01-06 | 13-01 | 1 | OPS-13 | Prevent app workflows from reintroducing staging SSH, `kubectl`, Kubernetes Secret mutation, rollout orchestration, or kubeconfig usage. | unit/operation | `pnpm vitest run src/operations/check-app-boundary-guards.test.ts && pnpm run ops:boundary:check` | yes | green |

## Wave 0 Requirements

Existing Vitest, operation-entrypoint, and documentation-check infrastructure covered all Phase 13 requirements.

## Manual-Only Verifications

All Phase 13 requirements have automated or documentation verification.

## Validation Sign-Off

- All tasks have automated verification.
- Sampling continuity preserved through focused Vitest runs and full `pnpm run verify`.
- No watch-mode flags used.
- `pnpm run verify` passed.
- Approval: approved 2026-05-12.
