# server-2

`server-2` is the TypeScript backend source of truth for Solid Stats. It owns API contracts, persistence, job orchestration, moderation workflows, and operational visibility. OCAP parsing stays in `replay-parser-2`, raw replay discovery stays in `replays-fetcher`, and browser UI work stays in `web`.

Project development uses only AI agents plus GSD workflow.

## Current Phase

Phase 1 builds the API foundation: a typed Fastify service, typed configuration, structured logging, local PostgreSQL/RabbitMQ/MinIO dependencies, health/readiness/metrics routes, and an OpenAPI artifact consumable by `openapi-typescript`.

## Requirements

- Node 24
- npm
- Docker Compose for local dependencies

## Local Setup

```bash
npm install
cp .env.example .env
docker compose up -d postgres rabbitmq minio minio-create-bucket
npm run dev
```

PostgreSQL maps container port `5432` to host port `15432`. RabbitMQ maps container port `5672` to host port `5673` and management port `15672` to host port `15673`. These host ports avoid common local service conflicts.

## Commands

```bash
npm run typecheck
npm test
npm run test:integration
npm run db:migrate
npm run test:schema
npm run openapi:export
npm run openapi:check
npm run verify
```

## Runtime Surfaces

- `GET /live` - process liveness, no dependency checks.
- `GET /ready` - PostgreSQL, RabbitMQ, and S3-compatible storage readiness.
- `GET /metrics` - Prometheus-compatible metrics baseline.
- `GET /openapi.json` - generated OpenAPI 3.x document.
- `GET /docs` - local Swagger UI.

The generated contract artifact is `openapi/server-2.openapi.json`.

## Database Schema

Phase 2 uses explicit PostgreSQL SQL migrations under `src/infra/db/migrations/`.

```bash
docker compose up -d postgres
npm run db:migrate
npm run test:schema
```

The migration ledger table is `schema_migrations`. The initial schema migration creates v1 lifecycle tables for users, roles, canonical player identity history, squads, rotations, replay ingest evidence, parser jobs/results/events, aggregates, requests, attachments, moderation actions, and audit patches.
