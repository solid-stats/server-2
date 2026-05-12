# server-2

## What This Is

`server-2` is the shipped v2.0 TypeScript backend application for Solid Stats, a public SolidGames statistics platform. It is the source of truth and integration layer for replay ingest promotion, parser job orchestration, PostgreSQL persistence, aggregate statistics, Steam authentication, role management, moderation, request handling, operational visibility, backend parity exports, and full-run readiness evidence. It serves the `web` frontend, coordinates with `replays-fetcher`, and consumes parser output from `replay-parser-2`.

## Current State

**Shipped version:** v2.0 Backend Parity and Full-Run Readiness on 2026-05-12

v1.0 shipped 9 phases and 39 plans. v2.0 shipped 5 phases and 10 plans. The v2.0 milestone audit passed with 34/34 requirements, 5/5 phases, 10/10 integration checks, and 10/10 wired flows. Final verification passed `pnpm run verify` with formatting, lint, typecheck, unit tests, PostgreSQL integration tests, OpenAPI drift verification, backup runbook checks, app workflow boundary checks, and 100% V8 coverage.

The active codebase is a Node.js/TypeScript Fastify backend with PostgreSQL, RabbitMQ, S3-compatible storage, OpenAPI generation, Steam OpenID authentication, persistent request/moderation stores, aggregate recalculation, operational routes, Docker Compose deployment artifacts, full-run stats readiness commands, deterministic legacy export, and review-required diff contract artifacts.

## Next Milestone

No active milestone is defined. Start the next cycle with `$gsd-new-milestone`.

Likely next work belongs primarily to adjacent applications:

- `replays-fetcher`: resumable and observable full-corpus ingest.
- `infrastructure`: controlled full-corpus run, legacy snapshot capture, artifact storage, and runtime orchestration.
- `web`: public stats UI after backend parity evidence and API/export contracts stabilize.
- `server-2`: respond to concrete parity findings or API needs discovered by those milestones.

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
- [x] Consume parser compact counters for public-stat aggregate semantics. - v2.0
- [x] Provide full-run recalculation, freshness, and coverage evidence. - v2.0
- [x] Make rotation and no-SteamID identity readiness reportable before parity review. - v2.0
- [x] Export legacy-comparable public statistics surfaces from `server-2`. - v2.0
- [x] Define the old-vs-new diff contract for strict parity review. - v2.0
- [x] Keep app workflows from taking over infrastructure-owned staging SSH, Kubernetes, Secret, rollout, or kubeconfig orchestration. - v2.0

### Active

- [ ] Respond to concrete full-corpus diff findings after infrastructure runs the controlled parity gate.
- [ ] Support public API changes needed by `web` after parity evidence stabilizes.
- [ ] Add annual/yearly nomination statistics in a dedicated historical-statistics milestone.

### Out of Scope

- Web UI implementation - owned by the `web` application.
- Rust parsing logic - owned by `replay-parser-2`.
- Replay source crawling and raw ingest implementation - owned by `replays-fetcher`.
- Production Kubernetes deployment in `server-2` app workflow - infrastructure owns Kubernetes runtime orchestration.
- Replay formats other than OCAP JSON - v1 targets the existing parser contract.
- Financial bounty rewards - bounty points are statistical/gameplay scoring only.
- Google Forms - requests belong in authenticated backend APIs.
- Full historical import from `~/sg_stats` into production - historical data is test/golden reference material for v1.
- Versioned parse result history - v1 can overwrite derived parse results while preserving moderation audit patches.
- Annual/yearly nomination statistics - legacy `src/!yearStatistics` and `~/sg_stats/year_results` remain deferred to a dedicated historical-statistics milestone.
- Production traffic cutover approval - parity output is review evidence, not automatic approval to switch traffic.

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

Shipped v2.0 parity sequence:

1. `server-2` defines and implements parser-counter semantics, recalculation evidence, readiness reports, legacy-compatible exports, and diff contracts. - shipped in v2.0
2. `replays-fetcher` makes the full corpus resumable and observable enough to feed the parity gate. - future adjacent-app milestone
3. `infrastructure` runs the controlled full corpus, captures legacy `sg_stats` snapshots, stores evidence, and keeps production cutover blocked pending review. - future adjacent-app milestone
4. `replay-parser-2` changes only if `server-2` finds compact counter or artifact evidence insufficient. - future blocker-driven work
5. `web` waits for trusted backend data and a stable API/export contract before product UI implementation. - future adjacent-app milestone

Legacy `sg_stats` snapshot access details are operator-provided session context and should be passed through runtime configuration or runbooks without committing private key material or secret values.

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
| Defer yearly nomination statistics | Legacy yearly stats are historical reference material, not current backend parity scope. | Pending for future historical-statistics milestone |
| Use durable PostgreSQL state before RabbitMQ publish attempts | Prevents lost parser jobs and makes retries observable. | Good - shipped v1.0 |
| Store parser artifact snapshots separately from normalized events | Keeps audit/recalculation evidence while preserving queryable aggregates. | Good - shipped v1.0 |
| Use PostgreSQL-backed production stores for auth, requests, moderation, and audit | In-memory stores are only acceptable test/dev seams. | Good - closed in Phase 08.1 |
| Apply approved workflow actions before recording moderation history | Request approvals must mutate canonical identity/stat state, not just log decisions. | Good - closed in Phase 08.1 |
| Use `server-2` parity outputs before `web` implementation | Public UI work should not build on stale, skipped, or unproven aggregate data. | Good - shipped v2.0 backend parity outputs |
| Treat parser compact player counters as replay-level public-stat evidence | Death counters such as `d`, `td`, `su`, `nkd`, and `ud` cannot be safely derived only from attacker kill rows. | Good - shipped v2.0 |
| Keep old-vs-new diff output as `review_required` | A clean or explainable diff is evidence for human review, not automatic production cutover approval. | Good - shipped v2.0 |
| Keep known parity differences narrow | Broad allowlists hide public-stat drift and should require explicit planning decisions. | Good - `deaths_by_teamkills_duplicate_slot_respawn` is the only default known difference |
| Keep app workflows out of infrastructure orchestration | Runtime rollout, Kubernetes operations, and secret mutation belong in infrastructure automation. | Good - `ops:boundary:check` shipped in v2.0 |

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
*Last updated: 2026-05-12 after v2.0 milestone completion*
