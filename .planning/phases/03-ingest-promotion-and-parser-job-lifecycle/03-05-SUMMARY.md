---
phase: 03-ingest-promotion-and-parser-job-lifecycle
plan: 03-05
subsystem: operations-api
tags: [fastify, openapi, operator-visibility]
key-files:
  created:
    - src/modules/ingest/routes.ts
    - src/modules/ingest/routes.test.ts
  modified:
    - src/app.ts
    - openapi/server-2.openapi.json
    - README.md
requirements-completed: [INGEST-06]
completed: 2026-05-09
---

# Phase 03 Plan 05 Summary

Implemented read-only operator lifecycle APIs:

- Added OpenAPI-covered staging list/detail routes under `/operations/ingest-staging`.
- Added OpenAPI-covered parse job list/detail routes under `/operations/parse-jobs`.
- Added status, ID, source identity, checksum, and pagination filters.
- Wired routes into the Fastify app factory with an injectable read model for tests and future runtime composition.

Verification: `pnpm run verify` passed.
