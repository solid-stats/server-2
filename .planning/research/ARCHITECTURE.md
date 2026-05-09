# Architecture Research

**Domain:** Replay statistics backend and moderation API
**Researched:** 2026-05-09
**Confidence:** HIGH for component boundaries, MEDIUM for final module layout

## Standard Architecture

### System Overview

```text
External apps
  replays-fetcher -> S3 raw objects + ingest staging/outbox -> server-2
  replay-parser-2 <- RabbitMQ parse requests -> RabbitMQ completion/failure -> server-2
  web -> HTTP/OpenAPI contract -> server-2

server-2
  HTTP API
    public stats routes
    auth/session routes
    request routes
    moderator/admin routes
    operations routes

  Domain services
    ingest promotion
    parse job orchestration
    parser result persistence
    identity and squad history
    rotation assignment
    aggregate recalculation
    request moderation
    auth and authorization
    OpenAPI/schema publication
    health/metrics/backups

  Persistence and infrastructure
    PostgreSQL
    RabbitMQ
    S3-compatible storage
    metrics/logging
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| API server | Fastify routes, validation, auth hooks, OpenAPI publishing. | Route modules grouped by public/auth/requests/moderation/admin/operations. |
| Config module | Environment parsing and bootstrap admin/storage/queue/db settings. | Typed config loaded at startup; tests for missing/invalid config. |
| Database module | Connection pool, migrations, transactions, repositories. | `pg` plus selected query builder/migration tool. |
| Object storage module | Replay object and attachment metadata operations. | S3 client wrapper with bucket/key conventions. |
| Queue module | RabbitMQ publish/consume, retries, connection health. | Narrow adapter around chosen client; messages typed and versioned. |
| Ingest service | Promote staging records, dedupe, conflict routing. | DB transaction around staging -> replay -> parse job creation. |
| Parse job service | Create jobs, publish requests, consume results, retry/reparse. | Job state machine persisted in PostgreSQL. |
| Parser result service | Store normalized events/results and trigger recalculation. | Idempotent completion handling keyed by `job_id`/`replay_id`. |
| Stats service | Calculate player/squad/commander/bounty aggregates. | Tested pure calculation modules plus DB persistence. |
| Identity service | Canonical player, SteamID, nickname, merge/split handling. | Audited changes and history-preserving updates. |
| Requests service | Player correction requests, attachments, moderation decisions. | Request state machine plus moderation audit and recalculation hooks. |
| Operations service | Health checks, metrics, failure visibility, backups docs. | Read-only status APIs plus explicit retry/reparse commands. |

## Recommended Project Structure

```text
src/
├── app.ts                    # Fastify app factory
├── server.ts                 # process entry point
├── config/                   # env parsing and typed config
├── db/                       # pool, migrations, transaction helpers
├── infra/
│   ├── queue/                # RabbitMQ client and message contracts
│   ├── storage/              # S3-compatible storage adapter
│   ├── metrics/              # Prometheus metrics
│   └── logging/              # logger setup/correlation
├── modules/
│   ├── auth/                 # Steam login, sessions, role hooks
│   ├── users/                # users and roles
│   ├── identity/             # canonical players, nicknames, SteamIDs
│   ├── squads/               # squads and memberships
│   ├── rotations/            # rotation definitions and assignment
│   ├── ingest/               # staging promotion and conflicts
│   ├── parse-jobs/           # job lifecycle and RabbitMQ messages
│   ├── parser-results/       # normalized parse output persistence
│   ├── stats/                # player/squad/commander/bounty aggregates
│   ├── requests/             # correction/identity requests
│   ├── moderation/           # decisions, comments, audit
│   └── operations/           # health, failures, retry, reparse
├── openapi/                  # schema generation/export helpers
└── tests/                    # test helpers and integration fixtures
```

### Structure Rationale

- **`infra/`:** isolates technical adapters so domain modules do not depend directly on RabbitMQ/S3/metrics details.
- **`modules/`:** groups by business capability, which matches GSD phase planning and ownership.
- **`openapi/`:** makes API schema publication a first-class output, not an afterthought.
- **`tests/`:** parser fixtures, formula tests, and integration harnesses need shared setup.

## Architectural Patterns

### Pattern 1: Durable Job State Before Queue Publish

**What:** Create a PostgreSQL `parse_jobs` row before publishing RabbitMQ work.
**When to use:** Every parse, retry, and manual reparse.
**Trade-offs:** More bookkeeping, but avoids invisible lost work.

```typescript
await db.transaction().execute(async (trx) => {
  const job = await parseJobs.create(trx, replayId);
  await outbox.recordParseRequest(trx, job);
});
await queue.publishParseRequest(jobMessage);
```

### Pattern 2: Idempotent Parser Result Consumption

**What:** Completion/failure consumers should be safe to run more than once.
**When to use:** RabbitMQ consumers, retries, and crash recovery.
**Trade-offs:** Requires unique keys and state checks, but prevents duplicate aggregates.

### Pattern 3: Schema-First Route Contracts

**What:** Each Fastify route defines request/response schemas used for validation and OpenAPI.
**When to use:** All public, auth, moderation, admin, and operations routes.
**Trade-offs:** Slightly more route boilerplate, but eliminates DTO/schema drift.

### Pattern 4: Audited Domain Corrections

**What:** Approved moderation actions write audit/patch records before changing derived data.
**When to use:** Stat corrections, identity changes, merge/split, manual winner fixes.
**Trade-offs:** More tables and recalculation paths, but makes trust and recovery possible.

## Data Flow

### Ingest and Parse Flow

```text
replays-fetcher
  -> S3 raw object
  -> ingest staging/outbox row
  -> server-2 promotion worker
  -> duplicate/conflict check
  -> replays row
  -> parse_jobs row
  -> RabbitMQ parse request
  -> replay-parser-2
  -> RabbitMQ completion/failure
  -> parser result persistence
  -> aggregate recalculation
  -> public stats APIs
```

### Request and Moderation Flow

```text
Steam-authenticated user
  -> correction/identity request + optional S3 attachments
  -> moderator queue
  -> approve/reject with comment
  -> moderation_actions audit row
  -> optional patch/identity update
  -> aggregate recalculation when needed
  -> user-visible decision/status
```

### OpenAPI Contract Flow

```text
Fastify route schemas
  -> OpenAPI 3.x document
  -> schema export endpoint/file
  -> web openapi-typescript generation
  -> frontend typed API consumption
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single VPS v1 | One API process, one or more worker processes, PostgreSQL, RabbitMQ, S3/MinIO, Prometheus-compatible metrics. |
| More parser throughput | Increase parser workers and queue consumers; keep job state authoritative in PostgreSQL. |
| More public traffic | Cache or materialize aggregate tables; paginate/search carefully; add DB indexes from query plans. |
| More moderation load | Add queue filters, bulk actions, and richer audit search; keep same request/audit model. |
| Future Kubernetes | Split API/worker deployments without changing domain boundaries. |

### Scaling Priorities

1. **First bottleneck:** aggregate query performance - prevent with persisted aggregates, indexes, and tested recalculation.
2. **Second bottleneck:** parser throughput/retries - prevent with durable job states and worker scaling.
3. **Third bottleneck:** object storage/backup size - prevent with S3 key conventions and backup/restore docs.

## Anti-Patterns

### Anti-Pattern 1: Stats Directly From Raw Events on Every Request

**What people do:** Query raw event rows to answer every public stats request.
**Why it's wrong:** It works on tiny datasets but creates slow, inconsistent public APIs.
**Do this instead:** Persist derived player/squad/commander/bounty aggregates and recalculate after parser/moderation changes.

### Anti-Pattern 2: Silent Identity Merging

**What people do:** Merge players by nickname or weak SteamID assumptions.
**Why it's wrong:** Old data has missing SteamIDs and nickname reuse; silent merges corrupt stats.
**Do this instead:** Use canonical player records, source evidence, moderated merge/split workflows, and audit.

### Anti-Pattern 3: Queue as the Source of Truth

**What people do:** Treat RabbitMQ messages as the authoritative job list.
**Why it's wrong:** Messages can be in-flight, redelivered, or lost through bad publisher sequencing.
**Do this instead:** Keep PostgreSQL `parse_jobs` authoritative and make RabbitMQ a delivery mechanism.

### Anti-Pattern 4: Schema Export as a Final Polish Task

**What people do:** Add OpenAPI after routes exist.
**Why it's wrong:** `web` integration then depends on stale or manually mirrored DTOs.
**Do this instead:** Start route schemas and schema export in the API foundation phase.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `replays-fetcher` | DB staging/outbox plus S3 raw object evidence. | Define staging schema/status enum early and document conflicts. |
| `replay-parser-2` | RabbitMQ request/result contract plus S3 object keys. | Include `parser_contract_version` and failure payload shape. |
| `web` | OpenAPI 3.x schema consumed by `openapi-typescript`. | Breaking schema changes require compatibility notes. |
| Steam | Login/profile linking adapter. | Verify actual provider protocol and callback/domain constraints during auth phase. |
| S3-compatible storage | Object key references in PostgreSQL. | Local MinIO and production provider should share code path. |
| Metrics stack | Prometheus-style metrics endpoint. | Track API health, queue state, job failures, parser failures, DB/storage health. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| API routes -> services | Function calls with validated DTOs. | Routes should not contain domain logic. |
| Services -> repositories | Transaction-aware repository calls. | Multi-entity flows should accept transaction context. |
| Job consumers -> domain services | Idempotent service calls. | Consumers must tolerate redelivery. |
| Moderation -> stats | Recalculation trigger. | Approved patches should be applied before recalculation. |
| OpenAPI -> route schemas | Generated from schemas. | CI should detect schema drift where practical. |

## Sources

- `gsd-briefs/server-2.md` - integration responsibilities and data model.
- `.planning/PROJECT.md` - project boundaries and constraints.
- Official stack sources listed in `.planning/research/STACK.md`.

---
*Architecture research for: replay statistics backend and moderation API*
*Researched: 2026-05-09*
