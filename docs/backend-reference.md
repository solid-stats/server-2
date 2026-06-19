# Backend Reference

Technical reference for `server-2` — the SolidStats TypeScript/Fastify backend. The README
is the user-facing front door; this document holds the engineering depth: the runtime
surface catalog, the OpenAPI contract policy, statistics and bounty recalculation,
authentication and requests, the database schema, and production Compose detail.

Related docs:

- [api-compatibility.md](api-compatibility.md) — OpenAPI drift checks and `web` type-generation expectations.
- [deployment.md](deployment.md) — production deployment runbook.
- [backup-restore.md](backup-restore.md) — PostgreSQL and S3-compatible backup and restore.
- [bounty-formula.md](bounty-formula.md) — the v1 bounty scoring formula.
- [parser-counter-semantics.md](parser-counter-semantics.md) — compact player counter death semantics.
- [full-run-recalculation.md](full-run-recalculation.md) — full-run coverage and recalculation commands.
- [rotation-identity-readiness.md](rotation-identity-readiness.md) — rotation and no-SteamID identity readiness reporting.
- [legacy-public-export.md](legacy-public-export.md) — the legacy public export command.
- [diff-harness-contract.md](diff-harness-contract.md) — the old-vs-new diff contract and app workflow boundary guard.
- [k3s-staging.md](k3s-staging.md) — the k3s staging path.

## Architecture and Boundary

`server-2` is the TypeScript backend source of truth for Solid Stats. It owns PostgreSQL
business state, typed HTTP APIs, canonical player identity, Steam authentication, moderation
workflows, parser job orchestration, and aggregate/bounty calculation, plus operational
visibility.

The surrounding platform repos own the rest:

- `replays-fetcher` — raw replay discovery, S3 object storage, source metadata, ingest staging/outbox records.
- `replay-parser-2` — deterministic OCAP JSON parsing, versioned parser contract, CLI/worker.
- `web` — browser UI, public stats, authenticated request UX, moderator/admin screens.
- `infrastructure` — Kubernetes staging manifests, runtime wiring, deployment scripts.

Hard boundaries `server-2` must not cross: it does not parse OCAP replay contents (that
belongs to `replay-parser-2`) and it does not crawl or fetch external replay sources (that
belongs to `replays-fetcher`). `server-2` promotes `replays-fetcher` staging/outbox records
into canonical replay and parse-job state; the fetcher must not write business tables
directly. OpenAPI is the backend contract for `web`; API/data shape changes must preserve
generated client compatibility or update the adjacent app.

## Runtime Surfaces

- `GET /live` — process liveness, no dependency checks.
- `GET /ready` — PostgreSQL, RabbitMQ, S3-compatible storage, and parser-integration readiness.
- `GET /metrics` — Prometheus-compatible process metrics plus parser job outcomes, parser job duration, parser worker failures, and observed queue depth.
- `GET /openapi.json` — generated OpenAPI 3.x document.
- `GET /docs` — local Swagger UI.
- `GET /operations/ingest-staging` — moderator/admin ingest staging lifecycle list with filters and pagination.
- `GET /operations/ingest-staging/:id` — moderator/admin staging detail and evidence summary.
- `GET /operations/parse-jobs` — moderator/admin parse job lifecycle list with filters and pagination.
- `GET /operations/parse-jobs/:id` — moderator/admin parse job detail and error summary.
- `GET /operations/parse-jobs/:id/history` — moderator/admin parse job lifecycle history.
- `POST /operations/parse-jobs/:id/retry` — admin-only retry for failed or retryable parse jobs.
- `POST /operations/replays/:id/reparse` — admin-only manual reparse that creates a new durable parse job.
- `GET /stats/overview` — anonymous public stats overview with optional `rotationId` filter.
- `GET /stats/players` — anonymous player stats list with pagination, search, and optional `rotationId` filter.
- `GET /stats/players/:id` — anonymous player stats profile with optional `rotationId` filter.
- `GET /stats/squads` — anonymous squad stats list with pagination, search, and optional `rotationId` filter.
- `GET /stats/squads/:id` — anonymous squad stats profile with optional `rotationId` filter.
- `GET /stats/rotations` — anonymous rotation list.
- `GET /stats/commander-sides` — anonymous commander-side stats with optional `rotationId` filter.
- `GET /stats/bounty` — anonymous bounty points list with pagination and optional `rotationId` filter.
- `GET /stats/leaderboards` — anonymous player, squad, and bounty leaderboards with optional `rotationId` filter.

Read-only operation APIs expose lifecycle state for authenticated moderators and admins.
Mutating operation APIs require an authenticated admin session.

## Contract Version and Bump Policy

The generated contract artifact is `openapi/server-2.openapi.json`. See
[api-compatibility.md](api-compatibility.md) for OpenAPI drift checks and `web`
type-generation expectations.

`info.version` is the single source of truth for the contract version and lives only in
`src/openapi/register-openapi.ts`. The published artifact `openapi/server-2.openapi.json` is
both what `web` consumes via `openapi-typescript` and the committed baseline used for change
classification. `package.json` `version` is unrelated to the contract and is intentionally not
the version source.

`1.0.0` is the frozen public-contract baseline. Going forward:

- **Additive / backward-compatible change** (new endpoint, new optional field, widened enum): bump the **minor** version. The change passes the `contract-diff` gate freely.
- **Breaking change** (removed/renamed field, narrowed type, newly required input, removed endpoint): bump the **major** version **and** regenerate-and-commit the baseline `openapi/server-2.openapi.json` in the **same PR**. Otherwise the `contract-diff` gate fails the build.

Two complementary CI gates protect the contract; they solve different problems and are both required:

1. **`openapi:verify` (byte-equality drift gate)** — runs inside `pnpm run verify`. Asserts the artifact regenerated from code byte-equals the committed `openapi/server-2.openapi.json`, so the committed baseline can never silently go stale relative to the running app.
2. **`contract-diff` (oasdiff classification gate)** — a separate CI job that classifies the diff between the PR base-branch artifact and the PR-HEAD artifact using `oasdiff/oasdiff-action/breaking` (pinned to an immutable commit SHA `5ffbc910f1d1742f0dd9bf846a7f86954353556b` (tag `v0.0.56`), `fail-on: ERR`, CI-only with no runtime dependency). Additive changes pass; ERR-level breaking changes fail unless the PR intentionally bumps the major version and updates the committed baseline.

The frozen-contract pagination assertion is intentionally scoped to the public `/stats/*`
surface (cursor pagination only — `hasMore` / `items` / `nextCursor`). The operator
`/operations/*` endpoints keep offset pagination (`page` / `pageSize` / `total`) and are
outside the public `web` contract scope.

The PostgreSQL integration freeze gate runs in CI via the existing `Verify` job's
`pnpm run verify` (`test:integration`), which executes the real-pg integration suite including
the no-full-SteamID leak guard.

## Statistics

Phase 4 persists parser artifacts and recalculates rotation-scoped aggregate rows for player
stats, squad stats, commander-side outcomes, and bounty points. Phase 09 preserves parser
compact counter evidence and uses compact death counters for public aggregate death totals;
see [parser-counter-semantics.md](parser-counter-semantics.md). Phase 10 exposes
`pnpm run ops:stats:coverage` and `pnpm run ops:stats:recalculate` for full-run coverage,
stale-current-result detection, and current parser result backfill; see
[full-run-recalculation.md](full-run-recalculation.md). Phase 11 exposes
`pnpm run ops:stats:readiness` for rotation and no-SteamID identity readiness; see
[rotation-identity-readiness.md](rotation-identity-readiness.md). Phase 12 exposes
`pnpm run ops:stats:legacy-export` for deterministic legacy-comparable public export JSON; see
[legacy-public-export.md](legacy-public-export.md). Phase 13 defines `old-vs-new-diff.v1` with
`review_required` diff output and a workflow guard for app/infrastructure boundaries; see
[diff-harness-contract.md](diff-harness-contract.md).

The v1 bounty formula is documented in [bounty-formula.md](bounty-formula.md); teamkills and
non-enemy kills award zero bounty points, and missing previous-rotation evidence uses zero
effectiveness factors.

Phase 5 exposes anonymous public statistics routes for overview, players, squads, rotations,
commander-side outcomes, bounty points, and leaderboards. Public API schemas are emitted
through the generated OpenAPI contract for `web`.

## Authentication

Phase 6 uses Steam OpenID for browser sign-in. Configure `PUBLIC_BASE_URL` so Steam can return
users to `GET /auth/steam/callback`. Session cookies are HttpOnly, `SameSite=Lax`, and
configurable through `SESSION_COOKIE_NAME` and `SESSION_TTL_SECONDS`. Set
`BOOTSTRAP_ADMIN_STEAM_ID` to recognize the initial admin account when that Steam user signs in.

- `GET /auth/steam/login` — redirect to Steam OpenID login, with optional relative `redirectTo`.
- `GET /auth/steam/callback` — verify Steam OpenID callback, create or update the user, set a session cookie, and redirect.
- `GET /auth/session` — return the current authenticated user or `{ authenticated: false }`.
- `POST /auth/logout` — delete the current session and expire the session cookie.
- `GET /admin/users` — list users and roles for role management.
- `PUT /admin/users/:id/roles` — replace a user's `admin`/`moderator` roles.
- `POST /requests` — create an authenticated player request.
- `GET /requests` — list the authenticated user's requests.
- `GET /requests/:id` — read status/detail for one authenticated user's request.
- `POST /requests/:id/attachments` — create a request attachment upload ticket for the request owner.
- `GET /requests/:id/attachments` — list attachment metadata for the request owner.
- `GET /moderation/requests` — list requests for moderator/admin review.
- `GET /moderation/requests/:id` — read moderation request detail and decision history.
- `POST /moderation/requests/:id/decision` — approve or reject a request with a moderator/admin comment.
- `POST /moderation/requests/:id/audit-patches` — create an audit patch for an approved stats correction request.
- `GET /moderation/requests/:id/audit-patches` — list audit patches for a moderated request.
- `POST /moderation/requests/:id/workflows` — record approved identity, Steam link, or legacy winner fix workflow actions.
- `GET /moderation/requests/:id/workflows` — list workflow actions for a moderated request.

Role management routes require an authenticated user with the `admin` role. Anonymous users
receive `401`, and authenticated users without `admin` receive `403`.

## Requests

Phase 7 starts with authenticated request creation and status APIs. Players can submit
`stats_correction`, `identity_correction`, `merge_split`, and `steam_link` requests with a text
description and an optional replay/player/squad/stat reference. References are validated through
an injected validator before a request is accepted. Request list/detail routes are scoped to
the current session user.

Request owners can reserve S3-backed attachment uploads. The API records attachment metadata
and returns a presigned PUT upload URL plus required headers. Attachment object keys use the
`attachments/{requestId}/` prefix.

Moderators and admins can review the request queue, inspect request history, and approve or
reject requests with comments. Approved stats correction requests can receive audit patches
that record the affected entity, JSON patch payload, reason, and recalculation status through
an injected recalculation hook. Approved requests can also record workflow actions for player
merge, player split, Steam linking, and manual legacy winner fixes.

## Database Schema

Phase 2 uses explicit PostgreSQL SQL migrations under `src/infra/db/migrations/`.

```bash
docker compose up -d postgres
pnpm run db:migrate
pnpm run test:schema
```

The migration ledger table is `schema_migrations`. The initial schema migration creates v1
lifecycle tables for users, roles, canonical player identity history, squads, rotations, replay
ingest evidence, parser jobs/results/events, aggregates, requests, attachments, moderation
actions, and audit patches.

## Production Compose

Phase 8 adds a single-VPS production Compose path:

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

See [deployment.md](deployment.md) for the deployment runbook and
[backup-restore.md](backup-restore.md) for PostgreSQL/S3-compatible backup and restore. The
production image runs compiled JavaScript with `pnpm run build` output, and the `migrate`
Compose service applies database migrations before the API starts.

## Project Status

The current milestone is v2.0 Backend Parity and Full-Run Readiness. Phase 13 is complete, and
the milestone is ready for audit and completion.

Phase 3 delivered ingest promotion and parser job lifecycle: staging rows from
`replays-fetcher` become canonical replays and durable parse jobs, RabbitMQ parse requests use
the parser worker contract, parser terminal results are recorded idempotently, and read-only
operator lifecycle APIs are exposed.

Phase 4 delivered parser artifact normalization and deterministic recalculation for player
stats, squad stats, commander-side outcomes, bounty points, and the shared parser-result
recalculation orchestration path. Phase 09 updates aggregate death semantics to use parser
compact player counters; see [parser-counter-semantics.md](parser-counter-semantics.md). Phase
10 added full-run coverage and recalculation commands; see
[full-run-recalculation.md](full-run-recalculation.md). Phase 11 added rotation and no-SteamID
identity readiness reporting; see [rotation-identity-readiness.md](rotation-identity-readiness.md).
Phase 12 added the legacy public export command; see [legacy-public-export.md](legacy-public-export.md).
Phase 13 added the old-vs-new diff contract and app workflow boundary guard; see
[diff-harness-contract.md](diff-harness-contract.md).

For live product context, milestone, roadmap, and GSD state, see `.planning/` (`PROJECT.md`,
`MILESTONES.md`, `ROADMAP.md`, `STATE.md`, and `research/SUMMARY.md`).
