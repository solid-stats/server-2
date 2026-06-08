# Project Milestones: server-2

## v3.0 Public API v1 (Shipped: 2026-06-08)

**Phases completed:** 8 phases, 23 plans, 25 tasks

**Key accomplishments:**

- 1. [Rule 3 - Blocking] `buildKeysetPredicate` exceeded `max-params` (5 > 3)
- 1. [Rule 1 - Bug] ESLint forbids direct callback reference to `.map(maskSteamId)`
- 1. [Rule 1 - Bug] Keyset placeholder type-cast for non-numeric sort keys
- 1. [Rule 3 - Blocking] skills-lock.json не очищался CLI-командой remove — потребовалась ручная правка lock
- 1. [Rule 1 - Lint] Re-export style for parity formulas
- 1. [Rule 3 - Blocking] Wrong parent-directory import path (`../../statistics/`)
- Task 3 (coverage run after implementing squad routes)
- 1. [Rule 1 - Bug] Test expectations for between/adjacent/overlap cases included leading and trailing gaps
- `src/infra/db/migrations/0006_slug_addressing.sql`
- PgPublicStatsReadModel extended with boolean-flag slug-or-uuid resolver, three temporal history read methods with withGaps, and maxTimestamp provenance at the mapper boundary across all singular stat responses.
- Wired all public-stats detail and sub-resource routes to `SlugOrUuidParameters`, added `GET /stats/rotations/:id` detail route, and registered three history sub-resource endpoints (`name-history`, player `membership-history`, squad `membership-history`) with TypeBox response schemas and existing 404 NotFound path.
- Task 1 — Integration tests (postgres.test.ts + new route unit tests)
- 1. [Rule 1 - Bug] castType: "text" fails for timestamp columns
- 1. [Rule 1 - Bug] ReplayEventsQuery needs its own order default ("asc" not "desc")
- 1. [Rule 2 - Missing Critical Functionality] sitemap-routes.test.ts inject tests added for coverage
- Bounty and leaderboard responses now carry an additive breakdown aggregate (countedKills, summed victim/squad effectiveness, baseScore) derived from the stored bounty_points.inputs jsonb at the mapBounty boundary, with defensive null handling for legacy rows.
- `GET /stats/commander-sides` now accepts an optional `?side=<value>` filter that AND-composes with the existing `?rotationId`, built as a parameter-bound `commander.side = $n::text` predicate via the `rotationWhere.sqlWith` combinator; the explicit `unknownOutcomes` exposure was verified (not duplicated) and the ordering / no-pagination pattern is unchanged.
- Transactional, Pool-injected `PgAdminRotationRepository` that creates/updates/deletes rotations with a server-derived `slug_base()` slug, maps pg constraint violations (23505/23514) to typed signals, and refuses to delete non-empty rotations via a same-transaction dependency pre-check.
- Three admin-only `/admin/rotations` routes (POST 201 / PUT 200 / DELETE 204) guarded by `requireRole(options.auth, "admin")`, translating the 18-03 repository's discriminated signals to HTTP status codes, wired into `buildApp` (in-memory default) and `server.ts` (Pool-backed `PgAdminRotationRepository`), and published in the OpenAPI contract under `tags: ["admin"]`.
- Froze the legacy_winner_fix moderator workflow (role guard, jsonb outcome flip, downstream recalc, audit row) with passing integration tests and extended the Steam64 leak-guard to sweep every write-route body added this phase — winner-fix workflow + /admin/rotations POST/PUT/DELETE — with zero source changes to the frozen workflow files.
- A separate exact-tag-pinned oasdiff `contract-diff` CI job now classifies OpenAPI diffs (additive pass, ERR breaking fail) on top of the existing byte-equality drift gate, the README documents the semver bump policy and two-gate layering, and the existing Verify job is confirmed (unchanged) as the PostgreSQL integration freeze gate.

---

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
