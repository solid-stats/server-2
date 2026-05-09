# Roadmap: server-2

## Overview

Build `server-2` from an empty repository into the backend source of truth for Solid Stats. The path starts with typed Fastify infrastructure and schema foundations, then establishes replay ingest and parser job reliability, persists parser output and aggregates, exposes public statistics, adds authenticated moderation workflows, and finishes with operations hardening for a single-VPS Docker Compose v1 deployment.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: API Foundation and Runtime Infrastructure** - Typed Fastify service, dependency adapters, Docker Compose, and OpenAPI baseline. (completed 2026-05-09)
- [x] **Phase 2: Domain Schema and Identity Foundation** - Core PostgreSQL schema for users, roles, identity, squads, rotations, replays, requests, and audit. (completed 2026-05-09)
- [x] **Phase 3: Ingest Promotion and Parser Job Lifecycle** - Staging promotion, duplicate conflicts, durable parse jobs, RabbitMQ messages, and idempotent result state. (completed 2026-05-09)
- [ ] **Phase 4: Parser Results and Aggregate Statistics** - Normalized parser persistence, recalculation, player/squad/commander/bounty aggregates, and formula tests.
- [ ] **Phase 5: Public Statistics API** - Anonymous stats endpoints for overview, players, squads, rotations, commander stats, bounty stats, and leaderboards.
- [ ] **Phase 6: Authentication and Role Management** - Steam sign-in, sessions, bootstrap admin, role APIs, and authorization enforcement.
- [ ] **Phase 7: Requests, Moderation, and Audited Corrections** - Player correction/identity requests, attachments, moderator decisions, audit patches, and manual legacy winner fixes.
- [ ] **Phase 8: Operations and Production Readiness** - Production Compose, health, metrics, failure visibility, retry/reparse hardening, OpenAPI drift checks, and backup/restore docs.

## Phase Details

### Phase 1: API Foundation and Runtime Infrastructure
**Goal**: A typed Fastify service can start locally, connect to required infrastructure, emit structured logs, and publish an initial OpenAPI schema usable by `web`.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: [INFRA-01, INFRA-02, INFRA-03, API-01, API-02]
**Success Criteria** (what must be TRUE):
  1. Server starts with typed configuration, structured logging, and a Fastify app factory.
  2. Local Docker Compose starts PostgreSQL, RabbitMQ, and S3-compatible storage for development.
  3. Health-checkable DB, queue, and storage adapters can connect from the API process.
  4. An OpenAPI 3.x schema endpoint or artifact exists and can be consumed by `openapi-typescript`.
**Plans**: 4/4 plans complete

Plans:
- [x] 01-01: Project scaffold, TypeScript tooling, Fastify app factory, and test harness.
- [x] 01-02: Typed configuration, structured logging, and runtime process entry points.
- [x] 01-03: PostgreSQL, RabbitMQ, and S3-compatible adapters with local Docker Compose.
- [x] 01-04: Health baseline and OpenAPI schema generation/export.

### Phase 2: Domain Schema and Identity Foundation
**Goal**: PostgreSQL migrations establish the canonical domain model needed by ingest, parser results, stats, requests, roles, and audit.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06]
**Success Criteria** (what must be TRUE):
  1. Migrations create all core lifecycle tables and status enums required by v1.
  2. Canonical players support nickname and SteamID history without destructive overwrites.
  3. Squads, memberships, rotations, and replay promotion evidence are represented with timestamp-aware history.
  4. Moderation audit records can link decisions, comments, patches, and affected entities.
**Plans**: 4/4 plans complete

Plans:
- [x] 02-01: Migration framework and lifecycle/status enum conventions.
- [x] 02-02: Users, roles, canonical players, nicknames, SteamIDs, squads, and memberships schema.
- [x] 02-03: Rotations, replays, ingest staging, parse jobs, parser results, events, and aggregate tables.
- [x] 02-04: Requests, attachments, moderation actions, audit patch schema, repositories, and schema tests.

### Phase 3: Ingest Promotion and Parser Job Lifecycle
**Goal**: Replay candidates can be promoted from `replays-fetcher` staging into canonical replays and durable parser jobs with duplicate conflict handling and idempotent parser result state.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: [INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05, INGEST-06, JOB-01, JOB-02, JOB-03, JOB-04, JOB-07]
**Success Criteria** (what must be TRUE):
  1. Server can poll pending ingest staging/outbox records and preserve source evidence.
  2. Accepted records become canonical `replays` and durable `parse_jobs` records in one reliable lifecycle.
  3. Ambiguous duplicate candidates enter conflict review state instead of being silently merged or skipped.
  4. RabbitMQ parse requests include the required parser contract fields.
  5. Parser completion and failure result handling records terminal state idempotently.
**Plans**: 5/5 plans complete

Plans:
- [x] 03-01: Staging polling, status transitions, and promotion transaction boundaries.
- [x] 03-02: Checksum/source deduplication and duplicate conflict state.
- [x] 03-03: Parse job creation and RabbitMQ parse request publishing.
- [x] 03-04: Parser completion/failure consumers with idempotent state handling.
- [x] 03-05: Ingest and parse lifecycle admin/operator status APIs.

### Phase 4: Parser Results and Aggregate Statistics
**Goal**: Current parser output is persisted in normalized form and used to calculate rotation-aware player, squad, commander-side, and bounty aggregates.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: [STAT-01, STAT-02, STAT-03, STAT-04, STAT-06, STAT-07, STAT-08, STAT-09]
**Success Criteria** (what must be TRUE):
  1. Parser output required for audit and recalculation is stored as raw snapshot plus normalized records.
  2. Player and squad aggregates are calculated by rotation from normalized parser data.
  3. Commander-side stats represent known wins/losses and unknown legacy outcomes distinctly.
  4. Bounty points use previous-rotation player and squad effectiveness and never award teamkills.
  5. Aggregate recalculation is deterministic and covered by fixtures/tests.
**Plans**: 4/5 plans complete

Plans:
- [x] 04-01: Parser result persistence and normalized event storage.
- [x] 04-02: Rotation assignment and player/squad aggregate calculation.
- [x] 04-03: Commander-side outcome model and aggregate calculation.
- [x] 04-04: Bounty formula documentation, implementation, and tests.
- [ ] 04-05: Recalculation orchestration after parser completion and data patches.

### Phase 5: Public Statistics API
**Goal**: Anonymous consumers can read public Solid Stats data through stable OpenAPI-covered endpoints.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: [AUTH-05, PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06]
**Success Criteria** (what must be TRUE):
  1. Public stats endpoints require no login.
  2. Overview, player, squad, rotation, commander, and bounty endpoints return aggregate-backed data.
  3. Player and squad list/search/profile endpoints support practical pagination/filtering.
  4. Public route schemas are represented in the OpenAPI output for `web`.
**Plans**: 4 plans

Plans:
- [ ] 05-01: Public stats overview and shared response/pagination patterns.
- [ ] 05-02: Player list/search/profile APIs with rotation-aware stats.
- [ ] 05-03: Squad list/search/profile APIs with rotation-aware stats.
- [ ] 05-04: Rotation, commander-side, bounty, and leaderboard APIs.

### Phase 6: Authentication and Role Management
**Goal**: Steam-authenticated users, persistent sessions, bootstrap admin, role management, and route authorization protect all non-public workflows.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06, AUTH-07]
**Success Criteria** (what must be TRUE):
  1. User can sign in through Steam authentication, keep a session, and log out.
  2. Bootstrap admin is recognized from configuration and can manage roles.
  3. Request submission routes require login.
  4. Moderator and admin routes reject users without the required role.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Steam authentication adapter, callback/session flow, and logout.
- [ ] 06-02: Bootstrap admin and role management APIs.
- [ ] 06-03: Shared authorization hooks and route policy tests.

### Phase 7: Requests, Moderation, and Audited Corrections
**Goal**: Players can submit correction and identity requests, moderators can decide them with comments, and approved changes write audit patches that trigger recalculation.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: [REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-08, REQ-09, REQ-10, REQ-11, STAT-05]
**Success Criteria** (what must be TRUE):
  1. Authenticated players can submit stats correction, identity/nickname, merge/split, and Steam profile linking requests.
  2. Requests can include descriptions, S3-backed attachments, and replay/player/squad/stat references.
  3. Moderators can approve or reject with comments, and players can see clear status and decisions.
  4. Approved stat corrections and legacy winner fixes create audit records and trigger aggregate recalculation.
  5. Admins and moderators can review request history.
**Plans**: 5 plans

Plans:
- [ ] 07-01: Request creation/status APIs and entity reference validation.
- [ ] 07-02: S3-backed request attachment flow.
- [ ] 07-03: Moderator queue, detail, approve/reject actions, and request history.
- [ ] 07-04: Audited stat correction patches and aggregate recalculation.
- [ ] 07-05: Identity merge/split/linking workflows and manual legacy winner fixes.

### Phase 8: Operations and Production Readiness
**Goal**: v1 can be operated on a single VPS with visible failures, retry/reparse controls, schema drift checks, metrics, and documented backup/restore paths.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: [INFRA-04, INFRA-05, INFRA-06, API-03, API-04, JOB-05, JOB-06, OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06]
**Success Criteria** (what must be TRUE):
  1. Production Docker Compose config can run the API and required dependencies on one VPS.
  2. Health checks, metrics, and structured logs expose API, DB, RabbitMQ, S3, parser integration, and worker/job health.
  3. Failed parse jobs are visible, retryable, and manual reparses are recorded in job history.
  4. OpenAPI drift checks catch missing/stale schema updates where practical.
  5. PostgreSQL and S3-compatible backup/restore procedures are documented.
**Plans**: 5 plans

Plans:
- [ ] 08-01: Production Docker Compose, environment, and deployment documentation.
- [ ] 08-02: Health checks, metrics, and structured job/parser error logging.
- [ ] 08-03: Failed job inspection, retry, manual reparse, and job history hardening.
- [ ] 08-04: OpenAPI drift verification and cross-app compatibility notes.
- [ ] 08-05: PostgreSQL and S3-compatible backup/restore documentation and validation.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. API Foundation and Runtime Infrastructure | 4/4 | Complete | 2026-05-09 |
| 2. Domain Schema and Identity Foundation | 4/4 | Complete | 2026-05-09 |
| 3. Ingest Promotion and Parser Job Lifecycle | 5/5 | Complete | 2026-05-09 |
| 4. Parser Results and Aggregate Statistics | 4/5 | In Progress | - |
| 5. Public Statistics API | 0/4 | Not started | - |
| 6. Authentication and Role Management | 0/3 | Not started | - |
| 7. Requests, Moderation, and Audited Corrections | 0/5 | Not started | - |
| 8. Operations and Production Readiness | 0/5 | Not started | - |
