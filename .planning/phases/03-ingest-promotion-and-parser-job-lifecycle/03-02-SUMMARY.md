---
phase: 03-ingest-promotion-and-parser-job-lifecycle
plan: 03-02
subsystem: ingest
tags: [dedupe, conflicts, evidence]
key-files:
  created:
    - src/modules/ingest/service.test.ts
  modified:
    - src/modules/ingest/service.ts
    - src/modules/ingest/repository.ts
requirements-completed: [INGEST-02, INGEST-03, INGEST-06]
completed: 2026-05-09
---

# Phase 03 Plan 02 Summary

Implemented Phase 3 duplicate/conflict policy:

- Exact source identity + same bytes is treated as a duplicate promotion.
- Same checksum across different source identity attaches duplicate source evidence to canonical replay lineage.
- Same source identity with changed bytes/object key marks staging `conflicted` with both sides preserved in `conflict_details`.
- Temporary staging failure state is supported with structured details.

Verification: `pnpm run verify` passed.
