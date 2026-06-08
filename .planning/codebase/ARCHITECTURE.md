<!-- refreshed: 2026-06-08 -->
# Architecture

**Analysis Date:** 2026-06-08

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    HTTP API (Fastify 5)                       │
│  Route plugins per module, TypeBox schemas, OpenAPI contract │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│   auth   │  ingest  │ requests │  admin   │  public-stats   │
│ `auth/`  │`ingest/` │`requests`│`admin/`  │ `public-stats/` │
│          │          │          │          │ + operations    │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────────┬────────┘
     │          │          │          │              │
     ▼          ▼          ▼          ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│        Ports (interfaces) + Adapters (Pg* / InMemory*)       │
│  ReadModel / Repository / Store interfaces per module        │
│  `*/repository.ts`, `*/routes/postgres.ts`, `*/memory.ts`    │
└──────────┬──────────────────────────────────────┬───────────┘
           │                                       │
           ▼                                       ▼
┌──────────────────────────┐      ┌──────────────────────────────┐
│  Infra clients           │      │  Background runtime           │
│  `src/infra/`            │      │  `ingest/runtime.ts`          │
│  db / queue / storage /  │      │  IntervalTask polling +       │
│  logging / metrics       │      │  RabbitMQ consumers           │
└──────────┬───────────────┘      └──────────────┬───────────────┘
           │                                      │
           ▼                                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL (source of truth) · RabbitMQ · S3-compatible      │
│  `infra/db` (pg Pool) · `infra/queue` · `infra/storage`       │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App composition root | Wires routes + default (in-memory) adapters | `src/app.ts` |
| Production entry / DI wiring | Builds Pg adapters, infra clients, runtime, lifecycle | `src/server.ts` |
| Config loader | Validates env via envalid, typed `AppConfig` | `src/config/env.ts` |
| Auth module | Steam OpenID sign-in, sessions, role guards | `src/modules/auth/` |
| Ingest module | Staging promotion, parse-job orchestration, publishing | `src/modules/ingest/` |
| Requests module | Player requests, moderation, workflows, audit patches | `src/modules/requests/` |
| Admin module | Rotation management | `src/modules/admin/` |
| Public-stats module | Public read API, pagination, sitemap, slugs | `src/modules/public-stats/` |
| Statistics engine | Aggregate/bounty/commander calc, recalculation, readiness | `src/modules/statistics/` |
| Operations | Health, metrics endpoints | `src/modules/operations/routes.ts` |
| Infra | db pool, RabbitMQ, S3 client, logger, prom-client registry | `src/infra/` |
| OpenAPI | Schema registration + export/verify scripts | `src/openapi/` |
| Ops CLI scripts | Backup/boundary checks, recalc, readiness, legacy export | `src/operations/` |

## Pattern Overview

**Overall:** Modular monolith with Ports & Adapters (hexagonal) and a schema-first Fastify HTTP layer.

**Key Characteristics:**
- Each feature is a self-contained `src/modules/<name>` slice (routes + ports + adapters + tests).
- Every external dependency is hidden behind a TypeScript interface (port). Two adapter implementations exist: `InMemory*` (used by `buildApp` defaults and unit/route tests) and `Pg*`/infra-backed (wired only in `src/server.ts`).
- `buildApp(options)` is a pure composition root that accepts adapters via options; `server.ts` is the only place that touches real PostgreSQL, RabbitMQ, and S3.
- Schema-first: routes declare TypeBox schemas via `@fastify/type-provider-typebox`; OpenAPI is generated from those schemas and is the contract for `web`.
- Direct, explicit SQL in repositories (pg `Pool`/`PoolClient`), not ORM-mapped entities.

## Layers

**HTTP / Route layer:**
- Purpose: validate input (TypeBox), enforce auth, map to ports, shape responses
- Location: `src/modules/*/routes/*.ts`
- Contains: `register<Module>Routes(app, options)` plugin functions, schemas, role pre-handlers
- Depends on: module ports (interfaces), `auth/routes/authorization.ts`
- Used by: `src/app.ts`

**Port layer (interfaces):**
- Purpose: define module contracts (`ReadModel`, `Repository`, `Store`, command models)
- Location: declared in `routes/routes.ts`, `routes/models.ts`, `types.ts` per module
- Depends on: domain types only
- Used by: routes + adapters

**Adapter layer:**
- Purpose: implement ports against real or fake backends
- Location: `*/repository.ts`, `*/repository/repository.ts`, `routes/postgres.ts`, `routes/memory.ts`
- Depends on: `src/infra/*` (Pg adapters) or nothing (in-memory)
- Used by: `src/server.ts` (Pg), `src/app.ts` defaults (in-memory)

**Domain / calculation layer:**
- Purpose: pure stat formulas (bounty, commander, aggregates, parity)
- Location: `src/modules/statistics/{bounty,service,parity-formulas}.ts`
- Depends on: nothing (pure functions over typed inputs)
- Used by: statistics repository + recalculation service

**Infra layer:**
- Purpose: connection clients + cross-cutting infra
- Location: `src/infra/{db,queue,storage,logging,metrics,runtime}/`
- Used by: Pg adapters, runtime, `server.ts`

## Data Flow

### Public stats read path

1. Request hits a public-stats route (`src/modules/public-stats/routes/routes.ts`)
2. TypeBox validates query (pagination/filters/cursor in `routes/pagination/`)
3. Route calls `PublicStatsReadModel` port; production adapter `PgPublicStatsReadModel` (`src/modules/public-stats/repository.ts`) runs keyset SQL
4. Rows mapped to API shape (`replay-mapper.ts`) and returned

### Ingest / parse-job path (background)

1. `IntervalTask` polls on `pollIntervalMs` (`src/modules/ingest/runtime.ts`)
2. `IngestPromotionService` promotes staging records → canonical replay + `parse_jobs` (`src/modules/ingest/service.ts`)
3. `ParseJobPublisher` publishes durable jobs to RabbitMQ (`src/modules/ingest/publisher.ts`)
4. RabbitMQ consumers handle `ParseCompletedMessage` / `ParseFailedMessage` (`src/infra/queue/rabbitmq.ts`)
5. On completion, artifact loaded from S3 and `ParserResultRecalculationService` recomputes aggregates/bounty (`src/modules/statistics/service/recalculation.ts`)

**State Management:**
- All durable state is in PostgreSQL; parse work is coordinated through the `parse_jobs` table (never fire-and-forget). No in-process domain state survives restart in production.

## Key Abstractions

**Port interfaces (ReadModel / Repository / Store):**
- Purpose: decouple routes from persistence
- Examples: `IngestReadModel`, `IngestCommandModel` (`src/modules/ingest/routes/routes.ts`), `PublicStatsReadModel` (`src/modules/public-stats/routes/routes.ts`), `AuthRouteOptions` (`src/modules/auth/routes/models.ts`)
- Pattern: interface in routes/models; `Pg*` and `InMemory*`/`Empty*`/`Noop*` implementations

**Auth guards:**
- Purpose: role enforcement as Fastify pre-handlers
- Examples: `requireRole`, `requireAnyRole`, `currentUser` (`src/modules/auth/routes/authorization.ts`)
- Pattern: returned async handler sends 401/403 or resolves undefined

**IntervalTask:**
- Purpose: resilient periodic background work
- Examples: `src/infra/runtime/interval-task.ts`, used by ingest runtime
- Pattern: named task + logger + interval, started/stopped via runtime lifecycle

**Pure stat formulas:**
- Purpose: deterministic, testable calculation
- Examples: `calculateBountyPoints`, `calculatePlayerAndSquadAggregates`, `calculateCommanderSideAggregates`

## Entry Points

**Production server:**
- Location: `src/server.ts`
- Triggers: `node dist/src/server.js` (`pnpm start`) / `tsx watch` (`pnpm dev`)
- Responsibilities: load config, build infra clients + Pg adapters, `buildApp`, start ingest runtime, signal-based graceful shutdown

**App factory:**
- Location: `src/app.ts` → `buildApp(options)`
- Triggers: `server.ts` and tests
- Responsibilities: register OpenAPI + all module route plugins with injected adapters

**Ops CLI scripts:**
- Location: `src/operations/*.ts` (run via `tsx`, see `package.json` `ops:*` scripts)
- Triggers: manual/cron operational tasks (recalc, readiness, backup/boundary checks)

## Architectural Constraints

- **Threading:** Single-threaded Node event loop. Background work is the ingest `IntervalTask` plus RabbitMQ consumers within the same process; no worker threads.
- **Global state:** Production singletons (db `Pool`, queue runtime, storage client) are constructed once at module top-level in `src/server.ts`. `buildApp` itself holds no module-level mutable state.
- **Circular imports:** None observed; modules depend downward (routes → ports → adapters → infra).
- **DI boundary:** Real PostgreSQL/RabbitMQ/S3 must only be instantiated in `src/server.ts`. `buildApp` and modules must accept dependencies via options/ports.
- **ESM:** `"type": "module"`; all relative imports use explicit `.js` extensions.
- **Boundary rules:** No OCAP parsing and no external replay crawling in this repo; ingest only promotes staging evidence and persists parser artifacts. Enforced by `src/operations/check-app-boundary-guards.ts`.

## Anti-Patterns

### Instantiating real clients outside the composition root

**What happens:** Creating a pg `Pool`, RabbitMQ connection, or S3 client inside a module/route.
**Why it's wrong:** Breaks the port/adapter seam, makes the unit and route tests (which rely on in-memory adapters) impossible, and couples HTTP code to infra.
**Do this instead:** Define a port interface and accept it via route options; build the `Pg*` adapter in `src/server.ts` (see how `PgIngestRepository` is wired there).

### Auth checks inline in handlers

**What happens:** Re-implementing role/session checks inside a route body.
**Why it's wrong:** Easy to miss an endpoint as the API grows.
**Do this instead:** Use the shared `requireRole`/`requireAnyRole` pre-handlers from `src/modules/auth/routes/authorization.ts`.

### Fire-and-forget parser messages

**What happens:** Publishing to RabbitMQ without a `parse_jobs` row.
**Why it's wrong:** Lost/unexplainable parser work; violates the durable-job invariant.
**Do this instead:** Promote through `IngestPromotionService` so a durable job row exists before `ParseJobPublisher` publishes (`src/modules/ingest/`).

## Error Handling

**Strategy:** TypeBox schema validation rejects bad input at the HTTP edge; auth guards return explicit 401/403; route handlers return typed error bodies.

**Patterns:**
- Status codes via `reply.code(...).send({ message })` (see `authorization.ts`).
- Pagination/cursor errors are dedicated typed errors (`src/modules/public-stats/routes/pagination/errors.ts`).
- Background tasks log via `IntervalTaskLogger`; failures are recorded against job state rather than thrown to crash the loop.

## Cross-Cutting Concerns

**Logging:** `pino` via `src/infra/logging/logger.ts`, Fastify-integrated (`app.log`); config redacted before logging (`redactConfigForLogs`).
**Validation:** TypeBox schemas at every route; env validated by `envalid` in `config/env.ts`.
**Authentication:** Steam OpenID (`src/modules/auth/routes/steam-openid.ts`), cookie sessions, role guards.
**Metrics:** `prom-client` registry (`src/infra/metrics/registry.ts`) exposed by operations routes.
**Health:** `HealthCheckable` per dependency (db/queue/parser/storage) aggregated in operations routes.

---

*Architecture analysis: 2026-06-08*
