# Technology Stack

**Analysis Date:** 2026-06-08

## Languages

**Primary:**
- TypeScript 6.x (`typescript@^6.0.3`) - All application code under `src/`. Compiled to ESM (`"type": "module"`).

**Secondary:**
- SQL (PostgreSQL dialect) - Schema migrations in `src/infra/db/migrations/*.sql`.

## Runtime

**Environment:**
- Node.js 25.x - Pinned via `engines.node: ">=25 <26"`, `.nvmrc`, `.node-version`, and Docker base image `node:25-alpine`.
- Module system: ESM with `NodeNext` resolution. Source uses `.js` extension imports (TS NodeNext convention).

**Package Manager:**
- pnpm 11.0.9 - Pinned via `packageManager` field and `engines.pnpm: ">=11 <12"`.
- Lockfile: present (`pnpm-lock.yaml`). Docker builds use `--frozen-lockfile`.
- Workspace file present (`pnpm-workspace.yaml`).

## Frameworks

**Core:**
- Fastify 5.x (`fastify@^5.8.5`) - HTTP API framework. App assembled in `src/app.ts`, booted in `src/server.ts`.
- TypeBox (`@sinclair/typebox@^0.34.49`) with `@fastify/type-provider-typebox@^6.1.0` - Schema-first route validation and the OpenAPI source of truth.

**Testing:**
- Vitest 4.x (`vitest@^4.1.5`) - Unit and integration tests, config in `vitest.config.ts`.
- V8 coverage (`@vitest/coverage-v8@^4.1.5`) - Coverage gates via `pnpm test:coverage`.

**Build/Dev:**
- `tsx@^4.21.0` - Runs TypeScript directly in dev (`tsx watch src/server.ts`) and for ops/migration scripts.
- `tsc` - Production build via `tsconfig.build.json` (output to `dist/`).
- ESLint 10.x (`eslint@^10.3.0`) with `typescript-eslint@^8.59.2`, `eslint-plugin-unicorn@^64.0.0`, `eslint-plugin-import-x@^4.16.2`, `eslint-import-resolver-typescript`. Config in `eslint.config.js`.
- Prettier 3.x (`prettier@^3.8.3`) - Formatting (`prettier --check .`).

## Key Dependencies

**Critical:**
- `pg@^8.20.0` - PostgreSQL driver. Client in `src/infra/db/client.ts`.
- `kysely@^0.29.0` - Type-safe SQL query builder layered over `pg`.
- `amqplib@^1.0.7` - RabbitMQ client for parse-job orchestration. Wrapper in `src/infra/queue/rabbitmq.ts`.
- `@aws-sdk/client-s3@^3.1045.0` + `@aws-sdk/s3-request-presigner@^3.1045.0` - S3-compatible object storage for replay artifacts and request attachments. Client in `src/infra/storage/client.ts`.

**Infrastructure:**
- `pino@^10.3.1` - Structured logging. Logger in `src/infra/logging/logger.ts`.
- `prom-client@^15.1.3` - Prometheus metrics. Registry in `src/infra/metrics/registry.ts`.
- `envalid@^8.1.1` + `dotenv@^17.4.2` - Validated env config in `src/config/env.ts`.

**API contract:**
- `@fastify/swagger@^9.7.0` + `@fastify/swagger-ui@^5.2.6` - OpenAPI generation from route schemas. Registration in `src/openapi/register-openapi.ts`.
- `openapi-typescript@^7.13.0` (dev) - Verifies the exported OpenAPI document generates a valid client (`pnpm openapi:check`).

## Configuration

**Environment:**
- Loaded and validated through `envalid` in `src/config/env.ts` (`loadConfig`). `redactConfigForLogs` strips secrets before logging.
- Templates: `.env.example` (development), `.env.production.example` (production). A local `.env` exists (not committed values — secrets present).
- Key configs: `DATABASE_URL`, `RABBITMQ_URL`, `PARSER_CONTRACT_VERSION` (default `3.0.0`), S3 settings, session settings, `BOOTSTRAP_ADMIN_STEAM_ID`.

**Build:**
- `tsconfig.json` - Strict typing baseline: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals/Parameters`. Target ES2023, module NodeNext.
- `tsconfig.build.json` - Production build (emits to `dist/`).
- `eslint.config.js`, `vitest.config.ts`, `.prettierignore`, `.dockerignore`.

## Platform Requirements

**Development:**
- Node 25 + pnpm 11.
- Docker Compose dependencies via `docker-compose.yml`: PostgreSQL 17-alpine (port 15432), RabbitMQ 4-management (5673/15673), MinIO + `mc` bucket bootstrap (9000/9001).

**Production:**
- Docker Compose on a single VPS (`docker-compose.prod.yml`).
- Multi-stage `Dockerfile` (`base` → `dependencies` → `build` → `production`), runs `node dist/src/server.js`, exposes port 3000.
- Dedicated `migrate` service runs `dist/src/infra/db/migrate.js` before API start.
- CI: GitHub Actions workflow `.github/workflows/cd.yml`.

---

*Stack analysis: 2026-06-08*
