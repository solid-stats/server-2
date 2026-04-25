# server-2 - GSD New Project Brief

**Created:** 2026-04-24  
**Intended command:** `$gsd-new-project --auto @gsd-briefs/server-2.md`  
**Application:** `server-2`

This document initializes the TypeScript backend application for Solid Stats. It is one part of the product alongside `replays-parser-2` and `web`.

## Product Context

Solid Stats is a public SolidGames statistics platform. It needs fast replay ingestion, trustworthy derived statistics, player identity history, squad history, commander-side statistics, player correction requests, bounty points, and a polished public website.

`server-2` is the source of truth and integration layer. It owns API, PostgreSQL schema, Steam OAuth, roles, request moderation, parsing job orchestration, aggregate calculations, and operational visibility.

## Product-Wide GSD Workflow

Development across `replays-parser-2`, `server-2`, and `web` uses AI agents plus GSD workflow only.

The following standards apply product-wide:

- Keep README and planning docs current when scope, commands, architecture, validation data, or workflow changes.
- End completed work with a clean git tree by committing intended results; do not delete completed work just to make status clean.
- Push back on requests that conflict with architecture, current logic, quality, maintainability, or proportional scope; explain the risk and propose safer alternatives.
- Check cross-application compatibility before execution.

Compatibility checks are risk-based:

- Local-only changes can rely on local planning docs, AGENTS rules, and these `gsd-briefs`.
- Parser contract, RabbitMQ/S3 message, artifact shape, API/data model, canonical identity, auth, moderation, or UI-visible behavior changes require checking adjacent app docs/repos when available.
- If evidence is missing or contradictory, ask the user before proceeding.

## Core Value

Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing/storage/jobs observable and recoverable.

## v1 Scope

### Must-Haves

- TypeScript + Fastify backend.
- PostgreSQL as primary source of truth.
- RabbitMQ for parse jobs and background work.
- S3-compatible storage for replay files and request attachments.
- Steam OAuth authentication.
- Role management through admin panel after bootstrap admin.
- Public stats APIs with no login required.
- Authenticated request submission APIs.
- Moderator/admin APIs for request review, roles, rotations, jobs, and manual legacy data fixes.
- Parser integration with `replays-parser-2`.
- Raw parsed data plus aggregate stats persistence.
- Canonical player identity model.
- Nickname history and squad history.
- Commander-side stats, including unknown/manual legacy winners.
- Bounty points per rotation.
- Metrics stack integration, health checks, failed job visibility, daily backups.

### Out of Scope

- Web UI implementation. That belongs to `web`.
- Rust parsing logic. That belongs to `replays-parser-2`.
- Production Kubernetes deployment in v1.
- Supporting replay formats other than OCAP JSON.
- Financial bounty rewards.
- Google Forms.
- Full historical import from `~/sg_stats` into production.
- Versioned parse result history. v1 can overwrite derived parse results.

## Architecture

### Stack

- Runtime: Node.js with TypeScript.
- HTTP framework: Fastify.
- Database: PostgreSQL.
- Queue: RabbitMQ.
- Object storage: S3-compatible.
- Auth: Steam OAuth.
- Frontend client: `web`.
- Parser client/worker: `replays-parser-2`.

### Main Responsibilities

- Store replay file metadata.
- Create parsing jobs.
- Consume parser completion/failure results.
- Persist normalized parser output.
- Maintain canonical player/squad/rotation data.
- Calculate aggregate stats.
- Calculate bounty points.
- Expose APIs for public stats and authenticated workflows.
- Enforce roles and permissions.
- Store moderation audit.
- Expose operations/admin views for jobs and failures.

## Data Model Requirements

### Core Entities

- `users`: Steam-authenticated users.
- `roles`: admin/moderator/player permissions.
- `canonical_players`: real player identity.
- `player_nicknames`: nickname history with source/replay/time.
- `player_steam_ids`: multiple SteamIDs per canonical player.
- `squads`: squad identity.
- `squad_memberships`: historical player-squad membership.
- `rotations`: admin-defined periods.
- `replays`: replay metadata and object storage location.
- `parse_jobs`: queue/job state.
- `parse_results`: current normalized parsed output or references.
- `events`: normalized raw events required for audit/recalculation.
- `player_stats`: derived player aggregates.
- `squad_stats`: derived squad aggregates.
- `commander_side_stats`: commander-side participation and outcomes.
- `bounty_points`: per-rotation bounty point records.
- `requests`: player-submitted correction/identity requests.
- `request_attachments`: S3 objects linked to requests.
- `moderation_actions`: decisions, comments, audit trail.

### Identity Rules

- A canonical player can have multiple nicknames over time.
- A canonical player can have multiple SteamIDs.
- SteamID is expected in future replay data, but old data lacks it.
- Steam OAuth should auto-link to a canonical player when there is a reliable SteamID match.
- Multi-account and old/no-SteamID cases need moderated request support.
- Nickname history and squad history should be replay-derived where possible.

### Rotation Rules

- Rotations are admin-defined periods with start/end dates.
- Replays are assigned to rotations by timestamp.
- Stats and bounty points are filterable by rotation.
- Bounty weights use previous rotation effectiveness.

## Parser Integration

Recommended flow:

1. `web` or admin process uploads replay to `server-2`.
2. `server-2` stores the file in S3-compatible storage.
3. `server-2` creates a `replays` record and a `parse_jobs` record.
4. `server-2` publishes RabbitMQ parse request:
   - `job_id`
   - `replay_id`
   - `object_key`
   - `checksum`
   - `parser_contract_version`
5. `replays-parser-2` worker parses the replay.
6. `server-2` receives completion/failure result.
7. `server-2` persists current raw/normalized parsed data and recalculates aggregates.

v1 reprocessing may overwrite derived parse results. Moderation audit patches should still be preserved.

## Statistics

### Public Stats

Expose APIs for:

- Stats overview.
- Player list/search.
- Player profile.
- Squad list/search.
- Squad profile.
- Rotation filtering.
- Commander-side stats.
- Bounty stats and leaderboards.

Public stats do not require login.

### Commander-Side Stats

In this domain, "KS" means commander of a side.

Requirements:

- Track commander per side/replay where parser provides it.
- Track winner where parser provides it.
- Represent legacy missing winner as unknown.
- Allow moderators to manually fill old winners.
- Keep audit for manual outcome changes.

### Bounty Points

For each valid enemy kill, award points based on:

1. Victim player's individual effectiveness in the previous rotation.
2. Victim player's squad effectiveness in the previous rotation.

Rules:

- Teamkills do not award bounty points.
- Points are tracked per rotation.
- v1 formula can be hardcoded.
- No financial reward.
- Formula should be documented and tested.

## Requests and Moderation

### Request Types

v1 should support:

- Statistics correction.
- Nickname/identity correction.
- Canonical player merge/split where needed.
- SteamID/profile linking issues.

### Evidence

- Requests support text description.
- Requests support S3-backed attachments.
- Requests can reference replay/player/squad/stat entities.

### Moderation Flow

- Single moderator approval is enough in v1.
- Moderator must approve/reject with a comment.
- Player can see clear status and decision information.
- Approved stat correction creates an audit patch and triggers aggregate recalculation.
- Admins/moderators can review request history.

## Auth and Roles

- Steam OAuth is the login method.
- Public stats require no login.
- Request submission requires login.
- Moderation/admin APIs require appropriate role.
- Bootstrap admin comes from config/env.
- Admins can manage roles through admin API used by `web`.

## Operations

### Deployment

- Local development: Docker Compose.
- Production v1: Docker Compose on a single VPS.
- Services should be Kubernetes-ready for future horizontal worker scaling.

### Required Infrastructure

- PostgreSQL.
- RabbitMQ.
- S3-compatible storage.
- Metrics stack.
- Daily backups for PostgreSQL and object storage.

### Operational Features

- Health checks for API, DB, RabbitMQ, storage, and parser integration.
- Failed parse jobs visible and retryable.
- Queue depth and worker failure metrics.
- Structured parser/job error logs.
- Manual reparse trigger for selected replay(s).
- Backup and restore documentation.

## API Contract with web

`server-2` should expose typed API contracts usable by the React frontend:

- Public stats endpoints.
- Public player/squad/rotation/commander/bounty endpoints.
- Steam OAuth session endpoints.
- Request create/status endpoints.
- Attachment upload flow.
- Moderator request queue/detail/action endpoints.
- Admin role and rotation endpoints.
- Admin job/failure endpoints.

The API should be stable enough that `web` can develop independently against generated types or a shared OpenAPI/schema contract.

`server-2` must publish an OpenAPI 3.x schema suitable for `openapi-typescript` so `web` can generate request/response types directly from the backend contract.

API typing rules:

- The OpenAPI schema is the source of truth for frontend API typing.
- API behavior or payload changes update the OpenAPI schema in the same change.
- Breaking schema changes require a cross-project compatibility note for `web`.
- Generated frontend types should not require hand-maintained DTO mirrors.

## Suggested Requirements

### Infrastructure

- **INFRA-01**: App connects to PostgreSQL, RabbitMQ, and S3-compatible storage.
- **INFRA-02**: Local Docker Compose runs API dependencies.
- **INFRA-03**: Production Docker Compose configuration supports single VPS deployment.
- **INFRA-04**: Health checks and metrics cover API, queue, DB, storage, and workers.
- **INFRA-05**: Daily backup process covers PostgreSQL and S3-compatible storage.

### Auth

- **AUTH-01**: User can sign in with Steam OAuth.
- **AUTH-02**: Bootstrap admin can assign roles.
- **AUTH-03**: Public endpoints do not require login.
- **AUTH-04**: Request endpoints require login.
- **AUTH-05**: Admin/moderation endpoints enforce roles.

### Parsing Jobs

- **JOB-01**: Server creates parse jobs when replay files are added.
- **JOB-02**: Server publishes parse requests to RabbitMQ.
- **JOB-03**: Server records parse completion/failure.
- **JOB-04**: Admin can inspect and retry failed parse jobs.
- **JOB-05**: Server can trigger manual reparse.

### Data and Stats

- **DATA-01**: Schema supports canonical players, nickname history, SteamID history, squad history, rotations, replays, events, aggregates, requests, and audit.
- **DATA-02**: Server stores parser raw/normalized events plus aggregate stats.
- **STAT-01**: Server calculates player stats by rotation.
- **STAT-02**: Server calculates squad stats by rotation.
- **STAT-03**: Server calculates commander-side stats with known/unknown outcomes.
- **STAT-04**: Server calculates bounty points per rotation.

### Requests

- **REQ-01**: Player can submit correction/identity request.
- **REQ-02**: Request can include attachments.
- **REQ-03**: Moderator can approve/reject with comment.
- **REQ-04**: Approved stat correction patches data and recalculates aggregates.
- **REQ-05**: Request actions are audited.

### API Contract

- **API-01**: Server publishes an OpenAPI 3.x schema for public, auth, request, moderation, admin, and job endpoints consumed by `web`.
- **API-02**: The schema is compatible with `openapi-typescript` and updates with API changes.
- **API-03**: Verification catches missing or stale OpenAPI schema updates where practical.

## Suggested GSD Initialization Settings

- Granularity: Standard or Fine.
- Execution: Parallel where dependencies allow.
- Git tracking: Yes.
- Research: Yes.
- Plan Check: Yes.
- Verifier: Yes.
- Model profile: Balanced or Quality.

## Key Decisions

| Decision | Outcome |
|----------|---------|
| Backend stack | TypeScript + Fastify |
| DB | PostgreSQL |
| Queue | RabbitMQ |
| Storage | S3-compatible |
| Auth | Steam OAuth |
| Deployment v1 | Single VPS with Docker Compose |
| Future scaling | Kubernetes-ready |
| Parser ownership | `replays-parser-2` |
| UI ownership | `web` |
| API typing contract | OpenAPI 3.x schema consumed by `openapi-typescript` in `web` |
| Public stats | No login required |
| Historical archive | Test/golden baseline only |
| Reprocessing | Overwrite derived parser results in v1 |
| Moderation | Single approval plus audit |

## Follow-Up Details for Implementation Phases

- Exact S3-compatible provider: local MinIO vs external service.
- Exact Steam OAuth callback/domain configuration.
- Exact metrics stack choice.
- Exact hardcoded bounty formula.
- Exact OpenAPI schema generation/publication tooling and the `web` `openapi-typescript` integration command.
- Exact backup/restore commands.
