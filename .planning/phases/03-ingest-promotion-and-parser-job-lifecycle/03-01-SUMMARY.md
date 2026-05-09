---
phase: 03-ingest-promotion-and-parser-job-lifecycle
plan: 03-01
subsystem: ingest
tags: [postgresql, promotion, parse-jobs]
key-files:
  created:
    - src/modules/ingest/types.ts
    - src/modules/ingest/repository.ts
    - src/modules/ingest/service.ts
    - src/modules/ingest/service.test.ts
    - src/test/integration/ingest-repository.test.ts
    - src/infra/db/migrations/0002_ingest_processing_status.sql
  modified:
    - src/infra/db/client.ts
    - src/test/integration/schema.test.ts
requirements-completed: [INGEST-01, INGEST-04, INGEST-05, JOB-01]
completed: 2026-05-09
---

# Phase 03 Plan 01 Summary

Implemented DB-backed staging claim and promotion foundations:

- Added `processing` ingest status for safe worker claims.
- Added `PgIngestRepository` transaction helpers and SQL for staging, replay, parse job, and parser result lifecycle state.
- Added `IngestPromotionService` for pending staging promotion into canonical replay plus queued parse job state.
- Added integration coverage for promotion transaction behavior and schema coverage for the new claim status.

Verification: `pnpm run verify` passed.
