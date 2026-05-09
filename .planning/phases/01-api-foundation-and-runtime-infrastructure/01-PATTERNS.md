# Phase 01 - Pattern Map

**Mapped:** 2026-05-09
**Status:** Ready for planning

## Codebase Baseline

`server-2` has no application source scaffold yet. There are no existing TypeScript files, package manifest, tests, Docker Compose files, or runtime adapters to reuse directly. Planning must therefore treat `.planning/` and `gsd-briefs/` as the only local source of truth, while keeping implementation patterns conservative and explicit.

## Target Files

| Path | Role | Data Flow | Closest Local Analog |
|------|------|-----------|----------------------|
| `package.json` | npm project manifest | Scripts launch app, tests, typecheck, OpenAPI export/check, and integration checks | No local analog |
| `package-lock.json` | Dependency lockfile | npm install result for deterministic dependency resolution | No local analog |
| `tsconfig.json` | TypeScript compiler config | Enforces strict ESM TypeScript build | No local analog |
| `vitest.config.ts` | Test runner config | Defines unit/integration test environment | No local analog |
| `.env.example` | Local environment contract | Documents Compose-aligned env vars consumed by config parser | Phase context D-14/D-15 |
| `docker-compose.yml` | Local dependency stack | Starts PostgreSQL, RabbitMQ, and MinIO for local integration tests | Phase context D-14 |
| `README.md` | Developer workflow docs | Documents AI/GSD workflow, local setup, commands, architecture direction | `AGENTS.md` and `.planning/PROJECT.md` |
| `src/app.ts` | Fastify app factory | Registers OpenAPI, health, readiness, metrics, and future modules without binding a port | Phase context D-04/D-06 |
| `src/server.ts` | Process entrypoint | Loads config/deps, starts Fastify, handles shutdown | Phase context D-04/D-17 |
| `src/config/env.ts` | Typed runtime config | Parses env into `AppConfig`, redacts secrets for logs/errors | Phase context D-01/D-15 |
| `src/config/env.test.ts` | Config unit tests | Verifies required env, defaults, and redaction behavior | Validation strategy |
| `src/infra/logging/logger.ts` | Structured logging helper | Creates Pino-compatible logger options/instance | Phase context D-17/D-18 |
| `src/infra/health.ts` | Shared health types | Normalizes adapter `check()` results for readiness route | Phase context D-10/D-17 |
| `src/infra/db/client.ts` | PostgreSQL adapter | Wraps `pg` pool/Kysely and exposes `check()`/`close()` | Phase context D-10/D-11 |
| `src/infra/queue/client.ts` | RabbitMQ adapter | Wraps `amqplib` connection/channel and exposes `check()`/`close()` | Phase context D-10/D-13 |
| `src/infra/storage/client.ts` | S3 adapter | Wraps AWS SDK v3 client and bucket health check | Phase context D-10/D-12 |
| `src/infra/metrics/registry.ts` | Metrics registry | Owns `prom-client` registry and `/metrics` payload | Phase context D-18 |
| `src/openapi/register-openapi.ts` | Swagger registration | Registers `@fastify/swagger` before routes | Phase context D-06/D-08 |
| `src/openapi/export-openapi.ts` | Schema artifact export | Builds app, calls `fastify.swagger()`, writes JSON artifact | Phase context D-08/D-20 |
| `src/modules/operations/routes.ts` | Operations routes | Implements `/live`, `/ready`, `/metrics`, and OpenAPI-covered schemas | Phase context D-17/D-18 |
| `src/test/app.test.ts` | Fastify unit/contract tests | Instantiates app factory without binding a port | Validation strategy |
| `src/test/integration/adapters.test.ts` | Compose-backed adapter tests | Verifies real PostgreSQL/RabbitMQ/S3 connectivity | Validation strategy |
| `openapi/server-2.openapi.json` | Generated OpenAPI artifact | Consumed by `openapi-typescript` check and future `web` generation | Phase context D-08/D-09 |

## Planning Constraints

- Create the scaffold before route, adapter, and OpenAPI work; later tasks must read the files they modify.
- Keep app factory and process startup separate so tests can instantiate Fastify without listening on a port.
- Use TypeBox-backed Fastify route schemas as the OpenAPI source of truth; do not hand-write OpenAPI YAML or frontend DTO mirrors.
- Keep PostgreSQL, RabbitMQ, and S3 clients behind narrow health-checkable adapters with `check()` and `close()` methods.
- Treat Node 24 as the target runtime, but account for the current shell using Node 22 during verification.
- Keep integration tests separate from fast `npm test`; Compose-backed checks should run through a documented script.
- Preserve cross-app boundaries: no parser logic, no replay discovery crawling, no web UI implementation.

## Acceptance Targets for Plans

- Every Phase 1 requirement ID appears in at least one plan frontmatter block: `INFRA-01`, `INFRA-02`, `INFRA-03`, `API-01`, `API-02`.
- Every locked context decision `D-01` through `D-20` is visible in plan `must_haves`, task actions, or acceptance criteria.
- Verification commands are concrete: `npm test`, `npm run typecheck`, `npm run test:integration`, `npm run openapi:export`, and `npm run openapi:check`.
- Security threat model blocks cover input validation, secret leakage in logs/readiness, OpenAPI exposure, and shutdown behavior.
