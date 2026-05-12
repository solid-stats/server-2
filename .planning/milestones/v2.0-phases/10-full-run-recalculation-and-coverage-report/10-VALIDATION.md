---
phase: "10"
slug: full-run-recalculation-and-coverage-report
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-12
---

# Phase 10 Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run src/operations/recalculate-statistics.test.ts src/modules/statistics/service/tests/full-run-recalculation.test.ts src/modules/statistics/repository/tests/full-run.test.ts` |
| Full suite command | `pnpm run verify` |
| Estimated runtime | ~35 seconds |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 10-01-01 | 10-01 | 1 | OPS-07 | Run idempotent coverage and recalculation operations for current parser results. | unit/integration | `pnpm vitest run src/operations/recalculate-statistics.test.ts src/modules/statistics/service/tests/full-run-recalculation.test.ts` | yes | green |
| 10-01-02 | 10-01 | 1 | OPS-08 | Report parser result count, recalculated/skipped counts, missing input counts, changed rows, and failures. | unit | `pnpm vitest run src/modules/statistics/service/tests/full-run-recalculation.test.ts` | yes | green |
| 10-01-03 | 10-01 | 1 | OPS-09 | Distinguish staged, promoted, parsed, current, recalculated, skipped, and stale states. | repository | `pnpm vitest run src/modules/statistics/repository/tests/full-run.test.ts` | yes | green |
| 10-01-04 | 10-01 | 1 | OPS-10 | Include replay identifiers, reason codes, and retry context for skips/failures. | unit | `pnpm vitest run src/modules/statistics/service/tests/full-run-recalculation.test.ts` | yes | green |
| 10-01-05 | 10-01 | 1 | OPS-11 | Produce deterministic report output for sample, partial staging, and future full corpus labels. | unit | `pnpm vitest run src/operations/recalculate-statistics.test.ts` | yes | green |
| 10-02-01 | 10-02 | 2 | OPS-12 | Document supported operator-readable full-run status outside one-off SQL. | docs check | `pnpm run verify` | yes | green |

## Wave 0 Requirements

Existing Vitest and PostgreSQL repository test infrastructure covered all Phase 10 requirements.

## Manual-Only Verifications

All Phase 10 requirements have automated or documentation verification.

## Validation Sign-Off

- All tasks have automated verification.
- Sampling continuity preserved through focused Vitest runs and full `pnpm run verify`.
- No watch-mode flags used.
- `pnpm run verify` passed.
- Approval: approved 2026-05-12.
