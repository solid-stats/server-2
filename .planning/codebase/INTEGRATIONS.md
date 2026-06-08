# External Integrations

**Analysis Date:** 2026-06-08

## APIs & External Services

**Identity / OAuth:**
- Steam OpenID 2.0 - User sign-in and Steam ID linking.
  - SDK/Client: Custom `SteamOpenIdClient` in `src/modules/auth/routes/steam-openid.ts` (no third-party library; uses native `fetch`).
  - Endpoints: `https://steamcommunity.com/openid/login` (login redirect) and provider verification via `check_authentication` POST.
  - Auth: No API key. Realm/return-to derived from `PUBLIC_BASE_URL`; bootstrap admin via `BOOTSTRAP_ADMIN_STEAM_ID`.

**Cross-application boundaries (internal Solid Stats apps):**
- `replays-fetcher` - Promotes staging/outbox records into canonical replay + parse-job state. `server-2` does not crawl external replay sources. Ingest in `src/modules/ingest/`.
- `replay-parser-2` - Consumes parser output; `server-2` does not parse OCAP JSON. Contract pinned by `PARSER_CONTRACT_VERSION` (`3.0.0`). Boundary guards: `src/operations/check-app-boundary-guards.ts`.
- `web` - Consumes the OpenAPI contract via `openapi-typescript`.

## Data Storage

**Databases:**
- PostgreSQL 18.x target (17-alpine in Compose) - Canonical source of truth.
  - Connection: `DATABASE_URL` env var.
  - Client: `pg` driver + `kysely` query builder (`src/infra/db/client.ts`).
  - Migrations: SQL files in `src/infra/db/migrations/`, applied via `src/infra/db/migrate.ts` (`pnpm db:migrate`).

**File Storage:**
- S3-compatible object storage (MinIO locally, S3 in production).
  - Connection: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`.
  - Client: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (`src/infra/storage/client.ts`).
  - Usage: loads parser artifacts; presigns request-attachment uploads (TTL 900s).
  - Default bucket: `solid-replays`.

**Caching:**
- None.

## Authentication & Identity

**Auth Provider:**
- Steam OpenID 2.0 (custom adapter).
  - Implementation: `SteamOpenIdClient` (`src/modules/auth/routes/steam-openid.ts`); routes in `src/modules/auth/routes/routes.ts`.
  - Sessions: cookie-based. `SESSION_COOKIE_NAME` (default `solid_stats_session`), `SESSION_TTL_SECONDS` (default 30 days). Cookie handling in `src/modules/auth/routes/cookies.ts`; session store in `src/modules/auth/routes/memory.ts` / `postgres.ts`.
  - Roles/authorization: `src/modules/auth/routes/authorization.ts`, `role-routes.ts`.

## Monitoring & Observability

**Error Tracking:**
- None (no external error-tracking service detected).

**Metrics:**
- Prometheus via `prom-client` (`src/infra/metrics/registry.ts`); exposed through operations routes (`src/modules/operations/routes.ts`).

**Logs:**
- Structured logging with `pino` (`src/infra/logging/logger.ts`). Config redacted before logging via `redactConfigForLogs`.

**Health:**
- Health checks in `src/infra/health.ts`; DB, queue, and storage clients implement `HealthCheckable`.

## CI/CD & Deployment

**Hosting:**
- Single VPS via Docker Compose (`docker-compose.prod.yml`). Services: api, migrate, postgres, rabbitmq, minio, minio-create-bucket.

**CI Pipeline:**
- GitHub Actions (`.github/workflows/cd.yml`). Verification gate: `pnpm verify` (format, lint, typecheck, tests, integration, OpenAPI check, ops backup/boundary checks, coverage).

## Message Queue

**RabbitMQ 4.x** - Durable parser-job orchestration.
- Connection: `RABBITMQ_URL`. Client wrapper: `src/infra/queue/rabbitmq.ts`, contract in `src/infra/queue/messages.ts`.
- Exchange: `solid_stats.parser`.
- Routing keys: `parse.requested`, `parse.completed`, `parse.failed`.
- Queues: `server2.parse.requested`, `server2.parse.completed`, `server2.parse.failed`.
- Publisher uses confirms (`ConfirmingPublisher`). Messages carry `job_id`, `replay_id`, `object_key`, sha256 checksums, `parser_contract_version`.

## Environment Configuration

**Required env vars:**
- `DATABASE_URL`, `RABBITMQ_URL` (URLs, required, no default).
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (required).
- `PUBLIC_BASE_URL`, `PARSER_CONTRACT_VERSION`, session and batch-size vars (have defaults).

**Secrets location:**
- Local `.env` (gitignored). Compose production reads `.env.production` plus `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`, `MINIO_ROOT_PASSWORD`.
- Secrets redacted from logs by `redactConfigForLogs` in `src/config/env.ts`.

## Webhooks & Callbacks

**Incoming:**
- Steam OpenID return callback - verified by `SteamOpenIdClient.verifyCallback` (`src/modules/auth/routes/steam-openid.ts`).
- RabbitMQ parse completion/failure consumers (queue-based, not HTTP webhooks).

**Outgoing:**
- RabbitMQ `parse.requested` publish (see Message Queue).
- Steam `check_authentication` verification POST.

---

*Integration audit: 2026-06-08*
