# Codebase Structure

**Analysis Date:** 2026-06-08

## Directory Layout

```
server-2/
├── src/
│   ├── app.ts                 # Composition root: buildApp(options)
│   ├── server.ts              # Production entry: wires Pg adapters + runtime
│   ├── config/
│   │   └── env.ts             # envalid-validated typed AppConfig
│   ├── infra/                 # Connection clients + cross-cutting infra
│   │   ├── db/                # pg Pool client, migrate runner, migrations/
│   │   ├── queue/             # RabbitMQ client, runtime, message types
│   │   ├── storage/           # S3-compatible client
│   │   ├── logging/           # pino logger options
│   │   ├── metrics/           # prom-client registry
│   │   ├── runtime/           # IntervalTask
│   │   └── health.ts          # HealthCheckable contract
│   ├── modules/               # Feature slices (routes + ports + adapters + tests)
│   │   ├── auth/              # Steam OpenID, sessions, role guards
│   │   ├── ingest/           # Staging promotion, parse-job orchestration
│   │   ├── requests/         # Player requests, moderation, workflows, audit
│   │   ├── admin/            # Rotation management
│   │   ├── public-stats/     # Public read API, pagination, sitemap, slugs
│   │   ├── statistics/       # Aggregate/bounty/commander calc + recalculation
│   │   └── operations/       # Health + metrics routes
│   ├── openapi/               # Schema register + export/verify scripts
│   ├── operations/            # Ops CLI scripts (recalc, readiness, checks)
│   └── test/                  # Top-level app + integration tests
├── openapi/server-2.openapi.json   # Generated API contract (committed)
├── deploy/k8s/                # Kubernetes staging manifests
├── docs/                      # Project documentation
├── gsd-briefs/                # GSD planning briefs
├── docker-compose.yml         # Local dependencies
├── docker-compose.prod.yml    # Single-VPS production
├── Dockerfile
├── eslint.config.js           # ESLint 10 flat config
├── vitest.config.ts
├── tsconfig.json / tsconfig.build.json
└── package.json
```

## Directory Purposes

**`src/modules/<feature>/`:**
- Purpose: a self-contained vertical slice for one domain area
- Contains: route plugins, port interfaces, adapter implementations, colocated `tests/`
- Key files: `routes/routes.ts` (plugin + ports), `routes/models.ts` (option/domain types), `routes/postgres.ts` (Pg adapter), `routes/memory.ts` (in-memory adapter)

**`src/infra/`:**
- Purpose: all real external-system clients and cross-cutting infra
- Contains: db pool, RabbitMQ, S3, logger, metrics, IntervalTask, health
- Key files: `db/client.ts`, `queue/rabbitmq.ts`, `storage/client.ts`

**`src/infra/db/migrations/`:**
- Purpose: ordered SQL migrations (source of truth for schema)
- Contains: `NNNN_description.sql` (e.g. `0001_v1_domain_schema.sql` … `0007_replay_event_keyset.sql`)
- Applied via: `pnpm db:migrate` (`src/infra/db/migrate.ts`)

**`src/operations/`:**
- Purpose: standalone operational CLI scripts run via `tsx`
- Key files: `recalculate-statistics.ts`, `statistics-readiness.ts`, `check-backup-runbook.ts`, `check-app-boundary-guards.ts`

**`src/openapi/`:**
- Purpose: register Fastify/TypeBox schemas as OpenAPI, export and verify the committed contract
- Key files: `register-openapi.ts`, `export-openapi.ts`, `verify-openapi.ts`

## Key File Locations

**Entry Points:**
- `src/server.ts`: production process (DI wiring + lifecycle)
- `src/app.ts`: `buildApp` factory used by server and tests

**Configuration:**
- `src/config/env.ts`: typed env config
- `.env` / `.env.example` / `.env.production.example`: environment (never read `.env` contents)

**Core Logic:**
- `src/modules/statistics/`: pure calculation (`bounty/`, `service/`, `parity-formulas.ts`) + SQL repository
- `src/modules/ingest/`: promotion + parse-job orchestration + runtime

**Testing:**
- Colocated `tests/` directories within each module
- `src/test/` and `src/test/integration/` for app-wide and integration tests

## Naming Conventions

**Files:**
- kebab-case: `replay-mapper.ts`, `steam-openid.ts`, `interval-task.ts`
- Adapter convention: `memory.ts` (in-memory), `postgres.ts` / `repository.ts` (Pg)
- Tests: `*.test.ts` inside a sibling `tests/` directory; integration in `src/test/integration/`
- Migrations: `NNNN_snake_case.sql` (zero-padded, sequential)

**Directories:**
- kebab-case feature folders under `modules/`
- Sub-areas split into their own folders when a module grows (e.g. `requests/routes/{moderation,workflows,audit-patches}/`, `public-stats/routes/pagination/`)

**Code identifiers:**
- Route registrars: `register<Feature>Routes(app, options)`
- Ports: `<Feature>ReadModel`, `<Feature>Repository`, `<Feature>Store`, `<Feature>CommandModel`
- Adapters: `Pg<Port>`, `InMemory<Port>`, `Empty<Port>`, `Noop<Port>`

## Where to Add New Code

**New feature module:**
- Create `src/modules/<feature>/routes/routes.ts` exporting `register<Feature>Routes` + port interfaces
- Add `routes/models.ts` (types), `routes/postgres.ts` (Pg adapter), `routes/memory.ts` (in-memory adapter)
- Register in `src/app.ts` (with in-memory default) and wire the Pg adapter in `src/server.ts`

**New endpoint on existing module:**
- Add the route + TypeBox schema in that module's `routes/*.ts`
- Extend the relevant port interface and both adapter implementations
- Run `pnpm openapi:check` so the committed contract stays in sync

**New persistence query:**
- Add to the module's Pg repository (`*/repository.ts` or `routes/postgres.ts`) using explicit SQL via the pg `Pool`/`PoolClient`

**New DB schema change:**
- Add the next sequential `src/infra/db/migrations/NNNN_*.sql`; never edit applied migrations

**Pure calculation logic:**
- Add to `src/modules/statistics/{bounty,service}/` as pure functions with colocated tests

**Shared infra client:**
- Add under `src/infra/<area>/` exposing a `HealthCheckable` where it is a connection

## Special Directories

**`dist/`:**
- Purpose: TypeScript build output (`pnpm build`)
- Generated: Yes · Committed: No

**`openapi/server-2.openapi.json`:**
- Purpose: generated API contract consumed by `web`
- Generated: Yes (from route schemas) · Committed: Yes (verified in CI via `openapi:check`)

**`deploy/k8s/staging/`:**
- Purpose: Kubernetes staging manifests
- Generated: No · Committed: Yes

**`.agents/` (= `.claude/` symlink):**
- Purpose: GSD skills and tooling
- Committed: Yes (excluded from eslint)

---

*Structure analysis: 2026-06-08*
