# Phase 3: Ingest Promotion and Parser Job Lifecycle - Research

**Researched:** 2026-05-09  
**Domain:** PostgreSQL-backed ingest promotion, RabbitMQ parser job orchestration, parser result lifecycle APIs  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Staging and Promotion Handoff
- **D-01:** In v1, `replays-fetcher` writes only staging/outbox tables in the `server-2` PostgreSQL database. `server-2` owns canonical `replays`, `parse_jobs`, conflict handling, and parser orchestration.
- **D-02:** `server-2` should claim pending staging rows in batches through a transaction using row locks/`SKIP LOCKED` or an equivalent safe claiming mechanism so parallel workers do not promote the same candidate twice.
- **D-03:** Temporary promotion failures should leave recoverable status and structured error/details for retry. Do not lose staging evidence and do not leave operators with invisible stuck rows.
- **D-04:** The atomic DB promotion unit is canonical replay creation/update, durable `parse_jobs` creation, and staging status update in one transaction. RabbitMQ publish happens after that from durable job state.

### Duplicate and Conflict Policy
- **D-05:** Checksum is the primary byte-level dedupe signal. If SHA-256 matches an existing replay, it represents the same raw replay bytes.
- **D-06:** If checksum matches but source identity differs, do not create a new replay. Attach the new source identity and promotion evidence to the existing replay lineage.
- **D-07:** If `source_system + source_replay_id` matches an existing record but checksum/object key differ, mark the staging row as a conflict for manual review. Do not use latest-wins or silently ignore the new evidence.
- **D-08:** Conflict evidence should preserve both sides: source IDs/URLs when available, object keys, checksums, sizes, timestamps, existing replay/staging refs, and a reason code or explanation.

### Parse Job Publishing
- **D-09:** Use a DB-backed publisher. Promotion leaves `parse_jobs` queued; a publisher selects queued/retryable jobs, publishes with RabbitMQ publisher confirms, then marks jobs as published.
- **D-10:** Lock simple RabbitMQ contract names/defaults during Phase 3 so `server-2` and `replay-parser-2` use the same queues/routing keys. Exact names may be configurable, but documented defaults must exist.
- **D-11:** Parse request messages must stay minimal and match parser expectations: `job_id`, `replay_id`, `object_key`, `checksum`, and `parser_contract_version`.
- **D-12:** If publish confirm is not received or RabbitMQ is unavailable, keep/revert the job to queued or a retryable publish state with attempt/error details. Do not mark this as parser failure and do not block staging promotion on broker availability.

### Parser Result Handling
- **D-13:** `parse.completed` should carry an artifact reference rather than the full artifact: `job_id`, `replay_id`, `parser_contract_version`, artifact object key/checksum/size, and lightweight timing/context.
- **D-14:** `parse.failed` should carry structured failure data: `job_id`, `replay_id`, category/code/message, retryable flag, `parser_contract_version`, and safe timing/log context without secrets.
- **D-15:** Completion/failure handling must be idempotent by `job_id`. Compatible duplicate or late terminal results should be acknowledged/ignored without new side effects; record duplicate evidence only if useful.
- **D-16:** On successful completion in Phase 3, persist terminal job state plus artifact reference/current parser-result placeholder. Deep artifact normalization, parser events, and aggregate recalculation remain Phase 4.

### Operator Status APIs
- **D-17:** Phase 3 should expose read-only, OpenAPI-covered lifecycle visibility APIs for staging/conflicts and parse jobs. Retry/reparse/resolve actions remain Phase 8 unless planning finds a tiny internal primitive necessary for tests.
- **D-18:** Required filters are status plus IDs and identity fields useful for operations: `replay_id`, `source_system`, `source_replay_id`, `checksum`, `job_id`, and pagination. Broad text search is out of scope.
- **D-19:** Because full auth/roles arrive in Phase 6, Phase 3 routes should be shaped like future admin/operator APIs but explicitly document that final authorization enforcement is deferred.
- **D-20:** Detail responses should return evidence summaries: status, IDs, timestamps, attempts, structured error, and summarized promotion/conflict evidence. Do not expose raw large artifacts or leak arbitrary internal JSON by default.

### the agent's Discretion
Exact service/repository boundaries, batch sizes, retry timing, internal enum refinements, RabbitMQ exchange/routing key names, and API path names are at the agent's discretion if they preserve the decisions above, current schema direction, OpenAPI compatibility, and adjacent-app contracts.

### Deferred Ideas (OUT OF SCOPE)
- Retry, manual reparse, and conflict resolution actions belong primarily to Phase 8 operations hardening.
- Full parser artifact normalization, parser event persistence, and aggregate recalculation belong to Phase 4.
- Final moderator/admin authorization enforcement belongs to Phase 6.
- Broad text search over lifecycle evidence is out of Phase 3 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INGEST-01 | Server polls `replays-fetcher` staging/outbox records for pending replay candidates. | Use PostgreSQL `FOR UPDATE SKIP LOCKED` batch claims against `ingest_staging_records.status = 'pending'`. [CITED: postgresql.org/docs/current/sql-select.html] [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql] |
| INGEST-02 | Server deduplicates replay candidates by checksum plus external source identity. | Existing unique constraints cover `replays.checksum`, `replays(source_system, source_replay_id)`, and staging source identity; add explicit service policy tests for checksum/source combinations. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql] |
| INGEST-03 | Server routes ambiguous duplicate conflicts to manual review instead of silently merging or skipping. | Store conflict evidence in `ingest_staging_records.conflict_details` and status `conflicted`; do not update canonical replay in source-ID/checksum mismatch cases. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql] [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| INGEST-04 | Server promotes accepted staged records into canonical `replays` records. | Promotion transaction must insert/update `replays`, preserve `promoted_from_staging_id`, and set staging `promoted`. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql] |
| INGEST-05 | Server creates parse jobs for promoted replay records. | Same promotion transaction creates `parse_jobs(status='queued')`; RabbitMQ publish happens later from durable DB state. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| INGEST-06 | Server exposes staged, promoted, conflicted, and failed ingest status for admin/operator visibility where practical. | Add read-only TypeBox/Fastify routes with status and identity filters; route schemas remain OpenAPI source. [VERIFIED: src/modules/operations/routes.ts] [CITED: fastify.dev/docs/latest/Reference/Validation-and-Serialization/] |
| JOB-01 | Server creates durable parse jobs when replay files are promoted from ingest staging or accepted admin upload. | Phase 3 covers ingest promotion path; admin upload path can share a `createParseJobForReplay` service but upload UX remains later. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED] |
| JOB-02 | Server publishes RabbitMQ parse requests containing `job_id`, `replay_id`, `object_key`, `checksum`, and `parser_contract_version`. | Use parser's committed `parse-job-v1.schema.json`; note `checksum` is an object `{ algorithm: 'sha256', value }`, not a bare string. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json] |
| JOB-03 | Server records parser completion results. | Consume `parse.completed`, mark job `succeeded`, replay `parsed`, and insert `parser_results` placeholder with artifact-reference JSON in `raw_snapshot`. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/crates/parser-contract/examples/parse_completed.v1.json] [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql] |
| JOB-04 | Server records parser failure results with structured error information. | Consume `parse.failed`, mark job `failed` or `retryable` from `failure.retryability`, replay `parse_failed`, and persist `parse_jobs.error`. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/crates/parser-contract/examples/parse_failed.v1.json] |
| JOB-07 | Parser result handling is idempotent enough to avoid duplicate side effects from redelivery or retry. | Terminal-state updates must be `where status not in ('succeeded','failed')`; duplicate compatible terminal messages are acked with no new parser result. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] [CITED: amqp-node.github.io/amqplib/channel_api.html] |
</phase_requirements>

## Summary

Phase 3 should implement a DB-first lifecycle: claim pending staging rows with PostgreSQL row locks, promote accepted rows into canonical replay plus queued parse job records in one transaction, and publish RabbitMQ messages only from durable `parse_jobs` state. PostgreSQL documents `SKIP LOCKED` as appropriate for queue-like tables with multiple consumers, which matches the phase's parallel worker requirement. [CITED: postgresql.org/docs/current/sql-select.html] The current schema already provides `ingest_staging_records`, `replays`, `parse_jobs`, `parser_results`, lifecycle enums, and indexes. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql]

The parser contract is already concrete in `replay-parser-2`: parse job messages are JSON with `job_id`, `replay_id`, `object_key`, `checksum`, and `parser_contract_version`; `checksum` is a structured SHA-256 object; successful results are `parse.completed` messages with an artifact reference and artifact checksum/size; failed results are `parse.failed` messages with field-presence wrappers and structured failure payloads. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json] [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-result-v1.schema.json]

The main schema gap is not a missing lifecycle table; it is missing first-class lineage and publish metadata. Plan additive migrations for replay source lineage, publish attempts/timestamps, result-message dedupe evidence, and possibly parser artifact reference columns or a typed JSON envelope inside `parser_results.raw_snapshot`. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql] [ASSUMED]

**Primary recommendation:** Build `src/modules/ingest` and `src/modules/parser-jobs` as service/repository modules over `pg`, keep RabbitMQ as delivery only, validate message payloads against parser-owned schemas or mirrored TypeBox schemas, and expose read-only operator routes under an admin-shaped path with auth enforcement explicitly deferred. [VERIFIED: package.json] [VERIFIED: src/modules/operations/routes.ts]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Staging row claim/promotion | API / Backend | Database / Storage | Backend owns product lifecycle decisions; PostgreSQL owns row locking and durable state. [VERIFIED: .planning/PROJECT.md] |
| Duplicate/conflict policy | API / Backend | Database / Storage | Business policy belongs in service code; DB constraints prevent impossible duplicates. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| Parse job publishing | API / Backend | RabbitMQ | Backend selects queued jobs from DB and RabbitMQ delivers messages. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| Parser execution | External parser worker | S3-compatible storage | `replay-parser-2` reads raw objects and writes artifact references; server must not parse OCAP. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/README.md] |
| Completion/failure persistence | API / Backend | Database / Storage | Backend records terminal job state and artifact references in PostgreSQL. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql] |
| Operator status APIs | API / Backend | Frontend Server / Browser later | Phase 3 exposes OpenAPI-covered data; `web` consumes later through generated types. [VERIFIED: .planning/PROJECT.md] |

## Project Constraints (from AGENTS.md)

- `server-2` is the PostgreSQL source of truth for canonical replay state, parse jobs, identity, auth, moderation, stats, and API-visible operational state. [VERIFIED: AGENTS.md]
- `replays-fetcher` writes raw S3 objects and staging/outbox records only; it must not write canonical business tables. [VERIFIED: AGENTS.md]
- OCAP JSON parsing belongs to `replay-parser-2`; Phase 3 must not parse replay contents. [VERIFIED: AGENTS.md]
- Raw replay files and parser artifacts live in S3-compatible storage; PostgreSQL stores metadata, job state, canonical business data, and audit evidence. [VERIFIED: AGENTS.md]
- OpenAPI is the backend contract for `web`; route schema changes must preserve generated-client compatibility or coordinate adjacent app updates. [VERIFIED: AGENTS.md]
- Use Node.js 25, TypeScript 6, Fastify 5, PostgreSQL, RabbitMQ, S3-compatible storage, strict ESLint/Prettier, Vitest 4, and V8 coverage gates. [VERIFIED: AGENTS.md] [VERIFIED: package.json]
- Do not bypass durable `parse_jobs` state when coordinating parser work. [VERIFIED: AGENTS.md]
- Cross-app changes to parser contract, ingest staging/source identity, RabbitMQ/S3 messages, object keys, API/data model, auth, moderation, or UI-visible behavior require adjacent app docs/repos or a user question. [VERIFIED: AGENTS.md]
- Root `README.md` must stay current when scope, commands, architecture direction, validation data, or development workflow changes. [VERIFIED: AGENTS.md]
- Completed work sessions must leave `git status --short` clean by committing intended results. [VERIFIED: AGENTS.md]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | Target `>=25 <26`; shell currently `v22.22.2` | Runtime | Repository engine target is Node 25; current shell is below target and planner must include a toolchain check. [VERIFIED: package.json] [VERIFIED: node --version] |
| TypeScript | 6.0.3 | Application language | Installed project compiler and strict ESM backend baseline. [VERIFIED: package.json] |
| Fastify | 5.8.5 | HTTP routes/OpenAPI source | Installed framework; Fastify recommends schema-based route validation/serialization. [VERIFIED: npm registry] [CITED: fastify.dev/docs/latest/Reference/Validation-and-Serialization/] |
| `pg` | 8.20.0 | PostgreSQL access | Installed direct SQL driver; current DB code already uses `Pool`. [VERIFIED: npm registry] [VERIFIED: src/infra/db/client.ts] |
| RabbitMQ + `amqplib` | `amqplib` 1.0.7 | Queue publishing/consuming | Installed adapter; amqplib supports confirm channels and manual ack/nack APIs. [VERIFIED: npm registry] [CITED: amqp-node.github.io/amqplib/channel_api.html] |
| `@sinclair/typebox` | 0.34.49 | Route schema definitions | Existing routes use TypeBox schemas as Fastify/OpenAPI source. [VERIFIED: npm registry] [VERIFIED: src/modules/operations/routes.ts] |
| Vitest | 4.1.5 | Unit/integration tests | Installed test runner with V8 coverage thresholds configured at 100%. [VERIFIED: npm registry] [VERIFIED: vitest.config.ts] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/swagger` | 9.7.0 | OpenAPI generation | Keep lifecycle APIs route-schema-backed and exportable. [VERIFIED: npm registry] [VERIFIED: src/openapi/register-openapi.ts] |
| `@fastify/type-provider-typebox` | 6.1.0 | Fastify TypeBox integration | Use for typed route params/query/response schemas. [VERIFIED: npm registry] [VERIFIED: src/app.ts] |
| `openapi-typescript` | 7.13.0 | Contract compatibility check | Existing `openapi:check` validates generated TypeScript compatibility. [VERIFIED: npm registry] [VERIFIED: package.json] [CITED: openapi-ts.dev/introduction] |
| Kysely | 0.29.0 | Optional typed query builder | Installed but unused; prefer `pg` repositories unless a plan introduces Kysely consistently. [VERIFIED: npm registry] [VERIFIED: package.json] |
| `prom-client` | 15.1.3 | Metrics registry | Existing operations module exposes `/metrics`; Phase 3 can add counters later, but full metrics are Phase 8. [VERIFIED: package.json] [VERIFIED: src/modules/operations/routes.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg` repositories | Kysely | Kysely is installed and useful for larger typed query surfaces, but Phase 3 can stay with explicit SQL matching current migration/client patterns. [VERIFIED: package.json] [ASSUMED] |
| DB-backed publisher from `parse_jobs` | Separate outbox table | Separate outbox can help generic eventing, but locked context recommends using `parse_jobs` directly unless a concrete need appears. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| RabbitMQ confirms | Fire-and-forget publish | RabbitMQ docs call automatic acknowledgement unsafe for some workloads; amqplib confirm channels expose broker ack/nack for publishes. [CITED: rabbitmq.com/docs/confirms] [CITED: amqp-node.github.io/amqplib/channel_api.html] |

**Installation:**
```bash
pnpm install
```

**Version verification:** Ran `npm view` for `fastify`, `@fastify/swagger`, `@fastify/type-provider-typebox`, `@sinclair/typebox`, `amqplib`, `pg`, `kysely`, `vitest`, and `openapi-typescript` on 2026-05-09; versions above match the npm registry. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
replays-fetcher
  -> S3 raw/{...} object
  -> PostgreSQL ingest_staging_records(status=pending)
       |
       v
server-2 ingest promoter
  -> SELECT pending FOR UPDATE SKIP LOCKED
  -> decide:
       checksum new + source new
         -> insert replays
         -> insert parse_jobs(status=queued)
         -> staging.status=promoted
       checksum existing + source differs
         -> attach lineage evidence
         -> optional parse job only if existing replay lacks one
         -> staging.status=promoted or ignored with evidence
       source same + checksum/object differs
         -> staging.status=conflicted
         -> conflict_details={existing,new,reason}
       temporary failure
         -> staging.status=failed with structured error
       |
       v
parse job publisher
  -> claim parse_jobs(status in queued/retryable)
  -> publish parse job JSON with ConfirmChannel
  -> confirmed: parse_jobs.status=published, published_at=now()
  -> failed publish: parse_jobs.status=retryable or queued, error=publish details
       |
       v
replay-parser-2 worker
  -> reads S3 object by object_key/checksum
  -> writes artifacts/v3/{encoded_replay_id}/{source_sha256}.json
  -> publishes parse.completed or parse.failed
       |
       v
server-2 result consumer
  -> validate message_type + payload
  -> idempotent terminal update by job_id
  -> succeeded: parse_jobs.succeeded + replay.parsed + parser_results current placeholder
  -> failed: parse_jobs.failed/retryable + replay.parse_failed + structured error
       |
       v
read-only operator APIs
  -> /admin/ingest/staging
  -> /admin/ingest/conflicts
  -> /admin/parse-jobs
```

### Recommended Project Structure

```text
src/
├── modules/
│   ├── ingest/
│   │   ├── routes.ts          # read-only staging/conflict status APIs
│   │   ├── schemas.ts         # TypeBox response/query schemas
│   │   ├── service.ts         # promotion decision orchestration
│   │   └── repository.ts      # pg SQL for staging/replay operations
│   └── parser-jobs/
│       ├── routes.ts          # read-only job status APIs
│       ├── schemas.ts         # job/result TypeBox schemas
│       ├── publisher.ts       # queued job publisher with confirms
│       ├── consumer.ts        # parse.completed / parse.failed handler
│       └── repository.ts      # pg SQL for parse_jobs/parser_results
├── infra/
│   ├── db/
│   │   └── migrations/0002_ingest_job_lifecycle.sql
│   └── queue/
│       └── client.ts          # evolve health adapter into connection/channel factory
└── test/
    └── integration/
        ├── ingest-promotion.test.ts
        └── parser-job-lifecycle.test.ts
```

### Pattern 1: Queue-like Claim With `SKIP LOCKED`

**What:** Select a small ordered batch of pending rows with `FOR UPDATE SKIP LOCKED`, update those rows inside the transaction, and commit quickly. [CITED: postgresql.org/docs/current/sql-select.html]  
**When to use:** Promotion workers and job publishers that may run concurrently. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]  
**Example:**
```sql
-- Source: PostgreSQL SELECT locking docs + current table names.
with claim as (
  select id
  from ingest_staging_records
  where status = 'pending'
  order by created_at, id
  limit $1
  for update skip locked
)
select s.*
from ingest_staging_records s
join claim using (id);
```

### Pattern 2: Promotion Transaction Boundary

**What:** In one DB transaction, lock staging, decide duplicate/conflict policy, create or update replay lineage, create queued parse job if needed, and update staging terminal/recoverable status. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]  
**When to use:** Every accepted staging record. [VERIFIED: .planning/REQUIREMENTS.md]  
**Example:**
```typescript
// Source: project context and existing pg transaction style in migrate.ts.
await client.query("begin");
try {
  const staged = await repository.lockStagingRecord(stagingId);
  const decision = await service.decidePromotion(staged);
  await service.applyPromotionDecision(client, decision);
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
}
```

### Pattern 3: Confirmed Publish From Durable Job State

**What:** Publish from `parse_jobs`, use a RabbitMQ confirm channel, and mark `published` only after confirmation. [CITED: amqp-node.github.io/amqplib/channel_api.html]  
**When to use:** Phase 3 parser job publisher. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]  
**Example:**
```typescript
// Source: amqplib ConfirmChannel docs; payload fields from parser parse-job schema.
const payload = {
  job_id: job.id,
  replay_id: job.replayId,
  object_key: job.objectKey,
  checksum: { algorithm: "sha256", value: job.checksum },
  parser_contract_version: job.parserContractVersion,
};

channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), {
  contentType: "application/json",
  deliveryMode: 2,
});
await channel.waitForConfirms();
await repository.markPublished(job.id);
```

### Pattern 4: Idempotent Terminal Result Handling

**What:** Treat `job_id` as the idempotency key; update terminal state only if the job is not already terminal, and ack compatible duplicate terminal messages. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]  
**When to use:** Result consumers for `parse.completed` and `parse.failed`. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-result-v1.schema.json]  
**Example:**
```sql
-- Source: current parse_jobs statuses.
update parse_jobs
set status = 'succeeded',
    finished_at = now(),
    updated_at = now()
where id = $1
  and status not in ('succeeded', 'failed')
returning id, replay_id;
```

### Anti-Patterns to Avoid

- **Publishing inside the promotion transaction:** Broker confirmation cannot participate in the PostgreSQL transaction; publish after commit from durable `parse_jobs`. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]
- **Bare checksum string in parser job JSON:** Parser schema expects `{ algorithm, value }`; a string would violate `parse-job-v1.schema.json`. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json]
- **Automatic consumer ack:** RabbitMQ docs call auto ack unsafe for workloads where processing can fail before completion; use manual ack/nack. [CITED: rabbitmq.com/docs/confirms]
- **Large/raw JSONB API responses:** Context requires evidence summaries, not arbitrary large internal JSON. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]
- **Resolving conflicts in Phase 3:** Conflict resolution actions are deferred to Phase 8; Phase 3 only surfaces visibility. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent staging claim | In-memory locks or status polling without row locks | PostgreSQL `FOR UPDATE SKIP LOCKED` | Official docs identify `SKIP LOCKED` as useful for queue-like tables with multiple consumers. [CITED: postgresql.org/docs/current/sql-select.html] |
| Broker delivery confirmation | Sleep/retry after `publish()` | RabbitMQ publisher confirms via amqplib `ConfirmChannel` | Confirm channel callbacks and `waitForConfirms()` report broker ack/nack. [CITED: amqp-node.github.io/amqplib/channel_api.html] |
| Message schema contract | Ad hoc payloads | Parser-owned JSON schemas and mirrored TypeBox schemas | Parser repo already commits worker schemas and examples. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json] |
| API DTO mirrors | Handwritten `web` types | Fastify route schemas + OpenAPI + `openapi-typescript` check | Existing package script verifies generated OpenAPI TypeScript compatibility. [VERIFIED: package.json] |
| OCAP parsing | JSON parsing in `server-2` | `replay-parser-2` artifact references | Parser ownership is explicit and Phase 3 excludes artifact normalization. [VERIFIED: AGENTS.md] |

**Key insight:** The hard part is not moving JSON between processes; it is preserving a single durable state machine so replay evidence, parser jobs, RabbitMQ delivery, and terminal results can be explained after crashes and redeliveries. [VERIFIED: .planning/research/SUMMARY.md]

## Common Pitfalls

### Pitfall 1: Treating Checksum Dedupe as Source Dedupe
**What goes wrong:** Same raw bytes from a new source identity create duplicate `replays` rows or parse jobs. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]  
**Why it happens:** The current `replays.checksum` unique constraint blocks duplicate rows, but lineage attachment is not first-class yet. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql]  
**How to avoid:** Add a replay source/evidence lineage table or explicit JSON lineage update and test checksum/source combinations. [ASSUMED]  
**Warning signs:** `unique_violation` on `replays_checksum_key` during normal duplicate ingest. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql]

### Pitfall 2: Publishing State Lies
**What goes wrong:** A job is marked published before RabbitMQ confirms, or publish failure is recorded as parser failure. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]  
**Why it happens:** DB and broker are separate systems. [ASSUMED]  
**How to avoid:** Keep queued/retryable DB state until `ConfirmChannel.waitForConfirms()` succeeds; record publish errors separately from parser errors. [CITED: amqp-node.github.io/amqplib/channel_api.html]  
**Warning signs:** `published_at` exists with no corresponding RabbitMQ message and no publish attempt error. [ASSUMED]

### Pitfall 3: Misreading Parser Failure Shape
**What goes wrong:** Server expects `parse.failed.job_id` to be a string, but parser sends field-presence wrappers. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/crates/parser-contract/examples/parse_failed.v1.json]  
**Why it happens:** Parser can report malformed jobs where fields are absent or invalid. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-result-v1.schema.json]  
**How to avoid:** Implement decoders for `FieldPresence` and only mutate DB when `job_id.state === 'present'`. [ASSUMED]  
**Warning signs:** Consumer crashes on malformed-job failure messages. [ASSUMED]

### Pitfall 4: OpenAPI Drift for Operator APIs
**What goes wrong:** Admin/status APIs work locally but generated `web` types fail or omit new endpoints. [VERIFIED: .planning/PROJECT.md]  
**Why it happens:** Response/query schemas are missing or not registered with Fastify. [CITED: fastify.dev/docs/latest/Reference/Validation-and-Serialization/]  
**How to avoid:** Use TypeBox schemas for params/query/response and run `pnpm run openapi:check`. [VERIFIED: package.json]  
**Warning signs:** `openapi-typescript` fails in `pnpm run openapi:check`. [VERIFIED: package.json]

## Code Examples

### Parser Job Payload
```json
{
  "job_id": "job-0001",
  "replay_id": "replay-0001",
  "object_key": "raw/replay-0001.ocap.json",
  "checksum": {
    "algorithm": "sha256",
    "value": "0000000000000000000000000000000000000000000000000000000000000000"
  },
  "parser_contract_version": "3.0.0"
}
```
Source: `/home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json`. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json]

### Completed Result Handling Target
```json
{
  "message_type": "parse.completed",
  "job_id": "job-0001",
  "replay_id": "replay-0001",
  "parser_contract_version": "3.0.0",
  "artifact": {
    "bucket": "solid-stats-replays",
    "key": "artifacts/v3/replay-0001/0000000000000000000000000000000000000000000000000000000000000000.json"
  },
  "artifact_size_bytes": 1234
}
```
Source: parser example trimmed to key fields. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/crates/parser-contract/examples/parse_completed.v1.json]

### Operator Route Shape
```typescript
// Source: existing operations route schema pattern.
app.get(
  "/admin/parse-jobs",
  {
    schema: {
      tags: ["operations", "parse-jobs"],
      querystring: ParseJobListQuery,
      response: { 200: ParseJobListResponse },
    },
  },
  async (request) => parserJobService.listJobs(request.query),
);
```
Source: `src/modules/operations/routes.ts` pattern. [VERIFIED: src/modules/operations/routes.ts]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Parser returns or embeds large artifacts in result messages | Parser writes compact artifacts to S3 and publishes references | Parser v1.0 completed 2026-05-09 | Server should store artifact reference in Phase 3 and leave normalization to Phase 4. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/PROJECT.md] |
| Fetcher owns ingest beyond raw object discovery | Fetcher writes staging/outbox only; server promotes | Fetcher planning on 2026-05-09 | Server must implement dedupe/conflict/job lifecycle. [VERIFIED: /home/afgan0r/Projects/SolidGames/replays-fetcher/docs/integration-contract.md] |
| Fire-and-forget parser messages | Durable DB job plus RabbitMQ confirms | Phase 3 context | Prevents lost jobs and separates publish failure from parser failure. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |

**Deprecated/outdated:**
- Bare string checksum in parser job messages: parser worker schema requires `{ algorithm: 'sha256', value: '<64 hex>' }`. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json]
- Parser-owned database mutation: parser project states PostgreSQL persistence belongs to `server-2`. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/PROJECT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 3 can use `parser_results.raw_snapshot` for artifact-reference placeholder JSON if no new typed artifact columns are added. | Summary / Phase Requirements | Planner may need an additive migration for artifact columns instead. |
| A2 | A replay source lineage table is preferable to growing `replays.promotion_evidence` JSON for multi-source duplicate evidence. | Common Pitfalls | Planner may choose JSON-only evidence; API summaries must still remain stable. |
| A3 | Existing `pg` repositories are sufficient for Phase 3 instead of introducing Kysely usage. | Standard Stack | Planner may choose Kysely for consistency with future data access, increasing setup work. |
| A4 | Admin upload can share parse job creation service but does not need a user-facing upload flow in Phase 3. | Phase Requirements | If admin upload is required now, scope expands beyond roadmap. |

## Open Questions

1. **Should Phase 3 add a replay source lineage table?**  
   What we know: D-06 requires attaching new source identity and promotion evidence to an existing replay; current `replays` has one source identity and JSON evidence only. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql]  
   What's unclear: Whether planners prefer a normalized `replay_sources` table or JSON evidence updates.  
   Recommendation: Add `replay_sources` with unique `(replay_id, source_system, source_replay_id)` and keep API evidence summaries stable. [ASSUMED]

2. **Where should parser artifact reference live long term?**  
   What we know: Phase 3 only needs artifact-reference persistence; Phase 4 owns normalization. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md]  
   What's unclear: Current `parser_results.raw_snapshot jsonb not null` was originally named for raw parser output, not a small reference envelope. [VERIFIED: src/infra/db/migrations/0001_v1_domain_schema.sql]  
   Recommendation: Use a typed JSON envelope in `raw_snapshot` for Phase 3 or add nullable artifact columns in `parser_results`; do not store full artifact bytes in PostgreSQL. [ASSUMED]

3. **Exact queue/exchange defaults?**  
   What we know: parser defaults include result routing keys `parse.completed` and `parse.failed`, and parser tests use worker config defaults. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/crates/parser-worker/src/config.rs]  
   What's unclear: The request exchange/queue name should be locked in `server-2` config during planning.  
   Recommendation: Use configurable defaults and document them in `.env.example`/README during implementation. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All TypeScript execution | ✗ target mismatch | Shell `v22.22.2`; repo requires `>=25 <26` | Use the project's Node 25 toolchain before executing Phase 3. [VERIFIED: node --version] [VERIFIED: package.json] |
| pnpm | Package scripts | ✓ | 11.0.9 | None needed. [VERIFIED: pnpm --version] |
| npm registry access | Version verification | ✓ | npm 10.9.7 | None needed. [VERIFIED: npm --version] |
| Docker | Integration dependencies | ✓ | 20.10.17 | Existing Compose may work; validate before integration tests. [VERIFIED: docker --version] |
| Docker Compose | Local dependencies | ✓ | v2.6.0 | None for planning; execution should run services. [VERIFIED: docker compose version] |
| PostgreSQL service | Integration tests | ✗ currently not responding | `localhost:15432 - no response` | Start local Compose before `test:integration`. [VERIFIED: pg_isready] |
| RabbitMQ CLI | Direct broker inspection | Limited | command exists but `rabbitmqctl` requires root/rabbitmq user | Use app adapter tests and Docker logs instead. [VERIFIED: rabbitmqctl version] |

**Missing dependencies with no fallback:**
- Node 25 runtime for strict engine compliance before executing package scripts. [VERIFIED: package.json] [VERIFIED: node --version]

**Missing dependencies with fallback:**
- Local PostgreSQL/RabbitMQ/S3 services are not currently confirmed running; start Docker Compose before integration tests. [VERIFIED: pg_isready] [VERIFIED: src/test/integration/adapters.test.ts]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 with V8 coverage. [VERIFIED: npm registry] |
| Config file | `vitest.config.ts`. [VERIFIED: vitest.config.ts] |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm run verify` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGEST-01 | Pending staging rows are claimed once under concurrent workers. | integration | `pnpm vitest run src/modules/ingest/ingest-promotion.test.ts -t "claims pending staging rows"` | ❌ Wave 0 |
| INGEST-02 | Checksum/source dedupe decisions are deterministic. | unit/integration | `pnpm vitest run src/modules/ingest/ingest-promotion.test.ts -t "deduplicates"` | ❌ Wave 0 |
| INGEST-03 | Source-ID/checksum mismatch becomes conflict. | integration | `pnpm vitest run src/modules/ingest/ingest-promotion.test.ts -t "conflict"` | ❌ Wave 0 |
| INGEST-04 | Accepted staging creates canonical replay. | integration | `pnpm vitest run src/modules/ingest/ingest-promotion.test.ts -t "promotes"` | ❌ Wave 0 |
| INGEST-05 | Promotion creates queued parse job in same transaction. | integration | `pnpm vitest run src/modules/ingest/ingest-promotion.test.ts -t "parse job"` | ❌ Wave 0 |
| INGEST-06 | Operator ingest APIs filter by status/source/checksum. | API/inject | `pnpm vitest run src/modules/ingest/routes.test.ts` | ❌ Wave 0 |
| JOB-01 | Parse job creation is durable and idempotent for replay. | integration | `pnpm vitest run src/modules/parser-jobs/parser-job-lifecycle.test.ts -t "creates durable"` | ❌ Wave 0 |
| JOB-02 | Published parse request matches parser schema. | unit | `pnpm vitest run src/modules/parser-jobs/publisher.test.ts` | ❌ Wave 0 |
| JOB-03 | `parse.completed` stores terminal success and artifact reference. | unit/integration | `pnpm vitest run src/modules/parser-jobs/result-consumer.test.ts -t "completed"` | ❌ Wave 0 |
| JOB-04 | `parse.failed` stores structured failure state. | unit/integration | `pnpm vitest run src/modules/parser-jobs/result-consumer.test.ts -t "failed"` | ❌ Wave 0 |
| JOB-07 | Duplicate terminal messages are acked/ignored without duplicate side effects. | unit/integration | `pnpm vitest run src/modules/parser-jobs/result-consumer.test.ts -t "idempotent"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test`
- **Per wave merge:** targeted integration test for the touched lifecycle slice plus `pnpm run openapi:check`
- **Phase gate:** `pnpm run verify` with Compose dependencies running and Node 25 active. [VERIFIED: package.json] [VERIFIED: node --version]

### Wave 0 Gaps

- [ ] `src/modules/ingest/ingest-promotion.test.ts` - covers INGEST-01 through INGEST-05.
- [ ] `src/modules/ingest/routes.test.ts` - covers INGEST-06.
- [ ] `src/modules/parser-jobs/publisher.test.ts` - covers JOB-02.
- [ ] `src/modules/parser-jobs/result-consumer.test.ts` - covers JOB-03, JOB-04, JOB-07.
- [ ] `src/test/integration/lifecycle-fixtures.ts` - shared staging/replay/job fixtures.
- [ ] Node 25 activation step before running repo scripts. [VERIFIED: package.json] [VERIFIED: node --version]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Deferred | Shape admin routes now; final auth enforcement is Phase 6. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| V3 Session Management | No | Phase 3 has no session work. [VERIFIED: .planning/ROADMAP.md] |
| V4 Access Control | Deferred | Do not expose mutation actions; read-only operator APIs should be designed for future moderator/admin hooks. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| V5 Input Validation | Yes | Use TypeBox/Fastify schemas for query params and message payload validation. [CITED: fastify.dev/docs/latest/Reference/Validation-and-Serialization/] |
| V6 Cryptography | Yes | Treat SHA-256 checksums as integrity evidence; do not invent hashing. [VERIFIED: /home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json] |
| V10 Malicious Code | Yes | Do not parse OCAP contents or execute artifact contents in `server-2`. [VERIFIED: AGENTS.md] |
| V12 File and Resources | Yes | Store object keys and checksums only; raw replay/artifact bytes stay in S3. [VERIFIED: AGENTS.md] |

### Known Threat Patterns for Phase 3

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged parser result for unknown job | Spoofing/Tampering | Validate `job_id`, ensure it exists, update only expected states, and ack/drop unknowns according to a logged policy. [ASSUMED] |
| Duplicate redelivery creates duplicate parser results | Tampering | Use `job_id` terminal idempotency and unique/current result policy. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| Raw internal JSON leaks through operator APIs | Information Disclosure | Return evidence summaries and omit large arbitrary JSON by default. [VERIFIED: .planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md] |
| Queue overload from unbounded consumers | Denial of Service | Use manual ack and bounded prefetch; RabbitMQ docs note manual ack with prefetch bounds in-progress deliveries. [CITED: rabbitmq.com/docs/confirms] |
| SQL injection in filters | Tampering | Use parameterized `pg` queries for status/ID/source/checksum filters. [VERIFIED: src/infra/db/client.ts] [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `AGENTS.md` - project constraints, stack direction, boundaries, workflow rules.
- `.planning/PROJECT.md` - product scope and integration flow.
- `.planning/REQUIREMENTS.md` - Phase 3 requirement IDs and descriptions.
- `.planning/ROADMAP.md` - Phase 3 goal, success criteria, and slices.
- `.planning/STATE.md` - current position and blockers.
- `.planning/research/SUMMARY.md` - lifecycle reliability pitfalls.
- `.planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-CONTEXT.md` - locked Phase 3 decisions.
- `src/infra/db/migrations/0001_v1_domain_schema.sql` - current schema/enums/indexes.
- `src/infra/queue/client.ts` - existing RabbitMQ health adapter.
- `src/modules/operations/routes.ts` - current Fastify TypeBox route pattern.
- `package.json`, `vitest.config.ts` - scripts, dependency versions, coverage gate.
- `/home/afgan0r/Projects/SolidGames/replays-fetcher/docs/integration-contract.md` - fetcher/server/parser boundaries.
- `/home/afgan0r/Projects/SolidGames/replays-fetcher/.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` - adjacent ingest status.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/PROJECT.md`, `.planning/STATE.md`, `README.md` - parser worker contract and state.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-job-v1.schema.json` and `schemas/parse-result-v1.schema.json` - parser message schemas.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/crates/parser-contract/examples/parse_completed.v1.json` and `parse_failed.v1.json` - result examples.
- npm registry via `npm view` - package versions and modified timestamps.

### Secondary (MEDIUM confidence)

- PostgreSQL 18 `SELECT` docs - `FOR UPDATE SKIP LOCKED` semantics and queue-like table note: https://www.postgresql.org/docs/current/sql-select.html
- RabbitMQ acknowledgements and publisher confirms docs - manual ack and data safety: https://www.rabbitmq.com/docs/confirms
- amqplib channel API docs - confirm channel, ack/nack, prefetch: https://amqp-node.github.io/amqplib/channel_api.html
- Fastify validation/serialization docs - schema-based validation and Ajv: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- openapi-typescript docs - OpenAPI 3.0/3.1 TypeScript generation: https://openapi-ts.dev/introduction

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified from installed package metadata, npm registry, and existing code.
- Architecture: HIGH - locked by Phase 3 context and adjacent app contracts.
- Pitfalls: HIGH - directly tied to current schema, parser schemas, and RabbitMQ/PostgreSQL docs.

**Research date:** 2026-05-09  
**Valid until:** 2026-06-08 for library versions and local environment; adjacent app contract assumptions should be rechecked before implementation if `replays-fetcher` Phase 4 changes staging schema.
