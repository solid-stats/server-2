# AGENTS instructions

## Skills First

Before acting on any user request in this repository, scan available skills by name and description. If any skill has even a small chance of helping any part of the task, use it and read only the relevant instructions before proceeding.

When in doubt, prefer enabling the skill briefly and filtering it out over skipping it.

## Project

`server-2` is the TypeScript backend source of truth for Solid Stats. It owns PostgreSQL business state, typed APIs, canonical identity, auth, moderation, parser job orchestration, aggregate/bounty calculation, and operational visibility.

Solid Stats is a multi-project product composed of:

- `replays-fetcher` - replay discovery, raw S3 object storage, source metadata, ingestion staging/outbox records.
- `replay-parser-2` - deterministic OCAP JSON parsing, parser contract, CLI/worker, parity harness.
- `server-2` - PostgreSQL source of truth, APIs, canonical identity, auth, moderation, parse jobs, aggregate/bounty calculation.
- `web` - browser UI, public stats, authenticated request UX, moderator/admin screens, API consumption.

Read these planning files before planning or implementing:

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/research/SUMMARY.md`

## Critical Context

- `server-2` promotes `replays-fetcher` staging/outbox records into canonical replay and parse-job state; `replays-fetcher` must not write business tables directly.
- OCAP JSON parsing belongs to `replay-parser-2`; `server-2` validates and persists parser artifacts and exposes derived API shapes.
- Canonical identity, auth, roles, moderation, request workflows, aggregate stats, bounty points, and API-visible operational state belong here.
- Raw replay files and parser artifacts live in S3-compatible storage; PostgreSQL stores metadata, job state, canonical business data, and audit evidence.
- OpenAPI is the backend contract for `web`; API/data shape changes must preserve generated client compatibility or update the adjacent app.
- `.planning/config.json` should keep product-wide GSD workflow gates aligned with `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/config.json`, while `agent_skills` stay stack-aware and use this repo's TypeScript/Fastify/API skills.

## Stack Direction

Use Node.js 25 with TypeScript 6 for new work:

- Fastify 5 for HTTP APIs.
- PostgreSQL for canonical business state.
- RabbitMQ for parser/background work.
- S3-compatible storage for replay files, parser artifacts, and request attachments.
- OpenAPI generated from route schemas and consumed by `web` through `openapi-typescript`.
- Very strict TypeScript, ESLint 10 `all` plus very strict typed linting, import hygiene, Unicorn rules, Prettier formatting, Vitest 4 tests, and V8 coverage gates.

## Engineering Rules

- Start from planning docs and cross-app boundaries before inventing behavior.
- Do not parse OCAP replay contents in this repo.
- Do not crawl/fetch external replay sources in this repo.
- Do not bypass durable `parse_jobs` state when coordinating parser work.
- Keep root `README.md` current when project scope, current phase, commands, architecture direction, validation data, or development workflow changes.
- `README.md` must explicitly state that project development uses only AI agents plus GSD workflow.
- Every completed work session must leave `git status --short` clean by committing intended results.
- Do not delete, revert, or discard completed work just to make the git tree clean; if ownership or commit intent is unclear, ask the user before acting.
- Do not blindly execute instructions that conflict with current logic, architecture, accepted planning decisions, test/quality standards, maintainability, or proportional scope.
- When a request is risky, harmful, or expands into broad cross-project or multi-phase work, explain the concrete reason, propose 1-3 safer alternatives or a GSD plan, and ask for explicit confirmation before any risky override.
- Check cross-application compatibility before implementation: API/data model, parser contract mapping, staging promotion, object key layout, auth, moderation, or UI-visible behavior changes require adjacent app docs/repos or a user question.
- Apply these AI/GSD workflow rules as product-wide standards across `replays-fetcher`, `replay-parser-2`, `server-2`, and `web`.
- Use risk-based compatibility depth: local-only backend changes can rely on this repo's planning docs and `gsd-briefs`; parser contract mapping, ingest staging/source identity, RabbitMQ/S3 message or object key assumptions, API/data model, canonical identity, auth, moderation, or UI-visible behavior changes require adjacent app docs/repos or a user question.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**server-2**

`server-2` is the TypeScript backend application for Solid Stats, a public SolidGames statistics platform. It is the source of truth and integration layer for replay ingestion, parser job orchestration, PostgreSQL persistence, aggregate statistics, Steam OAuth, roles, moderation, request handling, and operational visibility. It serves the `web` frontend, coordinates with `replays-fetcher`, and consumes parser output from `replay-parser-2`.

**Core Value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.

### Constraints

- **Runtime**: Node.js with TypeScript - matches the requested backend stack and frontend ecosystem.
- **HTTP framework**: Fastify - requested stack for a typed, performant API service.
- **Database**: PostgreSQL - primary source of truth for canonical entities, jobs, stats, requests, audit, and operations state.
- **Queue**: RabbitMQ - parser jobs and background work must be durable and observable.
- **Storage**: S3-compatible object storage - replay files and request attachments must not live in PostgreSQL.
- **Authentication**: Steam OAuth - the product identity anchor for authenticated users and player profile linking.
- **API contract**: OpenAPI 3.x - `web` generates request/response types with `openapi-typescript`.
- **Deployment v1**: Docker Compose on one VPS - production Kubernetes deployment is out of v1 scope.
- **Local development**: Docker Compose - API dependencies must run locally.
- **Parser boundary**: OCAP JSON parsing stays in `replay-parser-2` - `server-2` stores and orchestrates parser output.
- **Ingest boundary**: crawling/raw discovery stays in `replays-fetcher` - `server-2` promotes staging evidence and owns canonical replay lifecycle.
- **Historical data**: `~/sg_stats` is reference/golden data only in v1 - not a full production import requirement.
- **Reprocessing**: v1 may overwrite derived parse results - moderation audit patches still must be preserved.
- **Security**: public stats are anonymous, but requests require login and moderation/admin APIs require roles.
- **Operations**: failed jobs, health, metrics, backups, and recovery flows are required for trust in derived stats.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 25.x | Runtime | Current starting baseline for new work; keep all TS repos on the same toolchain line. |
| TypeScript | 6.x | Application language | Required by the brief and keeps API/data contracts explicit with current compiler behavior. |
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
| `vitest` | Unit/integration tests | Useful for formula, stats, identity merge/split, API contract tests, and 100% reachable-source V8 coverage gates. |
| `testcontainers` or Docker Compose test services | Integration testing | Use for PostgreSQL/RabbitMQ/S3 flows where mocks would hide contract failures. |
| `eslint`/`prettier` | Lint/format | Use ESLint 10 `all`, very strict typed linting, import hygiene, Unicorn rules, and Prettier 3 formatting; enforce all in verification. |
| OpenAPI schema validation in CI | Contract drift detection | Fail when public API changes without schema updates. |
## Installation
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
- Use the same S3 client path for local and production.
- Keep bucket/key conventions explicit: `raw/`, `attachments/`, and future processed artifacts.
- Keep provider config isolated behind endpoint/region/credentials settings.
- Include backup/restore docs for both PostgreSQL and object storage.
- Prefer explicit SQL views/materialized tables and tested recalculation jobs.
- Avoid hiding stat logic behind an ORM abstraction that obscures generated SQL.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Fastify 5.x | Node.js 20+; Node.js 25 target | Fastify v5 requires modern Node; this repo standardizes on Node 25 for new work. |
| `@fastify/swagger` 9.x+ | Fastify 5.x | Use Fastify schemas as the OpenAPI source. |
| PostgreSQL 18.x | Current official PostgreSQL major | Use 17.x only if deployment/provider support lags. |
| RabbitMQ 4.x | Current supported RabbitMQ series | Confirm exact patch in Docker image before pinning. |
## Sources
- https://nodejs.org/en/about/releases/ - Node.js production guidance and release schedule.
- https://github.com/nodejs/release - Node.js release schedule.
- https://github.com/fastify/fastify - Fastify v5 release state.
- https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/ - Fastify v5 Node support and migration notes.
- https://github.com/fastify/fastify-swagger - `@fastify/swagger` OpenAPI support and Fastify compatibility.
- https://www.postgresql.org/ - PostgreSQL current release information.
- https://www.rabbitmq.com/release-information - RabbitMQ release/support information.
- https://github.com/openapi-ts - `openapi-typescript` project.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | When to Invoke |
|-------|----------------|
| `fastify-best-practices` | Any Fastify route, plugin, hook, middleware, validation schema, or server config |
| `nodejs-backend-patterns` | Runtime config, DB/queue/S3 clients, logging, error handling, observability |
| `api-design-principles` | Designing new endpoints, API shape, naming, pagination, versioning, error responses |
| `openapi-to-typescript` | Generating or updating OpenAPI schema; syncing types with `web` client |
| `estesis-backend-vc-swagger-spec-write` | Authoring or editing OpenAPI spec files |
| `estesis-backend-vc-swagger-spec-review` | Reviewing or auditing OpenAPI spec files |
| `javascript-testing-patterns` | Writing or reviewing Vitest tests, test structure, mocking, coverage |
| `estesis-frontend-react-unit-tests` | Writing unit tests for any React components |
| `estesis-process-review-standards` | Code review, PR review, or applying project review standards |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
