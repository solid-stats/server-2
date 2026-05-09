# Phase 3: Ingest Promotion and Parser Job Lifecycle - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 14 planned new/modified files
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/modules/ingest/repository.ts` | repository | CRUD + batch claiming | `src/infra/db/migrate.ts` + `src/infra/db/migrations/0001_v1_domain_schema.sql` | partial |
| `src/modules/ingest/service.ts` | service | batch + transaction | `src/infra/db/migrate.ts` | partial |
| `src/modules/ingest/routes.ts` | route | request-response | `src/modules/operations/routes.ts` | role-match |
| `src/modules/parser-jobs/repository.ts` | repository | CRUD + event-driven state | `src/infra/db/migrate.ts` + migration lifecycle tables | partial |
| `src/modules/parser-jobs/publisher.ts` | service | event-driven pub-sub | `src/infra/queue/client.ts` | role-match |
| `src/modules/parser-jobs/consumer.ts` | service | event-driven pub-sub | `src/infra/queue/client.ts` | role-match |
| `src/modules/parser-jobs/routes.ts` | route | request-response | `src/modules/operations/routes.ts` | role-match |
| `src/infra/queue/client.ts` | adapter | pub-sub + health | `src/infra/queue/client.ts` | exact |
| `src/infra/db/client.ts` | adapter | CRUD + health | `src/infra/db/client.ts` | exact |
| `src/config/env.ts` | config | transform | `src/config/env.ts` | exact |
| `src/app.ts` | app wiring | request-response | `src/app.ts` | exact |
| `src/test/ingest*.test.ts` | test | CRUD + batch | `src/test/integration/schema.test.ts` | role-match |
| `src/test/parser-jobs*.test.ts` | test | event-driven | `src/test/integration/adapters.test.ts` | role-match |
| `src/test/app.test.ts` | test | request-response | `src/test/app.test.ts` | exact |

## Pattern Assignments

### `src/modules/ingest/repository.ts` (repository, CRUD + batch claiming)

**Analog:** `src/infra/db/migrate.ts` and `src/infra/db/migrations/0001_v1_domain_schema.sql`

**Imports and direct `pg` pattern** (`src/infra/db/migrate.ts` lines 1-8):
```typescript
import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
```

**Transaction pattern** (`src/infra/db/migrate.ts` lines 56-67):
```typescript
await pool.query("begin");
try {
  await pool.query(sql);
  await pool.query(
    "insert into schema_migrations (id, checksum) values ($1, $2)",
    [id, checksum],
  );
  await pool.query("commit");
} catch (error) {
  await pool.query("rollback");
  throw error;
}
```

**Tables to target** (`src/infra/db/migrations/0001_v1_domain_schema.sql` lines 103-138):
```sql
create table ingest_staging_records (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_replay_id text not null,
  object_key text not null,
  checksum text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  replay_timestamp timestamptz,
  status ingest_status not null default 'pending',
  promotion_evidence jsonb not null default '{}'::jsonb,
  conflict_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_replay_id),
  unique (checksum, object_key)
);

create table replays (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_replay_id text not null,
  object_key text not null,
  checksum text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  replay_timestamp timestamptz,
  rotation_id uuid references rotations(id),
  status replay_status not null default 'ready_for_parse',
  promotion_evidence jsonb not null default '{}'::jsonb,
  promoted_from_staging_id uuid references ingest_staging_records(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_replay_id),
  unique (checksum)
);
```

**Planner note:** implement pending-row claiming with `for update skip locked` inside repository methods; no existing source file has this yet, but it matches Phase 3 decision D-02.

---

### `src/modules/ingest/service.ts` (service, batch + transaction)

**Analog:** `src/infra/db/migrate.ts`

**Core service shape to copy:** expose named async functions/classes that accept dependencies, open a DB transaction, commit only after all lifecycle writes succeed, and rollback/rethrow on error. Copy the migration transaction pattern above.

**Required lifecycle unit:** in one DB transaction create/reuse `replays`, create `parse_jobs`, and update `ingest_staging_records.status`. RabbitMQ publish belongs after this transaction from durable `parse_jobs` state.

**Conflict state source** (`src/infra/db/migrations/0001_v1_domain_schema.sql` lines 3-6, 111-113):
```sql
create type ingest_status as enum ('pending', 'promoted', 'conflicted', 'failed', 'ignored');
create type parse_job_status as enum ('queued', 'published', 'running', 'succeeded', 'failed', 'retryable');

status ingest_status not null default 'pending',
promotion_evidence jsonb not null default '{}'::jsonb,
conflict_details jsonb not null default '{}'::jsonb,
```

---

### `src/modules/ingest/routes.ts` (route, request-response)

**Analog:** `src/modules/operations/routes.ts`

**Imports pattern** (`src/modules/operations/routes.ts` lines 1-6):
```typescript
import { Type } from "@sinclair/typebox";

import { type HealthCheckable, checkAll } from "../../infra/health.js";

import type { FastifyInstance } from "fastify";
import type { Registry } from "prom-client";
```

**Route options and TypeBox schema pattern** (`src/modules/operations/routes.ts` lines 8-23):
```typescript
export interface OperationsRouteOptions {
  checks: Record<string, HealthCheckable>;
  metrics: Registry;
}

const LiveResponse = Type.Object({
    status: Type.Literal("ok"),
  }),
  HealthCheckResultSchema = Type.Object({
    status: Type.Union([Type.Literal("ok"), Type.Literal("error")]),
    message: Type.Optional(Type.String()),
  }),
  ReadyResponse = Type.Object({
    status: Type.Union([Type.Literal("ready"), Type.Literal("degraded")]),
    checks: Type.Record(Type.String(), HealthCheckResultSchema),
  });
```

**OpenAPI-covered GET route pattern** (`src/modules/operations/routes.ts` lines 42-60):
```typescript
app.get(
  "/ready",
  {
    schema: {
      tags: ["operations"],
      response: {
        200: ReadyResponse,
        503: ReadyResponse,
      },
    },
  },
  async (_request, reply) => {
    const summary = await checkAll(options.checks),
      status = summary.ready ? "ready" : "degraded";
    return reply.code(summary.ready ? 200 : 503).send({
      status,
      checks: summary.checks,
    });
  },
);
```

**Apply to:** `GET /operations/ingest/staging`, `GET /operations/ingest/staging/:id`, and `GET /operations/ingest/conflicts` with `tags: ["operations"]` or `["ingest"]`. Use TypeBox query schemas for `status`, `source_system`, `source_replay_id`, `checksum`, and pagination.

---

### `src/modules/parser-jobs/repository.ts` (repository, CRUD + event-driven state)

**Analog:** lifecycle tables in `src/infra/db/migrations/0001_v1_domain_schema.sql`

**Parse job schema source** (`src/infra/db/migrations/0001_v1_domain_schema.sql` lines 151-168):
```sql
create table parse_jobs (
  id uuid primary key default gen_random_uuid(),
  replay_id uuid not null references replays(id) on delete cascade,
  parser_contract_version text not null,
  object_key text not null,
  checksum text not null,
  status parse_job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  published_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_parse_jobs_status on parse_jobs(status, created_at);
create index idx_parse_jobs_replay on parse_jobs(replay_id);
```

**Parser result placeholder target** (`src/infra/db/migrations/0001_v1_domain_schema.sql` lines 170-180):
```sql
create table parser_results (
  id uuid primary key default gen_random_uuid(),
  replay_id uuid not null references replays(id) on delete cascade,
  parse_job_id uuid references parse_jobs(id),
  parser_contract_version text not null,
  status parser_result_status not null default 'current',
  raw_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_parser_results_replay_status on parser_results(replay_id, status);
```

**Apply to:** queued-job selection, published/running/succeeded/failed/retryable transitions, idempotent terminal update by `job_id`, and artifact-reference `raw_snapshot` placeholder writes.

---

### `src/modules/parser-jobs/publisher.ts` (service, pub-sub)

**Analog:** `src/infra/queue/client.ts`

**Current queue adapter pattern** (`src/infra/queue/client.ts` lines 1-17):
```typescript
import * as amqp from "amqplib";

import type { AppConfig } from "../../config/env.js";
import type { HealthCheckResult, HealthCheckable } from "../health.js";

export function createQueueClient(config: AppConfig): HealthCheckable {
  return {
    async check(): Promise<HealthCheckResult> {
      const probe = await amqp.connect(config.rabbitmqUrl),
        channel = await probe.createChannel();
      await channel.close();
      await probe.close();
      return { status: "ok" };
    },
    close: () => Promise.resolve(),
  };
}
```

**Apply to:** extend queue infra with a real connection/channel abstraction that still implements `HealthCheckable`. Publisher should use confirm-channel semantics, publish minimal messages from durable queued `parse_jobs`, then mark jobs `published`.

**Parser request contract:** adjacent parser docs require `job_id`, `replay_id`, `object_key`, `checksum`, and `parser_contract_version`; see `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/PROJECT.md` lines 118-121 and `.planning/STATE.md` lines 183-185.

---

### `src/modules/parser-jobs/consumer.ts` (service, event-driven)

**Analog:** `src/infra/queue/client.ts` + parser lifecycle schema

**Apply to:** consume or expose handlers for `parse.completed` and `parse.failed`. Keep handler logic idempotent by `job_id`; duplicate terminal messages should not create duplicate side effects.

**Failure/completion storage targets:** `parse_jobs.status`, `parse_jobs.finished_at`, `parse_jobs.error`, and `parser_results.raw_snapshot` from migration lines 151-180.

**Adjacent parser behavior:** `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/STATE.md` lines 183-185 says the worker consumes parse requests, writes deterministic `artifacts/v3/{encoded_replay_id}/{source_sha256}.json`, publishes `parse.completed`/`parse.failed`, and acks only after confirmed result publish.

---

### `src/modules/parser-jobs/routes.ts` (route, request-response)

**Analog:** `src/modules/operations/routes.ts`

Copy the same TypeBox/OpenAPI route structure as ingest routes. Expose read-only lifecycle status only in Phase 3: list/filter jobs, job detail by `job_id`, and failure evidence. Retry/reparse actions are deferred to Phase 8.

---

### `src/app.ts` (app wiring)

**Analog:** `src/app.ts`

**Registration pattern** (`src/app.ts` lines 23-40):
```typescript
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await registerOpenApi(app);
  await registerOperationsRoutes(app, {
    checks: options.checks ?? {
      db: createStaticHealthCheck(),
      queue: createStaticHealthCheck(),
      storage: createStaticHealthCheck(),
    },
    metrics: options.metrics ?? createMetricsRegistry(),
  });

  return app;
}
```

**Apply to:** add Phase 3 route registrations after `registerOpenApi(app)` and before return. Extend `BuildAppOptions` only if tests need fake repositories/services injected.

---

### `src/config/env.ts` (config)

**Analog:** `src/config/env.ts`

**Validation pattern** (`src/config/env.ts` lines 22-39):
```typescript
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = cleanEnv(env, {
    NODE_ENV: str({
      choices: ["development", "test", "production"],
      default: "development",
    }),
    HOST: host({ default: "0.0.0.0" }),
    PORT: port({ default: 3000 }),
    LOG_LEVEL: str({ default: "info" }),
    DATABASE_URL: url(),
    RABBITMQ_URL: url(),
    S3_ENDPOINT: url(),
    S3_REGION: str({ default: "us-east-1" }),
    S3_BUCKET: str(),
    S3_ACCESS_KEY_ID: str(),
    S3_SECRET_ACCESS_KEY: str(),
    S3_FORCE_PATH_STYLE: bool({ default: true }),
  });
```

**Apply to:** parser queue names, routing keys, parser contract version, promotion batch size, and publisher batch size. Add redaction only for secret-bearing fields.

---

## Shared Patterns

### Fastify Route and OpenAPI Pattern

**Source:** `src/modules/operations/routes.ts`
**Apply to:** all Phase 3 route files.

- Use `Type.Object`, `Type.Union`, `Type.Literal`, and `Type.Record` schemas as the source of OpenAPI truth.
- Put route schemas inline with `schema.tags` and `schema.response`.
- Return via `reply.code(...).send(...)` when status can vary.
- Keep auth hooks out of Phase 3 routes but document future admin/operator shape; final authorization arrives in Phase 6.

### DB and Transaction Pattern

**Source:** `src/infra/db/migrate.ts`
**Apply to:** repositories/services that mutate staging, replay, parse job, and parser result state.

- Use `pg.Pool` and parameterized SQL.
- Use explicit `begin` / `commit` / `rollback`.
- Keep batch promotion transaction boundaries around canonical replay + parse job + staging status writes.
- Use schema constraints from migration as the first line of dedupe defense.

### Queue Adapter Pattern

**Source:** `src/infra/queue/client.ts`
**Apply to:** parser job publisher and result consumer.

- Keep queue code in `src/infra/queue` or thin service wrappers under `src/modules/parser-jobs`.
- Preserve `HealthCheckable` behavior so readiness keeps working.
- Close channels/connections explicitly.
- For Phase 3 publishing, extend from probe channels to durable publish/consume channels with publisher confirms.

### Test Pattern

**Source:** `src/test/app.test.ts`, `src/test/integration/adapters.test.ts`, `src/test/integration/schema.test.ts`
**Apply to:** Phase 3 unit and integration tests.

**Fastify inject pattern** (`src/test/app.test.ts` lines 7-17):
```typescript
test("buildApp should serve liveness when the application is built", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: "GET", url: "/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  } finally {
    await app.close();
  }
});
```

**Integration adapter pattern** (`src/test/integration/adapters.test.ts` lines 22-35):
```typescript
describe("dependency adapters", () => {
  it("checks PostgreSQL, RabbitMQ, and S3-compatible storage", async () => {
    const config = loadConfig(env),
      db = createDatabaseClient(config),
      queue = createQueueClient(config),
      storage = createStorageClient(config);

    try {
      await expect(db.check()).resolves.toMatchObject({ status: "ok" });
      await expect(queue.check()).resolves.toMatchObject({ status: "ok" });
      await expect(storage.check()).resolves.toMatchObject({ status: "ok" });
    } finally {
      await Promise.all([db.close(), queue.close(), storage.close()]);
    }
  });
});
```

**Schema inspection pattern** (`src/test/integration/schema.test.ts` lines 56-85):
```typescript
beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

describe("v1 domain schema", () => {
  it("creates all required lifecycle tables", async () => {
    const result = await pool.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1)
      `,
      [requiredTables],
    );

    expect(result.rows.map((row) => row.table_name).toSorted()).toEqual(
      requiredTables.toSorted(),
    );
  });
```

### Verification Scripts

**Source:** `package.json` lines 17-30

Run targeted scripts during implementation:

- `pnpm test` for non-integration tests.
- `pnpm run test:integration` for DB/RabbitMQ/S3 tests.
- `pnpm run openapi:check` after route/schema changes.
- `pnpm run verify` for final full gate.

## No Analog Found

No exact existing domain repository/service analog exists yet. Planner should still create repositories/services because Phase 3 needs clear boundaries, but it should copy concrete style from these partial analogs:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/modules/ingest/repository.ts` | repository | batch + CRUD | No repositories exist yet; copy direct `pg` and transaction style. |
| `src/modules/ingest/service.ts` | service | batch + transaction | No domain services exist yet; keep dependency-injected and testable. |
| `src/modules/parser-jobs/publisher.ts` | service | pub-sub | Queue client only health-checks today; extend it carefully. |
| `src/modules/parser-jobs/consumer.ts` | service | pub-sub | No consumers exist yet; use parser contract docs plus queue adapter style. |

## Metadata

**Analog search scope:** `src/app.ts`, `src/modules/operations/routes.ts`, `src/infra/db/*`, `src/infra/queue/client.ts`, `src/config/env.ts`, `src/server.ts`, `src/test/**/*.test.ts`, `package.json`, adjacent planning docs for `replays-fetcher` and `replay-parser-2`.
**Files scanned:** 22
**Pattern extraction date:** 2026-05-09
