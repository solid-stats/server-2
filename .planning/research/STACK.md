# Stack Research

**Domain:** Replay statistics backend and moderation API
**Researched:** 2026-05-09
**Confidence:** HIGH for required stack, MEDIUM for optional library choices

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24 LTS | Runtime | Active LTS line in 2026; appropriate for production TypeScript services. |
| TypeScript | 5.x | Application language | Required by the brief and keeps API/data contracts explicit. |
| Fastify | 5.x | HTTP framework | Required by the brief; good fit for schema-first validation, OpenAPI generation, and high-throughput APIs. |
| PostgreSQL | 18.x target, 17.x acceptable if hosting requires it | Primary data store | Required source of truth for canonical identity, replay metadata, jobs, stats, requests, roles, and audit. |
| RabbitMQ | 4.x | Parser/background queue | Required durable queue for parse jobs and retryable background work. |
| S3-compatible storage | Provider-specific | Replay files and attachments | Keeps large binary/object data outside PostgreSQL and supports MinIO locally. |
| Docker Compose | Current plugin | Local and v1 production orchestration | Required for local dependencies and single-VPS production deployment. |
| OpenAPI | 3.0 or 3.1 | API contract | Required source of truth for `web` TypeScript generation via `openapi-typescript`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/swagger` | 9.x+ for Fastify 5 | OpenAPI schema generation | Register route schemas once and publish OpenAPI from the running API contract. |
| `@fastify/swagger-ui` | 5.x | Local/admin API docs | Useful for developer inspection; generated schema remains the contract for `web`. |
| `openapi-typescript` | Current 7.x/8.x line | Frontend type generation | Used by `web` to generate request/response types from `server-2` OpenAPI. |
| `pg` | Current 8.x line | PostgreSQL driver | Base driver for migrations/query builders/transactions. |
| Kysely or Drizzle | Current stable | Type-safe SQL access | Prefer explicit SQL-shaped access over opaque ORM behavior for aggregate/stat workloads. |
| `amqplib` or a maintained RabbitMQ client wrapper | Current stable | RabbitMQ publishing/consuming | Use for durable parse job requests, completion/failure consumers, and retry workers. |
| `@aws-sdk/client-s3` | Current v3 | S3-compatible storage | Required for replay objects, attachments, and local MinIO compatibility. |
| `prom-client` | Current stable | Prometheus metrics | Track queue depth, job results, parser failures, and API/DB health. |
| `pino` | Fastify default-compatible | Structured logging | Keep parser/job errors searchable and correlated by `job_id`/`replay_id`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` | Run TypeScript in development | Good for local API/dev worker processes. |
| `vitest` | Unit/integration tests | Useful for formula, stats, identity merge/split, and API contract tests. |
| `testcontainers` or Docker Compose test services | Integration testing | Use for PostgreSQL/RabbitMQ/S3 flows where mocks would hide contract failures. |
| `eslint`/`prettier` or Biome | Lint/format | Pick one project-wide and enforce in CI. |
| OpenAPI schema validation in CI | Contract drift detection | Fail when public API changes without schema updates. |

## Installation

Exact package choices should be finalized during Phase 1, but the expected shape is:

```bash
npm install fastify @fastify/swagger @fastify/swagger-ui pg @aws-sdk/client-s3 prom-client
npm install amqplib
npm install -D typescript tsx vitest openapi-typescript
```

Add either Kysely/Drizzle and a migration tool once the database access pattern is selected.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Fastify | NestJS | Use Nest only if the team wants framework-level dependency injection/modules more than direct Fastify control. |
| Kysely/Drizzle | Prisma | Prisma can work, but explicit SQL/query-builder control is safer for complex aggregate/stat and migration-heavy schemas. |
| RabbitMQ | BullMQ/Redis | Redis queues are simpler, but RabbitMQ is already required and better matches parser job routing/ack semantics. |
| OpenAPI + generated frontend types | Hand-written DTO mirrors | Hand-written mirrors drift; use only for isolated internal tests. |
| S3 object storage | Database bytea/blob storage | Database blobs simplify deployment briefly but hurt backup, restore, and replay file lifecycle. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Storing replay files in PostgreSQL | Bloats backups and makes object lifecycle painful. | S3-compatible object storage with DB metadata. |
| Fire-and-forget parser messages without `parse_jobs` rows | Lost jobs and unexplainable parser gaps. | Durable job table plus RabbitMQ publish/consume state. |
| Hand-maintained frontend DTOs | They drift from backend behavior. | OpenAPI generated from route schemas and consumed by `openapi-typescript`. |
| Auth/role checks only in route handlers | Easy to miss endpoints as API grows. | Shared auth/authorization pre-handlers plus route-level policy tests. |
| Generic OAuth assumptions for Steam | Steam sign-in historically differs from standard OAuth/OIDC expectations. | Verify Steam provider protocol during auth phase and wrap it behind a narrow auth adapter. |

## Stack Patterns by Variant

**If production uses MinIO on the VPS:**
- Use the same S3 client path for local and production.
- Keep bucket/key conventions explicit: `raw/`, `attachments/`, and future processed artifacts.

**If production uses an external S3-compatible provider:**
- Keep provider config isolated behind endpoint/region/credentials settings.
- Include backup/restore docs for both PostgreSQL and object storage.

**If aggregate queries become complex early:**
- Prefer explicit SQL views/materialized tables and tested recalculation jobs.
- Avoid hiding stat logic behind an ORM abstraction that obscures generated SQL.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Fastify 5.x | Node.js 20+; Node.js 24 LTS recommended | Fastify v5 requires modern Node; Node 24 is the active LTS line. |
| `@fastify/swagger` 9.x+ | Fastify 5.x | Use Fastify schemas as the OpenAPI source. |
| PostgreSQL 18.x | Current official PostgreSQL major | Use 17.x only if deployment/provider support lags. |
| RabbitMQ 4.x | Current supported RabbitMQ series | Confirm exact patch in Docker image before pinning. |

## Sources

- https://nodejs.org/en/about/releases/ - Node.js production guidance and release schedule.
- https://github.com/nodejs/release - Node.js 24 Active LTS schedule.
- https://github.com/fastify/fastify - Fastify v5 release state.
- https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/ - Fastify v5 Node support and migration notes.
- https://github.com/fastify/fastify-swagger - `@fastify/swagger` OpenAPI support and Fastify compatibility.
- https://www.postgresql.org/ - PostgreSQL current release information.
- https://www.rabbitmq.com/release-information - RabbitMQ release/support information.
- https://github.com/openapi-ts - `openapi-typescript` project.

---
*Stack research for: replay statistics backend and moderation API*
*Researched: 2026-05-09*
