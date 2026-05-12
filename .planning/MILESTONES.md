# Project Milestones: server-2

## v2.0 Backend Parity and Full-Run Readiness (Shipped: 2026-05-12)

**Delivered:** Backend parity evidence and full-run readiness tooling for public statistics: parser counter semantics, recalculation coverage, rotation/identity readiness, deterministic legacy export, strict diff contract, and app workflow boundary guard.

**Phases completed:** 5 phases, 10 plans, 0 tasks

**Key accomplishments:**

- Preserved parser compact player counters and used counter death evidence for public aggregate death totals while keeping kill rows for relationships, weapons, vehicles, and bounty inputs.
- Added supported PostgreSQL-backed `ops:stats:coverage` and `ops:stats:recalculate` commands for full-run freshness, stale-current-result detection, skips/failures, and idempotent aggregate backfill.
- Added `ops:stats:readiness` for rotation coverage, no-SteamID identity classification, unresolved observed names, and nickname-history conflict evidence.
- Added deterministic `legacy-public-export.v1` output for player globals, squad stats, rotation-scoped stats, relationship surfaces, weapons, weeks, metadata, and parity formulas.
- Added `old-vs-new-diff.v1` with strict parity failures, the narrow teamkill-death known-difference policy, full-corpus metadata scopes, and always-review-required semantics.
- Added `ops:boundary:check` to keep staging SSH, `kubectl`, Kubernetes Secret mutation, rollout orchestration, and kubeconfig usage out of app workflows.

**Stats:**

- 83 files changed across the milestone git range
- 23,680 TypeScript LOC currently tracked under `src/`
- 5 phases, 10 plans, 0 GSD task records
- 230 tests passed in final verification with 100% V8 coverage
- 1 calendar day from milestone start to shipped milestone

**Git range:** `abed1af docs: start milestone v2.0 Backend Parity and Full-Run Readiness` -> `7def325 docs: audit v2 milestone completion`

**Known deferred items:** 2 pre-existing GSD artifacts acknowledged at close (see `.planning/STATE.md` Deferred Items)

**What's next:** Start a fresh milestone with `$gsd-new-milestone`; adjacent app contract consumption remains follow-up work for `replays-fetcher`, `infrastructure`, `replay-parser-2`, and `web`.

---

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
