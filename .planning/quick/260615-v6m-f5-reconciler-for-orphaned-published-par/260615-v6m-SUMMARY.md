---
phase: quick-260615-v6m
plan: 01
subsystem: ingest
status: complete
tags: [reconciler, parse-jobs, ingest, self-healing, F5]
requires:
  - parse_jobs lifecycle + parse_job_history audit (migration 0003)
  - ParseJobPublisher / IntervalTask ingest runtime
provides:
  - reclaimStalePublishedJobs repository method
  - ParseJobReconciler class
  - parse-job-reconciler IntervalTask
  - config.ingest.staleAfterMs / reconcileBatchSize
affects:
  - src/modules/ingest
  - src/config/env.ts
  - src/server.ts
tech-stack:
  added: []
  patterns:
    - "FOR UPDATE SKIP LOCKED claim CTE re-queue in one withTransaction round-trip"
    - "narrow repository contract + noop observer/logger defaults (mirrors ParseJobPublisher)"
key-files:
  created:
    - src/infra/db/migrations/0012_parse_job_history_reconciled_action.sql
    - src/modules/ingest/reconciler.ts
    - src/modules/ingest/reconciler.test.ts
  modified:
    - src/modules/ingest/types.ts
    - src/modules/ingest/repository/repository.ts
    - src/modules/ingest/runtime.ts
    - src/modules/ingest/runtime.test.ts
    - src/config/env.ts
    - src/server.ts
    - src/test/app.test.ts
    - src/modules/ingest/repository/tests/postgres.test.ts
    - src/infra/queue/rabbitmq.test.ts
    - src/infra/storage/client.test.ts
decisions:
  - "noopLogger.error is a contract stub never invoked by reconcileStale (failures propagate to the IntervalTask wrapper); covered with a narrow v8-ignore rather than a fabricated error path."
metrics:
  tasks: 3
  files: 13
  completed: "2026-06-15"
---

# Phase quick-260615-v6m Plan 01: F5 Reconciler for Orphaned Published Parse Jobs Summary

A self-healing reconcile loop that re-queues `parse_jobs` stuck in `status=published` (parser ack lost) so the existing publisher re-publishes them, closing F5 (orphaned jobs accumulating indefinitely because `listPublishableJobs` only selects `queued`/`retryable`).

## What Was Built

- **Task 1 — data layer:** migration `0012` adds a `reconciled` value to the `parse_job_history_action` enum; `ParseJobHistoryAction` union extended; `reclaimStalePublishedJobs(staleAfterMs, batchSize)` re-queues stale `published` rows via a `FOR UPDATE SKIP LOCKED` claim CTE in one `withTransaction` round-trip (resetting `published_at`/`started_at`/`finished_at`/`error`), and writes a `reconciled` history row (`status_from=published`, `status_to=queued`, `stale_after_ms` detail) per reclaimed job. Threshold compared via parameterized `($1 * interval '1 millisecond')`.
- **Task 2 (TDD) — `ParseJobReconciler`:** mirrors `ParseJobPublisher` exactly — narrow `ParseJobReconcilerRepository` contract, options/observer/logger interfaces, module-level `noopObserver`/`noopLogger` defaults, and a single `reconcileStale` method that calls the repository, then per job notifies `observer.jobReconciled` and logs `parse job reconciled` bindings, returning the reclaimed array. No try/catch — failures propagate to the `IntervalTask` wrapper. Factory-injection unit test covers populated / empty / noop-default paths.
- **Task 3 — wiring:** two new envalid vars (`PARSE_JOB_STALE_AFTER_MS` default `3_600_000`, `PARSE_JOB_RECONCILE_BATCH_SIZE` default `25`) surfaced on `config.ingest`; `createIngestRuntime` constructs the reconciler and runs a third `parse-job-reconciler` `IntervalTask` (reusing `pollIntervalMs`), started/closed with the promotion/publish tasks; `server.ts` passes both fields through. Real-pg integration proves stale `published`→`queued` re-queue + `reconciled` history, fresh-published/queued untouched, and idempotent second pass.

## Verification

`pnpm verify` green end-to-end: format + lint + typecheck + unit tests + real-pg integration + openapi + ops checks + **100% reachable-source coverage** (3339/3339 stmts, 1564/1564 branches, 1064/1064 funcs, 3285/3285 lines), 854 tests passing. OpenAPI contract unchanged (no route/schema change).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two extra inline `AppConfig['ingest']` fixtures needed the new fields**
- **Found during:** Task 3 typecheck.
- **Issue:** `src/infra/queue/rabbitmq.test.ts` and `src/infra/storage/client.test.ts` build inline `ingest` config objects (beyond the plan-listed `app.test.ts`); adding the two interface fields broke their typecheck.
- **Fix:** Added `reconcileBatchSize: 25` and `staleAfterMs: 3_600_000` to both fixtures.
- **Commit:** f4e0c1b

**2. [Rule 1 - Coverage gate] `noopLogger.error` unreachable**
- **Found during:** Task 3 coverage gate.
- **Issue:** Unlike the publisher (whose `logger.error` is reached on a publish-failure path), `reconcileStale` never logs errors, leaving the noop `error` stub body uncovered.
- **Fix:** Narrow `/* v8 ignore next 3 -- @preserve */` on the noop error body with a justification, per the tests-skill sanctioned suppression. The `error` member is retained to satisfy the `IntervalTaskLogger` contract passed in at runtime.
- **Commit:** efeb9d7

## Known Stubs

None. The reconciler is fully wired end-to-end (config → runtime → repository → DB) and proven by the real-pg integration test.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries; the only new surface is operator-controlled config and an internal background loop already covered by the plan's threat register.

## Self-Check: PASSED

- Files exist: `0012_parse_job_history_reconciled_action.sql`, `reconciler.ts`, `reconciler.test.ts` — FOUND.
- Commits exist: `2891abd` (Task 1), `efeb9d7` (Task 2), `f4e0c1b` (Task 3) — FOUND.
- `pnpm verify` green with 100% reachable-source coverage.
