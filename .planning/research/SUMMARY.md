# Project Research Summary

**Project:** server-2
**Domain:** Replay statistics backend and moderation API
**Researched:** 2026-05-09
**Confidence:** HIGH

## Executive Summary

`server-2` should be built as a modular TypeScript Fastify service with PostgreSQL as the authoritative state store, RabbitMQ as the parser/background delivery mechanism, and S3-compatible storage for replay files and attachments. The core risk is not raw API CRUD complexity; it is preserving trust across replay ingestion, parser jobs, canonical identity, aggregate recalculation, and audited corrections.

The recommended approach is to make lifecycle state explicit early: migrations, route schemas/OpenAPI, ingest staging, parse jobs, identity history, moderation audit, and aggregate recalculation should be first-class from the beginning. Public APIs can then be built on persisted aggregates instead of ad hoc raw-event queries.

The roadmap should avoid a purely horizontal "database first, API later" project shape, but the first phases still need foundation and schema because every later capability depends on them. Each phase should deliver a verifiable backend capability with API/schema/tests, not only tables.

## Key Findings

### Recommended Stack

Use Node.js 24 LTS, TypeScript 5.x, Fastify 5.x, PostgreSQL 18.x target, RabbitMQ 4.x, S3-compatible storage, Docker Compose, and OpenAPI 3.x. `@fastify/swagger`, `openapi-typescript`, `pg`, a type-safe SQL/query-builder layer, a RabbitMQ client, AWS SDK v3 S3 client, `prom-client`, and structured Pino logging are the expected supporting pieces.

**Core technologies:**
- Node.js: runtime - active LTS line for production.
- Fastify: HTTP framework - schema-first route validation and OpenAPI generation.
- PostgreSQL: source of truth - relational integrity for identity, jobs, stats, requests, and audit.
- RabbitMQ: async work - durable parser/background job delivery.
- S3-compatible storage: object data - replay files and request attachments.
- OpenAPI: frontend contract - generated TypeScript types for `web`.

### Expected Features

**Must have (table stakes):**
- Public stats endpoints for overview, players, squads, rotations, commander stats, bounty stats, and leaderboards.
- Replay ingest staging promotion, duplicate/conflict handling, and canonical replay creation.
- Durable parse job lifecycle with RabbitMQ publish/consume, completion/failure, retry, and manual reparse.
- Canonical player identity, nickname history, SteamID history, squads, squad membership history, and rotations.
- Parser result persistence and aggregate recalculation.
- Steam login, bootstrap admin, role enforcement, and role management APIs.
- Correction/identity requests with attachments, moderation decisions, audit, and recalculation.
- OpenAPI schema suitable for `web` `openapi-typescript` generation.
- Health checks, metrics, failed job visibility, and backup/restore documentation.

**Should have (competitive):**
- Commander-side stats with unknown/manual legacy winner handling.
- Bounty points by rotation using previous-rotation effectiveness.
- Duplicate conflict visibility for operators.
- Audited correction patches that preserve trust.
- Cross-app compatibility discipline for parser, ingest, and API contracts.

**Defer (v2+):**
- Annual/yearly nomination statistics.
- Full historical production import from `~/sg_stats`.
- Versioned parse result history.
- Additional replay formats.
- Kubernetes production deployment.

### Architecture Approach

Use a modular backend with route modules separated from domain services and infrastructure adapters. Keep PostgreSQL lifecycle tables authoritative, use RabbitMQ only for delivery, store object keys rather than file blobs in the DB, generate OpenAPI from route schemas, and make moderation/identity changes audit-first.

**Major components:**
1. API server - Fastify routes, validation, auth hooks, and schema export.
2. Database module - migrations, pool, transactions, repositories.
3. Queue/storage adapters - RabbitMQ and S3-compatible integration.
4. Ingest/parse services - staging promotion, dedupe/conflicts, parse job lifecycle.
5. Identity/stats services - canonical players, histories, rotations, aggregates, bounty.
6. Requests/moderation services - request lifecycle, attachments, decisions, audit, recalculation.
7. Operations services - health, metrics, failures, retries, reparses, backups.

### Critical Pitfalls

1. **Trusting weak identity signals** - preserve evidence/history and require moderation for ambiguous merge/split/linking.
2. **Losing parser jobs between DB and RabbitMQ** - create durable job state before publish and make consumers idempotent.
3. **Aggregate drift after moderation** - approved corrections must write audit/patch records and trigger recalculation.
4. **OpenAPI drift** - generate schema from route schemas and verify route coverage.
5. **Silent replay duplicate handling** - preserve source evidence and route ambiguous duplicates to conflict review.
6. **Treating operations as post-launch work** - failed job visibility and health/metrics must ship with the job lifecycle.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: API Foundation and Infrastructure
**Rationale:** Every later capability depends on a typed service skeleton, config, dependency wiring, migrations, health, and OpenAPI export.
**Delivers:** Fastify app, Docker Compose dependencies, config, DB/queue/storage clients, migration/test harness, health/metrics baseline, OpenAPI generation.
**Addresses:** Stack setup, API contract discipline, operations hooks.
**Avoids:** OpenAPI drift and late infrastructure churn.

### Phase 2: Core Domain Schema and Identity Model
**Rationale:** Ingest, parser results, stats, and moderation all depend on canonical identity, rotations, replays, and audit-capable schema.
**Delivers:** Migrations and repository/service foundations for users/roles, canonical players, nicknames, SteamIDs, squads, memberships, rotations, replays, requests, audit, and core status enums.
**Addresses:** Identity trust, schema integrity, future recalculation.
**Avoids:** Weak identity merges and lifecycle ambiguity.

### Phase 3: Ingest Promotion and Parse Job Lifecycle
**Rationale:** Replay data must enter the system through a durable, observable path before stats can be trusted.
**Delivers:** Staging polling/promotion, duplicate conflict states, parse job creation, RabbitMQ parse requests, completion/failure handling, retry/manual reparse primitives.
**Addresses:** Parser integration, ingest conflicts, job durability.
**Avoids:** Lost jobs and silent duplicate corruption.

### Phase 4: Parser Result Persistence and Aggregate Engine
**Rationale:** Public APIs need persisted normalized data and deterministic aggregates.
**Delivers:** Parser result storage, normalized events, rotation assignment, player/squad/commander/bounty calculations, formula docs/tests, recalculation flow.
**Addresses:** Raw + aggregate persistence, commander and bounty stats.
**Avoids:** Slow raw-event public queries and aggregate drift.

### Phase 5: Public Stats API and OpenAPI Contract
**Rationale:** Once aggregates exist, expose stable anonymous APIs for `web`.
**Delivers:** Overview, player, squad, rotation, commander, bounty, and leaderboard endpoints with pagination/search where needed and OpenAPI coverage.
**Addresses:** Public product value.
**Avoids:** Frontend DTO drift.

### Phase 6: Auth, Roles, Requests, and Moderation
**Rationale:** Correction workflows need login, roles, attachments, moderation decisions, audit, and recalculation.
**Delivers:** Steam login/session, bootstrap admin, role management, request submission/status, S3 attachments, moderator queues/actions, approved correction patches, identity merge/split support where needed.
**Addresses:** Community correction and trust loop.
**Avoids:** Unscoped admin actions and unaudited manual fixes.

### Phase 7: Operations, Backups, and Production Readiness
**Rationale:** The platform is only trustworthy if failures are visible and recoverable.
**Delivers:** Health checks for API/DB/RabbitMQ/S3/parser integration, metrics, structured failure logs, failed job views, retry/reparse API hardening, Docker Compose production config, backup/restore docs.
**Addresses:** Operational visibility and recoverability.
**Avoids:** Unknown missing stats and untested backup paths.

### Phase Ordering Rationale

- Foundation comes first because OpenAPI, config, migrations, and integration clients are shared across all phases.
- Schema/identity comes before ingest and stats because canonical assignment shapes every aggregate.
- Ingest/parse comes before public stats because public APIs should expose persisted, trusted data.
- Requests/moderation can follow public stats because approved corrections need the aggregate recalculation path.
- Operations is last as a hardening phase but its hooks start in Phase 1 and Phase 3.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Exact DB access/migration tool, OpenAPI generation setup, metrics stack shape.
- **Phase 3:** Exact `replays-fetcher` staging schema/status enum and RabbitMQ parser contract.
- **Phase 4:** Exact bounty formula and parser result normalized event shape.
- **Phase 6:** Exact Steam login protocol/callback behavior and identity-linking moderation rules.
- **Phase 7:** Exact backup/restore commands for chosen S3-compatible provider and production Compose topology.

Phases with standard patterns:
- **Phase 2:** Relational schema/migration patterns are standard, but domain rules need careful modeling.
- **Phase 5:** Fastify route/schema/OpenAPI patterns are standard once aggregates exist.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack is specified by the brief and current major versions were checked against official/project sources. |
| Features | HIGH | v1 scope is explicit in the project brief. |
| Architecture | HIGH | Component boundaries follow the product responsibilities and integration contracts. |
| Pitfalls | HIGH | Risks are directly implied by identity history, parse jobs, moderation, and cross-app contracts. |

**Overall confidence:** HIGH

### Gaps to Address

- Exact S3-compatible provider: decide local MinIO plus production provider in Phase 1/7.
- Exact DB access/migration library: choose during Phase 1 after weighing explicit SQL, migrations, and test ergonomics.
- Exact ingest staging schema/status enum: coordinate with `replays-fetcher` before Phase 3 implementation.
- Exact parser contract/result shape: coordinate with `replay-parser-2` before Phase 3/4 implementation.
- Exact Steam auth protocol: verify during Phase 6; do not assume generic OAuth behavior.
- Exact bounty formula: define and test during Phase 4.
- Exact OpenAPI export/generation command: define in Phase 1 and keep compatible with `web`.

## Sources

### Primary (HIGH confidence)

- `gsd-briefs/server-2.md` - product scope, responsibilities, data model, integrations, and suggested requirements.
- `.planning/PROJECT.md` - synthesized project context.
- https://nodejs.org/en/about/releases/ - Node.js production/LTS guidance.
- https://github.com/nodejs/release - Node.js release schedule.
- https://github.com/fastify/fastify - Fastify v5 current project state.
- https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/ - Fastify v5 requirements.
- https://github.com/fastify/fastify-swagger - Fastify OpenAPI plugin compatibility.
- https://www.postgresql.org/ - PostgreSQL current release information.
- https://www.rabbitmq.com/release-information - RabbitMQ release/support information.
- https://github.com/openapi-ts - OpenAPI TypeScript tooling.

### Secondary (MEDIUM confidence)

- Inference from common backend operations patterns for job lifecycle, object storage, and aggregate recalculation.

---
*Research completed: 2026-05-09*
*Ready for roadmap: yes*
