# server-2

`server-2` is the TypeScript backend source of truth for Solid Stats. It owns API contracts, persistence, job orchestration, moderation workflows, and operational visibility. OCAP parsing stays in `replay-parser-2`, raw replay discovery stays in `replays-fetcher`, and browser UI work stays in `web`.

Project development uses only AI agents plus GSD workflow.

Agents keep README and planning docs current when scope, commands, architecture, validation data, or workflow changes. `.planning/config.json` keeps workflow-critical GSD settings aligned with `replay-parser-2`; `agent_skills` are intentionally stack-aware for this TypeScript/Fastify/API service. Requests that conflict with architecture, quality, maintainability, or proportional scope should be challenged with safer alternatives or a GSD plan before risky overrides.

Project-changing work must be captured in GSD planning, phase execution, or quick-task artifacts. Ask the user when change ownership, commit intent, or cross-project compatibility is unclear. Local-only backend work can rely on this repo's planning docs; parser contract mapping, ingest staging/source identity, RabbitMQ/S3 messages, API/data, canonical identity, auth, moderation, or UI-visible behavior requires adjacent app evidence or a user question.

Project planning lives in `.planning/`: `PROJECT.md` for product context and decisions, `REQUIREMENTS.md` for v1 requirements, `ROADMAP.md` for phase sequence, `STATE.md` for current GSD state, and `research/SUMMARY.md` for architecture rationale.

## Current Phase

Phase 4 is complete. The current next phase is Phase 5: public statistics API.

Phase 3 delivered ingest promotion and parser job lifecycle: staging rows from `replays-fetcher` become canonical replays and durable parse jobs, RabbitMQ parse requests use the parser worker contract, parser terminal results are recorded idempotently, and read-only operator lifecycle APIs are exposed.

Phase 4 delivered parser artifact normalization and deterministic recalculation for player stats, squad stats, commander-side outcomes, bounty points, and the shared parser-result recalculation orchestration path.

## Requirements

- Node 25
- pnpm 11
- Docker Compose for local dependencies

## Local Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres rabbitmq minio minio-create-bucket
pnpm run dev
```

PostgreSQL maps container port `5432` to host port `15432`. RabbitMQ maps container port `5672` to host port `5673` and management port `15672` to host port `15673`. These host ports avoid common local service conflicts.

## Commands

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:coverage
pnpm run test:integration
pnpm run db:migrate
pnpm run test:schema
pnpm run openapi:export
pnpm run openapi:check
pnpm run verify
```

## Runtime Surfaces

- `GET /live` - process liveness, no dependency checks.
- `GET /ready` - PostgreSQL, RabbitMQ, and S3-compatible storage readiness.
- `GET /metrics` - Prometheus-compatible metrics baseline.
- `GET /openapi.json` - generated OpenAPI 3.x document.
- `GET /docs` - local Swagger UI.
- `GET /operations/ingest-staging` - read-only ingest staging lifecycle list with filters and pagination.
- `GET /operations/ingest-staging/:id` - read-only staging detail and evidence summary.
- `GET /operations/parse-jobs` - read-only parse job lifecycle list with filters and pagination.
- `GET /operations/parse-jobs/:id` - read-only parse job detail and error summary.
- `GET /stats/overview` - anonymous public stats overview with optional `rotationId` filter.
- `GET /stats/players` - anonymous player stats list with pagination, search, and optional `rotationId` filter.
- `GET /stats/players/:id` - anonymous player stats profile with optional `rotationId` filter.

The generated contract artifact is `openapi/server-2.openapi.json`.

Phase 3 operator APIs are shaped for future admin/moderator surfaces. Final authentication and role enforcement are deferred to Phase 6.

## Statistics

Phase 4 persists parser artifacts and recalculates rotation-scoped aggregate rows for player stats, squad stats, commander-side outcomes, and bounty points. The v1 bounty formula is documented in [docs/bounty-formula.md](docs/bounty-formula.md); teamkills and non-enemy kills award zero bounty points, and missing previous-rotation evidence uses zero effectiveness factors.

## Database Schema

Phase 2 uses explicit PostgreSQL SQL migrations under `src/infra/db/migrations/`.

```bash
docker compose up -d postgres
pnpm run db:migrate
pnpm run test:schema
```

The migration ledger table is `schema_migrations`. The initial schema migration creates v1 lifecycle tables for users, roles, canonical player identity history, squads, rotations, replay ingest evidence, parser jobs/results/events, aggregates, requests, attachments, moderation actions, and audit patches.
