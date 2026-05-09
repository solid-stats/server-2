# Phase 1: API Foundation and Runtime Infrastructure - Research

**Researched:** 2026-05-09
**Domain:** TypeScript Fastify API foundation, local runtime infrastructure, OpenAPI contract generation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Runtime and Project Scaffold

- **D-01:** Use Node.js 24 LTS as the target runtime and TypeScript in strict mode.
- **D-02:** Use ESM unless a specific dependency forces a CommonJS boundary; isolate any such boundary behind an adapter.
- **D-03:** Use `npm` for the initial project scripts because the repo has no existing package manager lockfile and GSD workflows already assume npm-compatible commands.
- **D-04:** Scaffold with explicit entry points: `src/app.ts` for the Fastify app factory and `src/server.ts` for process startup.
- **D-05:** Use `src/config/`, `src/infra/`, `src/openapi/`, and `src/modules/` as the first structure. Keep domain modules thin in Phase 1 and leave detailed domain implementation to later phases.

### Fastify and OpenAPI

- **D-06:** Use Fastify route schemas as the source of truth for validation and OpenAPI generation.
- **D-07:** Prefer JSON Schema/TypeBox-style schemas over hand-written OpenAPI YAML so route validation, response serialization, and generated schema stay aligned.
- **D-08:** Register `@fastify/swagger` in Phase 1 and expose/export an OpenAPI 3.x document that `openapi-typescript` can consume.
- **D-09:** Do not create hand-maintained DTO mirrors for `web`; frontend typing must come from the generated OpenAPI contract.

### Infrastructure Adapters

- **D-10:** Wrap PostgreSQL, RabbitMQ, and S3-compatible storage behind narrow health-checkable adapters instead of using raw clients directly from routes.
- **D-11:** Use `pg` as the PostgreSQL driver and prefer explicit SQL-shaped access. Default planning assumption is Kysely plus explicit migrations unless Phase 1 planning finds a stronger fit.
- **D-12:** Use AWS SDK v3 S3 client with configurable endpoint/path-style behavior so local MinIO and the production S3-compatible provider share one code path.
- **D-13:** Use a RabbitMQ adapter that can later publish typed parser messages, but Phase 1 only needs connection, readiness, and configuration wiring.

### Local Development

- **D-14:** Local Docker Compose should run PostgreSQL, RabbitMQ, and MinIO or another S3-compatible service.
- **D-15:** Compose service names, ports, buckets, credentials, and DB names should be boring and documented in README/env examples as part of Phase 1.
- **D-16:** Do not depend on external managed services for local tests or local development.

### Health, Metrics, and Verification

- **D-17:** Provide a liveness endpoint that only proves the process is running and a readiness endpoint that checks configured dependencies.
- **D-18:** Add a `/metrics` baseline early, even if Phase 8 expands the metric set later.
- **D-19:** Use Vitest for unit tests and Docker Compose-backed integration checks for real PostgreSQL/RabbitMQ/S3 wiring.
- **D-20:** Phase 1 verification should prove the server starts, dependency adapters connect, OpenAPI schema is generated, and `openapi-typescript` can parse the schema.

### the agent's Discretion

- The planner may choose exact package names for migration execution, lint/format tooling, and process scripts, but must preserve the decisions above and document any deviation.
- The planner may decide whether integration checks run automatically in the default test command or through a separate documented script, based on dependency startup cost.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Steam authentication protocol details belong to Phase 6.
- Exact `replays-fetcher` staging schema/status enum belongs to Phase 3.
- Exact `replay-parser-2` message/result contract belongs to Phase 3 and Phase 4.
- Exact bounty formula belongs to Phase 4.
- Production Compose hardening and backup/restore documentation belong to Phase 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Server starts as a TypeScript Fastify application with typed configuration and structured logging. | Use Node 24 LTS, strict TypeScript, Fastify 5, Pino-compatible logger setup, and envalid-backed config. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: npm registry; CITED: https://github.com/nodejs/Release; CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| INFRA-02 | Server connects to PostgreSQL, RabbitMQ, and S3-compatible storage through health-checkable adapters. | Use `pg`/Kysely, `amqplib`, and AWS SDK v3 S3 behind narrow adapters with `check()` methods. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: npm registry; CITED: https://amqp-node.github.io/amqplib/channel_api.html; CITED: https://aws.amazon.com/about-aws/whats-new/2020/12/aws-sdk-javascript-version-3-generally-available/] |
| INFRA-03 | Local Docker Compose runs API dependencies for PostgreSQL, RabbitMQ, and S3-compatible storage. | Use Docker Compose for local PostgreSQL, RabbitMQ management image, and MinIO-compatible object storage. [VERIFIED: .planning/REQUIREMENTS.md; CITED: https://docs.docker.com/compose/; CITED: https://github.com/minio/minio; CITED: https://www.rabbitmq.com/release-information] |
| API-01 | Server publishes an OpenAPI 3.x schema endpoint or artifact. | Register `@fastify/swagger` before routes and expose a generated OpenAPI document from Fastify route schemas. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: npm registry; CITED: https://github.com/fastify/fastify-swagger] |
| API-02 | The OpenAPI schema is compatible with `openapi-typescript` generation in `web`. | Add a script that exports schema JSON and runs `openapi-typescript` against the artifact or local URL. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: npm registry; CITED: https://openapi-ts.dev/cli] |
</phase_requirements>

## Summary

Phase 1 should build a deliberately small but complete runtime spine: a strict TypeScript ESM project, a Fastify app factory, process startup, typed environment configuration, structured Pino logging, health/readiness routes, Prometheus-compatible metrics, and generated OpenAPI output. [VERIFIED: .planning/phases/01-api-foundation-and-runtime-infrastructure/01-CONTEXT.md; CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] The repo currently has no source code, package manifest, lockfile, or tests, so the planner must include Wave 0 scaffold tasks before any feature tasks. [VERIFIED: codebase scan]

The safest foundation pattern is to register `@fastify/swagger` and TypeBox-backed route schemas from day one, then have both runtime validation and OpenAPI generation flow from the same route definitions. [VERIFIED: Context7 /fastify/fastify; VERIFIED: Context7 /fastify/fastify-swagger; CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/; CITED: https://github.com/fastify/fastify-swagger] The planner should avoid domain endpoints in this phase except minimal health/OpenAPI/metrics surfaces. [VERIFIED: 01-CONTEXT.md]

**Primary recommendation:** Use Fastify 5.8.5 + TypeBox + `@fastify/swagger` 9.7.0, `pg` + Kysely for DB foundation, `amqplib` for RabbitMQ connectivity, AWS SDK v3 for S3-compatible storage, `prom-client` for `/metrics`, Vitest for tests, and Docker Compose for local PostgreSQL/RabbitMQ/MinIO. [VERIFIED: npm registry; CITED: official docs listed in Sources]

## Project Constraints (from AGENTS.md)

- `server-2` is the TypeScript backend source of truth for Solid Stats and must coordinate with `replays-fetcher`, `replay-parser-2`, and `web`. [VERIFIED: AGENTS.md]
- Use Node.js with TypeScript, Fastify, PostgreSQL, RabbitMQ, S3-compatible object storage, OpenAPI 3.x, Docker Compose, and Steam OAuth in later phases. [VERIFIED: AGENTS.md]
- OCAP parsing stays in `replay-parser-2`; raw discovery/fetching stays in `replays-fetcher`; UI stays in `web`. [VERIFIED: AGENTS.md]
- Server output/API changes must account for `web` through OpenAPI, and parser/queue/storage contract changes must account for adjacent app responsibilities. [VERIFIED: AGENTS.md]
- Do not write parser logic in `server-2`, store replay files in PostgreSQL, or create hand-maintained frontend DTO mirrors. [VERIFIED: AGENTS.md; VERIFIED: .planning/research/PITFALLS.md]
- Keep README current when scope, phase, commands, architecture, validation data, or workflow changes. [VERIFIED: AGENTS.md]
- Every completed work session must leave `git status --short` clean by committing intended results; do not discard completed work only to clean the tree. [VERIFIED: AGENTS.md]
- Work should stay inside GSD workflow unless explicitly bypassed. [VERIFIED: AGENTS.md]
- No project-local skills exist under `.codex/skills/` or `.agents/skills/`. [VERIFIED: project skill discovery]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Fastify app startup | API / Backend | Frontend Server (none) | Process lifecycle, route registration, and dependency injection belong to the backend API service. [VERIFIED: 01-CONTEXT.md] |
| Typed configuration | API / Backend | OS / Runtime env | The API process owns env parsing and typed config; Docker Compose only supplies values. [VERIFIED: 01-CONTEXT.md] |
| Structured logging | API / Backend | Observability stack | Fastify uses Pino-compatible logging and should emit JSON logs from API/runtime decisions. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| PostgreSQL adapter | API / Backend | Database / Storage | The backend owns DB connection pooling and health checks; PostgreSQL owns persistence. [VERIFIED: 01-CONTEXT.md] |
| RabbitMQ adapter | API / Backend | Queue service | The backend owns AMQP connection/readiness wrappers; RabbitMQ owns message delivery. [CITED: https://amqp-node.github.io/amqplib/channel_api.html] |
| S3-compatible adapter | API / Backend | Object storage | The backend owns bucket/key checks and SDK config; object storage owns replay/attachment bytes. [VERIFIED: AGENTS.md; CITED: https://github.com/minio/minio] |
| OpenAPI schema | API / Backend | Web client | Server route schemas generate the contract; `web` consumes generated TypeScript types. [VERIFIED: 01-CONTEXT.md; CITED: https://openapi-ts.dev/cli] |
| Local dependency stack | Developer Runtime | API / Backend | Compose creates local services; API config points to service names/ports. [CITED: https://docs.docker.com/compose/] |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | 24.x LTS target | Runtime | Node 24 is Active LTS through 2026-10-20 and EOL 2028-04-30. [CITED: https://github.com/nodejs/Release] |
| TypeScript | 5.9.3 pin recommended | Strict application language | AGENTS/research specify TypeScript 5.x; npm registry shows 5.9.3 as latest 5.x while 6.0.3 exists. [VERIFIED: AGENTS.md; VERIFIED: npm registry] |
| Fastify | 5.8.5 | HTTP framework | Phase decisions require Fastify; v5 supports Node 20+ and requires full JSON schemas. [VERIFIED: npm registry; CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| `@sinclair/typebox` | 0.34.49 | JSON Schema + TypeScript schema authoring | Matches the phase decision to use TypeBox-style schemas and Fastify type providers. [VERIFIED: npm registry; CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/] |
| `@fastify/type-provider-typebox` | 6.1.0 | Type inference from TypeBox schemas | Official Fastify type-provider package for TypeBox. [VERIFIED: npm registry; CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/] |
| `@fastify/swagger` | 9.7.0 | OpenAPI generation | Version >=9.x is compatible with Fastify 5.x and generates OpenAPI from route schemas. [VERIFIED: npm registry; CITED: https://github.com/fastify/fastify-swagger] |
| `pg` | 8.20.0 | PostgreSQL driver | Locked decision D-11 requires `pg`. [VERIFIED: npm registry; VERIFIED: 01-CONTEXT.md] |
| Kysely | 0.29.0 | Type-safe SQL builder and migrations | Fits explicit SQL-shaped access; Context7 documents `PostgresDialect` and `Migrator`. [VERIFIED: npm registry; VERIFIED: Context7 /kysely-org/kysely] |
| `amqplib` | 1.0.7 | RabbitMQ client | RabbitMQ official JavaScript tutorial uses amqplib connection/channel flow. [VERIFIED: npm registry; CITED: https://www.rabbitmq.com/tutorials/tutorial-one-javascript] |
| `@aws-sdk/client-s3` | 3.1045.0 | S3-compatible client | AWS SDK v3 is modular and TypeScript-first; phase requires AWS SDK v3 path. [VERIFIED: npm registry; CITED: https://aws.amazon.com/about-aws/whats-new/2020/12/aws-sdk-javascript-version-3-generally-available/] |
| `prom-client` | 15.1.3 | Prometheus metrics | Provides Node.js Prometheus metrics primitives for `/metrics`. [VERIFIED: npm registry; VERIFIED: Context7 /siimon/prom-client] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/swagger-ui` | 5.2.6 | Local API docs UI | Use for developer inspection, while JSON schema artifact remains the `web` contract. [VERIFIED: npm registry; CITED: https://github.com/fastify/fastify-swagger] |
| `openapi-typescript` | 7.13.0 | Schema-to-TypeScript verification | Use in Phase 1 verification to prove the OpenAPI artifact is consumable. [VERIFIED: npm registry; CITED: https://openapi-ts.dev/cli] |
| `pino` | 10.3.1 | Structured logger | Fastify logging is Pino-compatible; Fastify v5 uses `loggerInstance` for custom logger instances. [VERIFIED: npm registry; CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| `envalid` | 8.1.1 | Typed env validation | Use for concise runtime env parsing until a project-wide config package emerges. [VERIFIED: npm registry] |
| `tsx` | 4.21.0 | TypeScript dev runner | Use for local `dev`, `start`, and OpenAPI export scripts before build output exists. [VERIFIED: npm registry] |
| `vitest` | 4.1.5 | Unit/integration test runner | Phase decision D-19 explicitly selects Vitest. [VERIFIED: npm registry; VERIFIED: 01-CONTEXT.md] |
| `eslint` | 10.3.0 | Linting | Use with TypeScript rules if planner chooses ESLint over Biome. [VERIFIED: npm registry] |
| `prettier` | 3.8.3 | Formatting | Use with ESLint if selected; keep one formatter authoritative. [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeScript 5.9.3 | TypeScript 6.0.3 | TS 6 is current on npm, but AGENTS/stack direction says TypeScript 5.x; planner should avoid changing that without an explicit decision. [VERIFIED: npm registry; VERIFIED: AGENTS.md] |
| TypeBox provider | Zod provider | Zod provider exists but is third-party in Fastify docs; TypeBox aligns with locked decision D-07. [CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/; VERIFIED: 01-CONTEXT.md] |
| Kysely migrations | node-pg-migrate / dbmate | Kysely keeps SQL-shaped access and migrations in one TS stack; external migration tools can be chosen later if planner wants raw SQL migration files. [VERIFIED: Context7 /kysely-org/kysely; ASSUMED] |
| MinIO | LocalStack S3 | MinIO is lighter for object storage-only local dev; LocalStack is broader but over-scoped for Phase 1. [CITED: https://github.com/minio/minio; ASSUMED] |

**Installation:**

```bash
npm install fastify @fastify/swagger @fastify/swagger-ui @fastify/type-provider-typebox @sinclair/typebox pg kysely amqplib @aws-sdk/client-s3 prom-client pino envalid dotenv
npm install -D typescript@5.9.3 @types/node @types/pg @types/amqplib tsx vitest openapi-typescript eslint @typescript-eslint/parser prettier
```

**Version verification:** Versions above were checked with `npm view <package> version time.modified` on 2026-05-09. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Developer / CI
  -> npm scripts
  -> Docker Compose
     -> PostgreSQL
     -> RabbitMQ
     -> MinIO-compatible S3

API process
  -> src/server.ts
     -> load typed config
     -> create logger
     -> create infra adapters
     -> buildFastifyApp()
        -> register swagger before routes
        -> register health / readiness / metrics routes
        -> register minimal module routes
     -> listen

Requests
  GET /live  -> process-only liveness
  GET /ready -> db.check + queue.check + storage.check -> healthy/degraded
  GET /metrics -> prom-client registry
  GET /openapi.json or export script -> fastify.swagger() -> openapi-typescript check
```

### Recommended Project Structure

```text
src/
├── app.ts                    # Fastify app factory; no process listen
├── server.ts                 # process startup, signal handling, listen
├── config/
│   ├── env.ts                # env parsing and typed AppConfig
│   └── config.test.ts
├── infra/
│   ├── db/                   # pg pool, Kysely instance, db health
│   ├── queue/                # amqplib connection/channel health
│   ├── storage/              # S3 client, bucket health
│   ├── metrics/              # prom-client registry and route
│   └── logging/              # Pino/logger options
├── modules/
│   └── operations/           # live/ready/metrics routes for Phase 1
├── openapi/
│   ├── register-openapi.ts   # @fastify/swagger setup
│   └── export-openapi.ts     # writes generated schema artifact
└── test/
    ├── app.test.ts
    └── integration/          # compose-backed adapter checks
```

### Pattern 1: App Factory + Process Entrypoint

**What:** `src/app.ts` exports a `buildApp(deps)` factory; `src/server.ts` loads real config/deps and calls `listen`. [VERIFIED: 01-CONTEXT.md]
**When to use:** Always; it lets tests instantiate the Fastify app without binding a port. [ASSUMED]

```typescript
// Source: phase decision D-04 + Fastify app factory pattern [VERIFIED: 01-CONTEXT.md; ASSUMED]
export async function buildApp(deps: AppDeps) {
  const app = Fastify({ loggerInstance: deps.logger }).withTypeProvider<TypeBoxTypeProvider>();
  await registerOpenApi(app, deps.config);
  await app.register(operationsRoutes, deps);
  return app;
}
```

### Pattern 2: Full JSON Schema / TypeBox Route Schemas

**What:** Define full JSON schemas for params, query, body, and responses; use TypeBox provider for TypeScript inference. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/; CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/]
**When to use:** All routes, including health and OpenAPI-covered operation routes. [VERIFIED: 01-CONTEXT.md]

```typescript
// Source: Fastify Type Providers docs [CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/]
const ReadyResponse = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("degraded")]),
  checks: Type.Record(Type.String(), Type.Boolean()),
});

app.get("/ready", {
  schema: {
    tags: ["operations"],
    response: { 200: ReadyResponse, 503: ReadyResponse },
  },
}, async (_request, reply) => {
  const checks = await deps.health.checkAll();
  return reply.code(checks.ready ? 200 : 503).send(checks.body);
});
```

### Pattern 3: Health-Checkable Adapter Interface

**What:** Each infra adapter exposes a bounded `check()` method plus `close()`; routes never reach into raw clients. [VERIFIED: 01-CONTEXT.md]
**When to use:** PostgreSQL, RabbitMQ, S3-compatible storage, and later parser/job adapters. [VERIFIED: 01-CONTEXT.md]

```typescript
// Source: phase decision D-10 [VERIFIED: 01-CONTEXT.md]
export interface HealthCheckable {
  check(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }>;
  close(): Promise<void>;
}
```

### Pattern 4: Generated OpenAPI Artifact Verification

**What:** Register `@fastify/swagger` before routes, wait for `app.ready()`, call `app.swagger()`, write JSON, then run `openapi-typescript`. [VERIFIED: Context7 /fastify/fastify-swagger; CITED: https://github.com/fastify/fastify-swagger; CITED: https://openapi-ts.dev/cli]
**When to use:** Phase 1 verification and every later API schema change. [VERIFIED: 01-CONTEXT.md]

```typescript
// Source: @fastify/swagger docs [CITED: https://github.com/fastify/fastify-swagger]
await app.ready();
const schema = app.swagger();
await writeFile("openapi/server-2.openapi.json", JSON.stringify(schema, null, 2));
```

### Anti-Patterns to Avoid

- **Registering Swagger after routes:** Dynamic OpenAPI generation depends on route registration order; register `@fastify/swagger` before route modules. [VERIFIED: Context7 /fastify/fastify-swagger]
- **Using Fastify v4 schema shorthand:** Fastify v5 requires full JSON schemas with `type` properties for request/response schemas. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/]
- **Raw clients in routes:** Routes should call adapter/service methods, not `pg`, AMQP, or S3 clients directly. [VERIFIED: 01-CONTEXT.md]
- **One health endpoint for all meanings:** Keep `/live` process-only and `/ready` dependency-aware. [VERIFIED: 01-CONTEXT.md]
- **Handwritten OpenAPI YAML:** Locked decision D-07 rejects hand-maintained OpenAPI as the source of truth. [VERIFIED: 01-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP routing, validation, serialization | Custom HTTP server/router | Fastify route schemas | Fastify v5 integrates schema validation, serialization, typing, and plugin lifecycle. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| Schema-to-OpenAPI conversion | Manual OpenAPI YAML mirrors | `@fastify/swagger` | It generates OpenAPI from route schemas and is compatible with Fastify 5 via v9.x. [CITED: https://github.com/fastify/fastify-swagger] |
| Type-safe route schema inference | Separate DTO interfaces | TypeBox + Fastify type provider | Fastify type providers infer route types from inline schemas. [CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/] |
| PostgreSQL pooling/protocol | Custom TCP/Postgres layer | `pg` and Kysely `PostgresDialect` | `pg` is the driver locked by decision D-11; Kysely integrates with `pg.Pool`. [VERIFIED: 01-CONTEXT.md; VERIFIED: Context7 /kysely-org/kysely] |
| RabbitMQ protocol handling | Custom AMQP frames | `amqplib` | Official RabbitMQ JS tutorial uses amqplib connection/channel APIs. [CITED: https://www.rabbitmq.com/tutorials/tutorial-one-javascript] |
| S3 signatures/client behavior | Custom HTTP signing | AWS SDK v3 S3 client | AWS SDK v3 is modular and TypeScript-first. [CITED: https://aws.amazon.com/about-aws/whats-new/2020/12/aws-sdk-javascript-version-3-generally-available/] |
| Metrics exposition | Custom Prometheus text formatting | `prom-client` | Avoid subtle format/registry mistakes. [VERIFIED: npm registry; VERIFIED: Context7 /siimon/prom-client] |

**Key insight:** Phase 1 is mostly integration contract plumbing; custom implementations increase drift and hide failure modes without delivering product value. [ASSUMED]

## Common Pitfalls

### Pitfall 1: OpenAPI Exists but Is Not the Runtime Contract

**What goes wrong:** `web` consumes types that do not match the API. [VERIFIED: .planning/research/PITFALLS.md]
**Why it happens:** Developers maintain schema/docs separately from route validation. [VERIFIED: .planning/research/PITFALLS.md]
**How to avoid:** Generate OpenAPI from Fastify route schemas and run `openapi-typescript` in verification. [VERIFIED: 01-CONTEXT.md; CITED: https://openapi-ts.dev/cli]
**Warning signs:** Response schemas are missing, DTO interfaces appear under `web`, or schema export requires manual editing. [ASSUMED]

### Pitfall 2: Fastify v5 Schema Shorthand Breaks Validation/OpenAPI

**What goes wrong:** Route schemas written in older shorthand fail or generate incomplete OpenAPI. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/]
**Why it happens:** Fastify v4 examples often omit full JSON Schema object shape. [ASSUMED]
**How to avoid:** Always use TypeBox `Type.Object(...)` or full JSON schemas with `type`, `properties`, and `required`. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/; CITED: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/]
**Warning signs:** `querystring: { foo: { type: "string" } }` rather than `querystring: { type: "object", ... }`. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/]

### Pitfall 3: Readiness Checks Hang Startup or Requests

**What goes wrong:** `/ready` blocks indefinitely when DB/RabbitMQ/S3 is unavailable. [ASSUMED]
**Why it happens:** Adapter health checks lack timeout and cancellation. [ASSUMED]
**How to avoid:** Add per-adapter timeouts, return 503 with structured check results, and log failure reasons without secrets. [VERIFIED: observability skill; ASSUMED]
**Warning signs:** Health routes await raw network calls with no deadline. [ASSUMED]

### Pitfall 4: Local Compose Values Drift from App Config

**What goes wrong:** Compose starts services but app env points to wrong ports, bucket names, vhost, or credentials. [ASSUMED]
**Why it happens:** `.env.example`, Docker Compose, README, and config defaults are edited independently. [ASSUMED]
**How to avoid:** Define boring service names and mirror them in `.env.example`, README, and integration test scripts. [VERIFIED: 01-CONTEXT.md]
**Warning signs:** Integration docs require ad hoc export commands after `docker compose up`. [ASSUMED]

### Pitfall 5: RabbitMQ Health Check Mutates Production State

**What goes wrong:** Health checks create unexpected queues/exchanges or alter queue arguments. [ASSUMED]
**Why it happens:** `assertQueue` is idempotent only with identical arguments; mismatched properties can break the channel. [CITED: https://amqp-node.github.io/amqplib/channel_api.html]
**How to avoid:** For readiness, connect/create a channel and either `checkQueue` a known configured queue or use a dedicated health queue with stable arguments. [ASSUMED; CITED: https://amqp-node.github.io/amqplib/channel_api.html]
**Warning signs:** `/ready` declares parser queues with incomplete or changing options. [ASSUMED]

## Code Examples

### Typed Config Shape

```typescript
// Source: envalid package selected from npm registry; exact validators are planner-owned. [VERIFIED: npm registry]
export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
};
```

### PostgreSQL Adapter Health

```typescript
// Source: pg + Kysely pattern [VERIFIED: npm registry; VERIFIED: Context7 /kysely-org/kysely]
export async function checkPostgres(pool: Pool) {
  const result = await pool.query("select 1 as ok");
  return { ok: result.rows[0]?.ok === 1 };
}
```

### RabbitMQ Adapter Health

```typescript
// Source: amqplib connection/channel APIs [CITED: https://www.rabbitmq.com/tutorials/tutorial-one-javascript]
export async function checkRabbit(connection: amqp.Connection) {
  const channel = await connection.createChannel();
  try {
    return { ok: true };
  } finally {
    await channel.close();
  }
}
```

### S3 Bucket Health

```typescript
// Source: AWS SDK v3 S3 client selection [CITED: https://aws.amazon.com/about-aws/whats-new/2020/12/aws-sdk-javascript-version-3-generally-available/]
export async function checkStorage(client: S3Client, bucket: string) {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  return { ok: true };
}
```

### OpenAPI Verification Command

```bash
# Source: openapi-typescript CLI docs [CITED: https://openapi-ts.dev/cli]
npm run openapi:export
npx openapi-typescript openapi/server-2.openapi.json -o /tmp/server-2-openapi.d.ts
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fastify v4 allowed schema shorthand for some route parts | Fastify v5 requires full JSON Schema for `querystring`, `params`, `body`, and response schemas | Fastify v5 migration | Planner must require TypeBox/full JSON schemas in every route. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| Passing custom Pino instance as `logger` | Fastify v5 uses `loggerInstance` for a custom logger | Fastify v5 migration | Use `loggerInstance` if constructing Pino separately. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| `@fastify/swagger` 7/8 with older Fastify | `@fastify/swagger` >=9.x for Fastify 5 | Plugin compatibility table | Use `@fastify/swagger` 9.7.0. [VERIFIED: npm registry; CITED: https://github.com/fastify/fastify-swagger] |
| `openapi-typescript` globbing | `redocly.yaml` for multiple schemas; direct input for single schema | v7 docs | Phase 1 can use direct single-schema command; later multiple schemas should use Redocly config. [CITED: https://openapi-ts.dev/cli] |
| Node 22 LTS as active LTS | Node 24 is Active LTS; Node 22 is Maintenance LTS | Node release schedule | Target Node 24 even though local machine currently has Node 22. [CITED: https://github.com/nodejs/Release; VERIFIED: environment audit] |

**Deprecated/outdated:**
- Fastify v4 schema shorthand examples: do not copy into Phase 1. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/]
- Hand-maintained DTO mirrors for `web`: explicitly forbidden by D-09. [VERIFIED: 01-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Kysely migrations are sufficient for early migration needs without a separate migration CLI. | Standard Stack | Planner may need to swap in node-pg-migrate/dbmate if raw SQL migration ergonomics are preferred. |
| A2 | MinIO is lighter than LocalStack for object-storage-only local development. | Alternatives Considered | Planner may pick LocalStack if cross-AWS emulation becomes useful. |
| A3 | App factory tests should instantiate Fastify without binding a port. | Architecture Patterns | Low; this is a common testability pattern but not directly prescribed by docs. |
| A4 | Health checks need explicit timeouts. | Common Pitfalls | Medium; missing timeouts can hang readiness under dependency failure. |
| A5 | RabbitMQ readiness should avoid mutating parser queues. | Common Pitfalls | Medium; queue checks may need a dedicated stable health queue. |

## Open Questions

1. **Should Phase 1 pin TypeScript 5.9.3 or adopt current TypeScript 6.0.3?**
   - What we know: AGENTS and existing stack research say TypeScript 5.x; npm shows TypeScript 6.0.3 current and 5.9.3 as latest 5.x. [VERIFIED: AGENTS.md; VERIFIED: npm registry]
   - What's unclear: Whether the project wants to update the stack direction immediately. [ASSUMED]
   - Recommendation: Pin `typescript@5.9.3` in Phase 1 to honor AGENTS, and revisit TS 6 in a dependency-upgrade phase. [ASSUMED]

2. **Which migration style should Phase 1 establish?**
   - What we know: D-11 defaults to Kysely plus explicit migrations unless planning finds a stronger fit. [VERIFIED: 01-CONTEXT.md]
   - What's unclear: Whether future domain schema work prefers raw SQL migration files for reviewability. [ASSUMED]
   - Recommendation: Use Kysely `Migrator` now, but keep migrations in isolated files and avoid hiding complex SQL later. [VERIFIED: Context7 /kysely-org/kysely; ASSUMED]

3. **Should integration checks run in default `npm test`?**
   - What we know: D-19 requires Vitest plus Docker Compose-backed checks; D-20 requires proving real connectivity. [VERIFIED: 01-CONTEXT.md]
   - What's unclear: Whether dependency startup cost is acceptable in default tests. [ASSUMED]
   - Recommendation: Make `npm test` fast unit/contract checks and add `npm run test:integration` for Compose-backed adapters. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runtime, npm scripts | Wrong version | v22.16.0 | Install/use Node 24 via nvm/asdf/Volta before runtime verification. [VERIFIED: environment audit] |
| npm | Package management | Yes | 10.9.2 | None needed. [VERIFIED: environment audit] |
| Docker Engine | Local Compose dependencies | Yes | 20.10.17 | Upgrade recommended if image manifest/pull issues appear. [VERIFIED: environment audit] |
| Docker Compose plugin | Local dependency orchestration | Yes, old | v2.6.0 | Upgrade recommended; Compose works but is old. [VERIFIED: environment audit; CITED: https://docs.docker.com/compose/] |
| PostgreSQL CLI | DB troubleshooting | Yes | psql 14.22 | Docker Compose will provide PostgreSQL service. [VERIFIED: environment audit] |
| Local PostgreSQL service | Adapter connectivity | No response on default socket | — | Use Compose service. [VERIFIED: environment audit] |
| RabbitMQ CLI | Queue troubleshooting | Present but not usable as current user | — | Use RabbitMQ management UI/API from Compose. [VERIFIED: environment audit] |
| AWS CLI | S3 troubleshooting | No | — | Use SDK integration tests; optional install later. [VERIFIED: environment audit] |
| MinIO `mc` CLI | S3 troubleshooting/bucket setup | No | — | Use Compose init container or SDK setup script. [VERIFIED: environment audit] |

**Missing dependencies with no fallback:**
- Node 24 target runtime is not currently active; planner must include environment setup or use a Node 24 Docker/runtime path before claiming INFRA-01 verification. [VERIFIED: environment audit; CITED: https://github.com/nodejs/Release]

**Missing dependencies with fallback:**
- AWS CLI and MinIO `mc` are missing; planner can use AWS SDK calls or a Compose init container for bucket setup. [VERIFIED: environment audit]
- Local DB/RabbitMQ/S3 services are not running; Compose is the intended fallback and part of the phase. [VERIFIED: 01-CONTEXT.md]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 [VERIFIED: npm registry] |
| Config file | none yet — Wave 0 must create `vitest.config.ts` or rely on package script defaults. [VERIFIED: codebase scan] |
| Quick run command | `npm test` [ASSUMED] |
| Full suite command | `npm run test:integration` after `docker compose up -d postgres rabbitmq minio` [ASSUMED; VERIFIED: 01-CONTEXT.md] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| INFRA-01 | App factory builds and server startup uses typed config/logger | unit/smoke | `npm test -- src/app.test.ts` | No, Wave 0. [VERIFIED: codebase scan] |
| INFRA-02 | DB, queue, and storage adapters return health from real services | integration | `npm run test:integration -- adapter` | No, Wave 0. [VERIFIED: codebase scan] |
| INFRA-03 | Compose starts PostgreSQL, RabbitMQ, and S3-compatible storage | integration/smoke | `docker compose up -d && npm run infra:check` | No, Wave 0. [VERIFIED: codebase scan] |
| API-01 | OpenAPI JSON endpoint/artifact exists | unit/contract | `npm run openapi:export` | No, Wave 0. [VERIFIED: codebase scan] |
| API-02 | `openapi-typescript` can consume generated schema | contract | `npx openapi-typescript openapi/server-2.openapi.json -o /tmp/server-2-openapi.d.ts` | No, Wave 0. [CITED: https://openapi-ts.dev/cli] |

### Sampling Rate

- **Per task commit:** `npm test` once scaffold exists. [ASSUMED]
- **Per wave merge:** `npm test && npm run openapi:check`. [ASSUMED]
- **Phase gate:** `npm test`, Compose-backed adapter checks, server start smoke, and OpenAPI generation through `openapi-typescript`. [VERIFIED: 01-CONTEXT.md]

### Wave 0 Gaps

- [ ] `package.json` — npm scripts, ESM type, engines Node 24. [VERIFIED: codebase scan]
- [ ] `tsconfig.json` — strict TypeScript config. [VERIFIED: codebase scan]
- [ ] `vitest.config.ts` — test setup. [VERIFIED: codebase scan]
- [ ] `src/app.ts` and `src/server.ts` — app factory and startup. [VERIFIED: codebase scan]
- [ ] `docker-compose.yml` — PostgreSQL/RabbitMQ/S3-compatible services. [VERIFIED: codebase scan]
- [ ] `.env.example` — Compose-aligned local env values. [VERIFIED: codebase scan]
- [ ] `openapi/` output folder or generated artifact path. [VERIFIED: codebase scan]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No for Phase 1 | Auth deferred to Phase 6; do not add placeholder auth semantics in Phase 1. [VERIFIED: 01-CONTEXT.md] |
| V3 Session Management | No for Phase 1 | Sessions deferred to Phase 6. [VERIFIED: 01-CONTEXT.md] |
| V4 Access Control | Minimal | Keep operations endpoints non-sensitive in local MVP; later admin/moderation routes need shared auth hooks. [VERIFIED: .planning/REQUIREMENTS.md; ASSUMED] |
| V5 Input Validation | Yes | Fastify route schemas and TypeBox/full JSON Schema validation. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/; CITED: https://owasp-aasvs.readthedocs.io/en/latest/v5.html] |
| V6 Cryptography | Minimal | Do not hand-roll crypto; use TLS/secret handling in later deployment/auth phases. [ASSUMED] |
| V7 Error Handling and Logging | Yes | Structured logs, sanitized error responses, no secrets in config/readiness logs. [VERIFIED: observability skill; ASSUMED] |
| V9 Communications | Local only in Phase 1 | Local Compose may use plaintext; production TLS is deferred to Phase 8. [VERIFIED: 01-CONTEXT.md] |
| V12 Files and Resources | Yes, narrow | S3 adapter must check bucket access without exposing object contents. [VERIFIED: 01-CONTEXT.md] |
| V13 API and Web Service | Yes | OpenAPI contract, honest status codes, standard error shape. [VERIFIED: api-design skill; ASSUMED] |
| V14 Configuration | Yes | Typed env validation and no managed-service dependency for local dev. [VERIFIED: 01-CONTEXT.md; CITED: https://devguide.owasp.org/es/06-verification/01-guides/03-asvs/] |

### Known Threat Patterns for Fastify Runtime Foundation

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invalid input reaches handlers | Tampering | Full JSON Schema validation on all request parts. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| Prototype pollution via params/query assumptions | Tampering | Use Fastify v5, avoid inherited-property assumptions, validate schema. [CITED: https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/] |
| Secret leakage in logs/readiness | Information Disclosure | Structured logs with explicit fields; never log full env, URLs with credentials, access keys, or request bodies. [VERIFIED: observability skill; ASSUMED] |
| OpenAPI publishes internal routes unintentionally | Information Disclosure | Tag route schemas intentionally and hide internal routes when needed via swagger transform/config. [VERIFIED: Context7 /fastify/fastify-swagger; ASSUMED] |
| Dependency outage blocks process shutdown | Denial of Service | Implement adapter `close()` and signal handling in `src/server.ts`. [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/01-api-foundation-and-runtime-infrastructure/01-CONTEXT.md` - locked decisions, boundary, and verification expectations.
- `.planning/REQUIREMENTS.md` - INFRA/API requirement definitions and traceability.
- `.planning/ROADMAP.md` - Phase 1 goal, success criteria, and plan breakdown.
- `.planning/STATE.md` - current project state and open concerns.
- `AGENTS.md` - project constraints and cross-application boundaries.
- `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` - prior project research.
- npm registry via `npm view` - package versions and publish metadata.
- Context7 `/fastify/fastify` - route schemas, TypeScript, type providers.
- Context7 `/fastify/fastify-swagger` - OpenAPI registration and `fastify.swagger()`.
- Context7 `/kysely-org/kysely` - PostgreSQL dialect and migration provider.
- https://github.com/nodejs/Release - Node 24 LTS schedule.
- https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/ - Fastify v5 requirements and logger behavior.
- https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/ - TypeBox provider pattern.
- https://github.com/fastify/fastify-swagger - `@fastify/swagger` compatibility and OpenAPI usage.
- https://openapi-ts.dev/cli - `openapi-typescript` CLI.
- https://www.rabbitmq.com/release-information - RabbitMQ release series.
- https://www.rabbitmq.com/tutorials/tutorial-one-javascript - RabbitMQ JavaScript/amqplib flow.
- https://amqp-node.github.io/amqplib/channel_api.html - AMQP connection/channel behavior.
- https://docs.docker.com/compose/ - Docker Compose purpose.
- https://github.com/minio/minio - S3-compatible MinIO object storage.

### Secondary (MEDIUM confidence)

- https://www.postgresql.org/about/news/postgresql-18-released-3142/ - PostgreSQL 18 release and observability improvements.
- https://aws.amazon.com/about-aws/whats-new/2020/12/aws-sdk-javascript-version-3-generally-available/ - AWS SDK v3 modular/TypeScript support.
- OWASP ASVS references for security category mapping.

### Tertiary (LOW confidence)

- Assumptions in the Assumptions Log, especially migration tool finality and health-check timeout conventions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - locked by phase context and verified against npm/official docs.
- Architecture: HIGH - phase is scaffold-only and existing project research gives clear boundaries.
- Pitfalls: MEDIUM-HIGH - OpenAPI/Fastify pitfalls are verified; health timeout and local Compose drift are experience-based assumptions.

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 for npm package versions; re-check before implementation if planning is delayed.
