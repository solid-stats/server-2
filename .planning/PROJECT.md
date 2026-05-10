# server-2

## What This Is

`server-2` is the shipped v1.0 TypeScript backend application for Solid Stats, a public SolidGames statistics platform. It is the source of truth and integration layer for replay ingest promotion, parser job orchestration, PostgreSQL persistence, aggregate statistics, Steam authentication, role management, moderation, request handling, and operational visibility. It serves the `web` frontend, coordinates with `replays-fetcher`, and consumes parser output from `replay-parser-2`.

## Current State

**Shipped version:** v1.0 MVP on 2026-05-10

v1.0 shipped 9 phases and 39 plans. The final milestone audit passed with 68/68 requirements, 9/9 phases, 17/17 integration checks, and 8/8 end-to-end flows. Final verification passed `pnpm run verify` with formatting, lint, typecheck, unit tests, PostgreSQL integration tests, OpenAPI drift verification, backup runbook checks, and 100% V8 coverage.

The active codebase is a Node.js/TypeScript Fastify backend with PostgreSQL, RabbitMQ, S3-compatible storage, OpenAPI generation, Steam OpenID authentication, persistent request/moderation stores, aggregate recalculation, operational routes, and Docker Compose deployment artifacts.

## Next Milestone Goals

Fresh requirements for the next milestone should be created with `$gsd-new-milestone`.

Known follow-up themes:

- Consume the v1.0 backend contract from `web`, including generated OpenAPI client types.
- Align `replays-fetcher` staging/outbox production data with the v1.0 promotion contract.
- Align `replay-parser-2` completion/failure payloads and artifact layout with the v1.0 parser job contract.
- Decide whether v1.1 should focus on cross-application integration, production hardening after deployment, or expanded historical/statistics features.

## Core Value

Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.

## Requirements

### Validated

- [x] Build a TypeScript + Fastify API service. - v1.0
- [x] Use PostgreSQL as the primary source of truth. - v1.0
- [x] Use RabbitMQ for parser jobs and background work. - v1.0
- [x] Use S3-compatible storage for replay files, parser artifacts, and request attachments. - v1.0
- [x] Support Steam authentication and session handling. - v1.0
- [x] Bootstrap an initial admin from configuration and manage roles through admin APIs. - v1.0
- [x] Expose public statistics APIs without requiring login. - v1.0
- [x] Require login for player-submitted correction and identity requests. - v1.0
- [x] Enforce moderator/admin roles for request review, role management, rotations, jobs, ingest conflicts, and manual legacy fixes. - v1.0
- [x] Integrate with `replay-parser-2` through durable parse jobs and RabbitMQ messages. - v1.0
- [x] Persist current raw/normalized parsed output and derived aggregates. - v1.0
- [x] Maintain canonical player identity, nickname history, SteamID history, squad identity, and squad membership history. - v1.0
- [x] Track rotations, assign replays to rotations, and filter stats/bounty points by rotation. - v1.0
- [x] Calculate player stats, squad stats, commander-side stats, and bounty points. - v1.0
- [x] Represent unknown legacy winners and allow moderated manual winner fixes with audit. - v1.0
- [x] Support correction, identity, merge/split, and Steam profile linking requests with S3-backed attachments. - v1.0
- [x] Preserve moderation audit and trigger aggregate recalculation after approved stat corrections. - v1.0
- [x] Promote `replays-fetcher` ingest staging/outbox records into canonical replay and parse job records. - v1.0
- [x] Detect checksum/source duplicate conflicts and expose manual conflict visibility. - v1.0
- [x] Publish an OpenAPI 3.x schema suitable for `openapi-typescript` consumption by `web`. - v1.0
- [x] Keep API schema updates in the same change as API behavior or payload changes. - v1.0
- [x] Provide health checks, metrics, failed job visibility, retry/reparse operations, and daily backup documentation. - v1.0
- [x] Support local development with Docker Compose and v1 production deployment on a single VPS using Docker Compose. - v1.0
- [x] Keep the service Kubernetes-ready for future horizontal worker scaling. - v1.0

### Active

- [ ] Define the next milestone requirements with `$gsd-new-milestone`.

### Out of Scope

- Web UI implementation - owned by the `web` application.
- Rust parsing logic - owned by `replay-parser-2`.
- Replay source crawling and raw ingest implementation - owned by `replays-fetcher`.
- Production Kubernetes deployment in v1 - v1 deploys with Docker Compose on one VPS; future Kubernetes work remains a later milestone.
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
5. `server-2` loads parser artifacts from S3-compatible storage, persists current raw/normalized parsed data, and recalculates aggregates.

The domain has historical data gaps:

- Future replay data is expected to include SteamID, but old data lacks it.
- A canonical player can have multiple nicknames and multiple SteamIDs.
- Multi-account and old/no-SteamID cases require moderated request support.
- Squad membership and nickname history should be replay-derived where possible.
- Commander-side winner data may be missing for legacy records and must be representable as unknown.

Public stats support overview, player search/profile, squad search/profile, rotation filtering, commander-side stats, bounty stats, and leaderboards. In this domain, "KS" means commander of a side.

Bounty points are awarded for valid enemy kills based on the victim player's individual effectiveness in the previous rotation and the victim squad's effectiveness in the previous rotation. Teamkills do not award points. The v1 formula is documented and tested.

Requests and moderation support statistics correction, nickname/identity correction, canonical player merge/split where needed, SteamID/profile linking issues, and manual legacy winner fixes. Single moderator approval is enough in v1, but every decision needs a comment and audit record. Approved stat corrections create audit patches and trigger aggregate recalculation.

Product-wide workflow standards:

- Use AI agents plus GSD workflow only.
- Keep README and planning docs current when scope, commands, architecture, validation data, or workflow changes.
- Keep workflow-critical GSD config aligned product-wide, while `agent_skills` stay stack-aware for each repo.
- End completed work with a clean git tree by committing intended results.
- Do not delete completed work just to make status clean.
- Push back on requests that conflict with architecture, current logic, quality, maintainability, or proportional scope; explain the risk, propose safer alternatives or a GSD plan, and ask for explicit confirmation before risky overrides.
- Check cross-application compatibility before execution.
- Apply these workflow rules product-wide across `replays-fetcher`, `replay-parser-2`, `server-2`, and `web`.

Compatibility checks are risk-based:

- Local-only changes can rely on local planning docs, AGENTS rules, and `gsd-briefs`.
- Parser contract, ingest staging/source identity, RabbitMQ/S3 message, artifact shape, API/data model, canonical identity, auth, moderation, or UI-visible behavior changes require checking adjacent app docs/repos when available.
- If evidence is missing or contradictory, ask the user before proceeding.

## Constraints

- **Runtime**: Node.js with TypeScript - matches the requested backend stack and frontend ecosystem.
- **HTTP framework**: Fastify - requested stack for a typed, performant API service.
- **Database**: PostgreSQL - primary source of truth for canonical entities, jobs, stats, requests, roles, and audit.
- **Queue**: RabbitMQ - parser jobs and background work must be durable and observable.
- **Storage**: S3-compatible object storage - replay files, parser artifacts, and attachments must not live in PostgreSQL.
- **Authentication**: Steam OpenID/OAuth-style browser authentication - the product identity anchor for authenticated users and player profile linking.
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
| Use TypeScript + Fastify | The brief requires a TypeScript backend with Fastify. | Good - shipped v1.0 |
| Use PostgreSQL as source of truth | Canonical identity, stats, jobs, requests, and audit need relational integrity and durable querying. | Good - shipped v1.0 |
| Use RabbitMQ for parser jobs | Parser orchestration needs durable async work and visible retry/failure state. | Good - shipped v1.0 |
| Use S3-compatible storage | Replay files, parser artifacts, and attachments are object data and should remain outside PostgreSQL. | Good - shipped v1.0 |
| Use Steam authentication | Steam identity anchors user login and future player linking. | Good - shipped v1.0 with narrow Steam OpenID adapter |
| Publish OpenAPI 3.x | `web` must generate frontend API types from the backend contract with `openapi-typescript`. | Good - generated artifact and drift check shipped |
| Keep public stats anonymous | Public SolidGames stats should be accessible without login. | Good - public stats routes remain anonymous |
| Require authenticated correction requests | Request authors need a user identity and visible status/decision history. | Good - persistent session-backed requests shipped |
| Use single moderator approval in v1 | Keeps moderation shippable while preserving decision comments and audit. | Good - shipped with audited decisions |
| Deploy v1 with Docker Compose on one VPS | Matches v1 operations scope while leaving room for Kubernetes-ready service boundaries. | Good - production Compose and runbooks shipped |
| Keep parsing in `replay-parser-2` | `server-2` owns orchestration and persistence, not Rust parser logic. | Good - parser artifacts are consumed, raw OCAP is not parsed here |
| Keep crawling in `replays-fetcher` | `server-2` promotes staging evidence, not raw replay discovery. | Good - staging promotion boundary shipped |
| Allow v1 parse result overwrite | Avoids versioned parse history complexity while preserving audit patches. | Good - current snapshot plus audit patch model shipped |
| Defer yearly nomination statistics | Legacy yearly stats are historical reference material, not v1 product scope. | Pending for v2 |
| Use durable PostgreSQL state before RabbitMQ publish attempts | Prevents lost parser jobs and makes retries observable. | Good - shipped v1.0 |
| Store parser artifact snapshots separately from normalized events | Keeps audit/recalculation evidence while preserving queryable aggregates. | Good - shipped v1.0 |
| Use PostgreSQL-backed production stores for auth, requests, moderation, and audit | In-memory stores are only acceptable test/dev seams. | Good - closed in Phase 08.1 |
| Apply approved workflow actions before recording moderation history | Request approvals must mutate canonical identity/stat state, not just log decisions. | Good - closed in Phase 08.1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:

1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

**After each milestone**:

1. Full review of all sections.
2. Core Value check.
3. Audit Out of Scope reasons.
4. Update Context with current state.

---
*Last updated: 2026-05-10 after v1.0 milestone*
