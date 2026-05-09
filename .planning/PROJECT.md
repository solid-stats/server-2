# server-2

## What This Is

`server-2` is the TypeScript backend application for Solid Stats, a public SolidGames statistics platform. It is the source of truth and integration layer for replay ingestion, parser job orchestration, PostgreSQL persistence, aggregate statistics, Steam OAuth, roles, moderation, request handling, and operational visibility. It serves the `web` frontend, coordinates with `replays-fetcher`, and consumes parser output from `replay-parser-2`.

## Core Value

Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] Build a TypeScript + Fastify API service.
- [ ] Use PostgreSQL as the primary source of truth.
- [ ] Use RabbitMQ for parser jobs and background work.
- [ ] Use S3-compatible storage for replay files and request attachments.
- [ ] Support Steam OAuth login and session handling.
- [ ] Bootstrap an initial admin from configuration and manage roles through admin APIs.
- [ ] Expose public statistics APIs without requiring login.
- [ ] Require login for player-submitted correction and identity requests.
- [ ] Enforce moderator/admin roles for request review, role management, rotations, jobs, ingest conflicts, and manual legacy fixes.
- [ ] Integrate with `replay-parser-2` through durable parse jobs and RabbitMQ messages.
- [ ] Persist current raw/normalized parsed output and derived aggregates.
- [ ] Maintain canonical player identity, nickname history, SteamID history, squad identity, and squad membership history.
- [ ] Track rotations, assign replays to rotations, and filter stats/bounty points by rotation.
- [ ] Calculate player stats, squad stats, commander-side stats, and bounty points.
- [ ] Represent unknown legacy winners and allow moderated manual winner fixes with audit.
- [ ] Support correction, identity, merge/split, and Steam profile linking requests with S3-backed attachments.
- [ ] Preserve moderation audit and trigger aggregate recalculation after approved stat corrections.
- [ ] Promote `replays-fetcher` ingest staging/outbox records into canonical replay and parse job records.
- [ ] Detect checksum/source duplicate conflicts and expose manual conflict visibility.
- [ ] Publish an OpenAPI 3.x schema suitable for `openapi-typescript` consumption by `web`.
- [ ] Keep API schema updates in the same change as API behavior or payload changes.
- [ ] Provide health checks, metrics, failed job visibility, retry/reparse operations, and daily backup documentation.
- [ ] Support local development with Docker Compose and v1 production deployment on a single VPS using Docker Compose.
- [ ] Keep the service Kubernetes-ready for future horizontal worker scaling.

### Out of Scope

- Web UI implementation - owned by the `web` application.
- Rust parsing logic - owned by `replay-parser-2`.
- Replay source crawling and raw ingest implementation - owned by `replays-fetcher`.
- Production Kubernetes deployment in v1 - the service should be ready for future scaling, but v1 deploys with Docker Compose.
- Replay formats other than OCAP JSON - v1 targets the existing parser contract.
- Financial bounty rewards - bounty points are statistical/gameplay scoring only.
- Google Forms - requests belong in authenticated backend APIs.
- Full historical import from `~/sg_stats` into production - historical data is test/golden reference material for v1.
- Versioned parse result history - v1 can overwrite derived parse results while preserving moderation audit patches.
- Annual/yearly nomination statistics - legacy `src/!yearStatistics` and `~/sg_stats/year_results` remain deferred to v2.

## Context

Solid Stats spans four repositories/applications:

- `server-2`: backend source of truth and integration layer.
- `replays-fetcher`: discovers replay files, writes raw replay objects under S3 `raw/`, and writes ingest staging/outbox records.
- `replay-parser-2`: parses OCAP JSON replay files and returns normalized parser output.
- `web`: public and authenticated frontend that consumes `server-2` APIs and generated OpenAPI types.

The expected parser/ingest flow is:

1. `replays-fetcher` discovers replay files, stores raw objects in S3, and records staging/outbox evidence including source identity, object key, checksum, and size.
2. `server-2` polls/promotes staging rows, detects duplicate/conflict cases, and creates canonical `replays` records.
3. `server-2` creates durable `parse_jobs` records and publishes RabbitMQ parse requests containing `job_id`, `replay_id`, `object_key`, `checksum`, and `parser_contract_version`.
4. `replay-parser-2` parses the replay and returns completion or failure.
5. `server-2` persists current raw/normalized parsed data and recalculates aggregates.

The domain has historical data gaps:

- Future replay data is expected to include SteamID, but old data lacks it.
- A canonical player can have multiple nicknames and multiple SteamIDs.
- Multi-account and old/no-SteamID cases require moderated request support.
- Squad membership and nickname history should be replay-derived where possible.
- Commander-side winner data may be missing for legacy records and must be representable as unknown.

Public stats must support overview, player search/profile, squad search/profile, rotation filtering, commander-side stats, bounty stats, and leaderboards. In this domain, "KS" means commander of a side.

Bounty points are awarded for valid enemy kills based on the victim player's individual effectiveness in the previous rotation and the victim squad's effectiveness in the previous rotation. Teamkills do not award points. The v1 formula can be hardcoded but must be documented and tested.

Requests and moderation must support statistics correction, nickname/identity correction, canonical player merge/split where needed, and SteamID/profile linking issues. Single moderator approval is enough in v1, but every decision needs a comment and audit record. Approved stat corrections create audit patches and trigger aggregate recalculation.

Product-wide workflow standards:

- Use AI agents plus GSD workflow only.
- Keep README and planning docs current when scope, commands, architecture, validation data, or workflow changes.
- End completed work with a clean git tree by committing intended results.
- Do not delete completed work just to make status clean.
- Push back on requests that conflict with architecture, current logic, quality, maintainability, or proportional scope; explain the risk and propose safer alternatives.
- Check cross-application compatibility before execution.

Compatibility checks are risk-based:

- Local-only changes can rely on local planning docs, AGENTS rules, and `gsd-briefs`.
- Parser contract, ingest staging/source identity, RabbitMQ/S3 message, artifact shape, API/data model, canonical identity, auth, moderation, or UI-visible behavior changes require checking adjacent app docs/repos when available.
- If evidence is missing or contradictory, ask the user before proceeding.

## Constraints

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

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use TypeScript + Fastify | The brief requires a TypeScript backend with Fastify. | - Pending |
| Use PostgreSQL as source of truth | Canonical identity, stats, jobs, requests, and audit need relational integrity and durable querying. | - Pending |
| Use RabbitMQ for parser jobs | Parser orchestration needs durable async work and visible retry/failure state. | - Pending |
| Use S3-compatible storage | Replay files and attachments are object data and should remain outside PostgreSQL. | - Pending |
| Use Steam OAuth | Steam identity anchors user login and future player linking. | - Pending |
| Publish OpenAPI 3.x | `web` must generate frontend API types from the backend contract with `openapi-typescript`. | - Pending |
| Keep public stats anonymous | Public SolidGames stats should be accessible without login. | - Pending |
| Require authenticated correction requests | Request authors need a user identity and visible status/decision history. | - Pending |
| Use single moderator approval in v1 | Keeps moderation shippable while preserving decision comments and audit. | - Pending |
| Deploy v1 with Docker Compose on one VPS | Matches v1 operations scope while leaving room for Kubernetes-ready service boundaries. | - Pending |
| Keep parsing in `replay-parser-2` | `server-2` owns orchestration and persistence, not Rust parser logic. | - Pending |
| Keep crawling in `replays-fetcher` | `server-2` promotes staging evidence, not raw replay discovery. | - Pending |
| Allow v1 parse result overwrite | Avoids versioned parse history complexity while preserving audit patches. | - Pending |
| Defer yearly nomination statistics | Legacy yearly stats are historical reference material, not v1 product scope. | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-09 after initialization*
