# Plan 10-01 Summary: Full-Run Recalculation Command

**Status:** complete
**Completed:** 2026-05-12
**Requirements:** OPS-07, OPS-08, OPS-09, OPS-10, OPS-11

## Delivered

- Added `FullRunRecalculationService` for dry-run coverage reports and full current-parser-result recalculation.
- Added `PgFullRunStatisticsRepository` for lifecycle status counts and deterministic current parser result targets.
- Added `src/operations/recalculate-statistics.ts` plus package scripts:
  - `pnpm run ops:stats:coverage`
  - `pnpm run ops:stats:recalculate`
- Reports include parser result count, recalculated/skipped/failure counts, missing rotation/timestamp/identity counts, changed aggregate rows, stale count, lifecycle counts, and per-result evidence.
- Added focused service and repository tests for deterministic summaries, skip/failure outcomes, lifecycle counts, stale mapping, and conservative identity gaps.

## Verification

- `pnpm vitest run src/operations/recalculate-statistics.test.ts src/modules/statistics/service/tests/full-run-recalculation.test.ts src/modules/statistics/repository/tests/full-run.test.ts` passed.
- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm run format` passed.
- `pnpm run test:coverage` passed with 100% statements, branches, functions, and lines.

## Notes

- The active shell still emits the known Node engine warning because it uses Node v22.22.2 while the repo targets Node >=25 <26.
- Phase 10 identity-gap reporting is conservative; Phase 11 owns deeper rotation and no-SteamID readiness rules.
