---
phase: 03-ingest-promotion-and-parser-job-lifecycle
plan: 03-03
subsystem: parser-jobs
tags: [rabbitmq, parse-requests, publisher]
key-files:
  created:
    - src/infra/queue/messages.ts
    - src/modules/ingest/publisher.ts
    - src/modules/ingest/publisher.test.ts
  modified:
    - README.md
requirements-completed: [JOB-01, JOB-02]
completed: 2026-05-09
---

# Phase 03 Plan 03 Summary

Implemented parser request publishing contracts:

- Added parser queue constants for `solid_stats.parser`, `parse.requested`, `parse.completed`, and `parse.failed`.
- Mirrored the parser-owned request payload shape, including structured SHA-256 checksum objects.
- Added `ParseJobPublisher` that publishes queued/retryable jobs and records publish success or retryable publish failure state.
- Documented the Phase 3 lifecycle surfaces in README.

Verification: `pnpm run verify` passed.
