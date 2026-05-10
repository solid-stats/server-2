# Project Milestones: server-2

## v1.0 MVP (Shipped: 2026-05-10)

**Delivered:** A production-ready TypeScript/Fastify backend source of truth for Solid Stats with PostgreSQL persistence, replay ingest promotion, parser job orchestration, aggregate statistics, Steam auth, moderation workflows, operations visibility, and Docker Compose deployment.

**Phases completed:** 1-8 and 08.1 (9 phases, 39 plans total)

**Key accomplishments:**

- Built strict TypeScript/Fastify runtime infrastructure with typed config, structured logging, health checks, metrics, Swagger UI, and generated OpenAPI artifacts.
- Established PostgreSQL schema and repositories for canonical identity, squads, rotations, replays, ingest staging, parse jobs, parser results, aggregates, requests, attachments, moderation, and audit patches.
- Implemented durable replay promotion, duplicate conflict handling, RabbitMQ parser job publishing, parser completion/failure handling, retry/reparse operations, and job history.
- Persisted parser artifacts from S3-compatible storage, normalized parser events, and calculated player, squad, commander-side, and bounty aggregates by rotation.
- Exposed anonymous public stats APIs and protected authenticated request, moderation, role management, ingest, and operations workflows.
- Closed the final v1 runtime integration gaps found by milestone audit, including PostgreSQL-backed production stores, recalculation wiring, workflow mutation appliers, and restored verification artifacts.

**Stats:**

- 305 files changed across the milestone git range
- 17,958 TypeScript LOC currently tracked outside dependencies
- 9 phases, 39 plans, 0 GSD task records
- 190 tests passed in final audit verification with 100% V8 coverage
- 16 calendar days from first repository commit to shipped milestone

**Git range:** `3c431f9 Init` -> `0372295 fix v1 milestone moderation gaps`

**Known deferred items:** 0

**What's next:** Start a fresh milestone with `$gsd-new-milestone`; adjacent app contract consumption remains follow-up work for `web`, `replays-fetcher`, and `replay-parser-2`.

---
