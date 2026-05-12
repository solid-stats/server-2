# Phase 10 Research: Full-Run Recalculation and Coverage Report

**Status:** complete
**Completed:** 2026-05-12

## Existing Code

- `src/modules/statistics/service/recalculation.ts` recalculates one parser result by persisting normalized events and recalculating player/squad, commander-side, and bounty aggregate families.
- `src/modules/statistics/repository/repository.ts` already has idempotent per-parser-result aggregate replacement methods:
  - `recalculatePlayerAndSquadStatsForParserResult`
  - `recalculateCommanderSideStatsForParserResult`
  - `recalculateBountyPointsForParserResult`
- These repository methods assign replay rotations from replay timestamps, return `missing_replay_timestamp` or `missing_rotation`, and replace aggregate rows for the affected rotation.
- Existing operations APIs expose health, metrics, ingest staging, parse jobs, retries, and manual reparses. They do not expose full-run statistics coverage yet.
- Package scripts already have an operations command pattern with `ops:backup:check`.

## Schema Evidence

- `ingest_staging_records.status` separates staging lifecycle states, including `pending`, `processing`, `promoted`, `conflicted`, `failed`, and `ignored`.
- `replays.status` separates replay lifecycle states including `staged`, `ready_for_parse`, `parsed`, `parse_failed`, and `archived`.
- `parse_jobs.status` separates queued/published/running/succeeded/failed/retryable job states.
- `parser_results.status` separates `current`, `superseded`, and `failed` parser output states.
- Aggregate tables have `calculated_at`, which can support freshness inference against current parser result creation time.

## Implementation Direction

1. Add a full-run service that:
   - Lists current parser result targets in deterministic order.
   - Produces a dry-run coverage report.
   - Recalculates all current targets and returns per-target outcomes.
   - Summarizes parser result count, recalculated count, skipped count, missing rotation/timestamp/identity counts, changed aggregate rows, stale count, and failures.
2. Add a PostgreSQL full-run repository/read model that:
   - Reports lifecycle counts for staging, replays, parse jobs, and parser results.
   - Reports current parser result targets with replay identifiers, timestamps, freshness, and conservative identity-gap counts.
3. Add a CLI entrypoint and package scripts:
   - `pnpm run ops:stats:coverage` for dry-run status.
   - `pnpm run ops:stats:recalculate` for full current-result recalculation.
4. Document command usage and output semantics.

## Test Direction

- Unit-test the full-run service with fake repository outcomes for recalculated, skipped, missing identity, and failed results.
- Unit-test the PostgreSQL full-run read model with scripted pool results so status counts and target mapping stay deterministic.
- Keep CLI surface thin and rely on service/repository tests for behavior; command file is typechecked/linted and documented.
- Preserve 100% V8 coverage by covering any production module imported by tests.

## Boundaries

- Do not fetch legacy data or use SSH credentials in this repo.
- Do not add Kubernetes/runtime orchestration.
- Do not change parser behavior.
- Do not commit operator host, key path, or secret values.
