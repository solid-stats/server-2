---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: milestone_complete
stopped_at: Phase 8 plan 08-05 complete
last_updated: "2026-05-10T09:28:00+07:00"
last_activity: 2026-05-10 -- Phase 08 plan 08-05 completed
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 35
  completed_plans: 35
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.
**Current focus:** Phase 8 - Operations and Production Readiness

## Current Position

Phase: 08 — Operations and Production Readiness
Plan: 5 of 5 in current phase
Status: Milestone complete
Last activity: 2026-05-10 -- Phase 08 plan 08-05 completed

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 35
- Average duration: N/A
- Total execution time: N/A

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4/4 | - | - |
| 2 | 4/4 | - | - |
| 3 | 5/5 | - | - |
| 4 | 5/5 | - | - |
| 5 | 4/4 | - | - |
| 6 | 3/3 | - | - |
| 7 | 5/5 | - | - |
| 8 | 5/5 | - | - |

**Recent Trend:**

- Last 5 plans: Phase 08 plans 08-01 through 08-05
- Trend: Initial v1 milestone implementation complete

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Initialization: Use YOLO mode, standard granularity, parallel execution, git-tracked planning docs, balanced model profile, and workflow research/plan-check/verifier enabled.
- Initialization: Use MVP-mode phases for the initial roadmap.
- Initialization: Keep v1 deployment to Docker Compose on one VPS while preserving Kubernetes-ready boundaries.
- Phase 3: Staging promotion uses durable PostgreSQL state before RabbitMQ publish attempts.
- Phase 3: `processing` is the staging claim status for worker-safe promotion.
- Phase 3: Parser request messages mirror `replay-parser-2` contract fields, including structured SHA-256 checksum objects.
- Phase 3: Parser completion/failure handling persists artifact references and structured failures only; normalization remains Phase 4.
- Phase 3: Operator lifecycle APIs are read-only and OpenAPI-covered; final auth/role enforcement remains Phase 6.
- Phase 4: Parser artifact normalization consumes parser v3 artifact JSON snapshots only; `server-2` still does not parse raw OCAP replay files.
- Phase 4: Integration tests that share the local PostgreSQL database run sequentially to avoid cross-file truncate races.
- Phase 4: Statistics tests should use old `replays-parser/src/!tests/unit-tests/3 - statistics` cases as regression evidence for deaths, teamkills, vehicle kills, squad rollups, rotations, commander outcomes, and bounty formulas.
- Phase 4: Death stats are represented as `{ total, by_teamkills }`, preserving the old parser invariant that teamkill deaths increment both total deaths and the teamkill-death subcounter.
- Phase 4: Split suites follow `unit-tests-philosophy`: move decomposed units to `func/func.ts` with test files/helpers under `func/tests/*`; PostgreSQL-backed repository tests use `repository/tests/postgres.test.ts`.
- Phase 4: Commander-side aggregate rows preserve known wins, known losses, and unknown outcomes as separate counters; missing commander identity produces anonymous side rows.
- Phase 4: Bounty formula is `1 * (1 + previous player effectiveness) * (1 + previous squad effectiveness)`, with missing evidence as factor `0`; teamkills and non-enemy kills award zero points with exclusion evidence.
- Phase 4: Parser result recalculation now has a shared orchestration service that replaces normalized events before recalculating player/squad, commander-side, and bounty aggregates.
- Phase 5: Public stats routes are anonymous read-only Fastify routes with TypeBox schemas as the OpenAPI source.
- Phase 5: `GET /stats/overview` is the first public stats endpoint and accepts an optional `rotationId` filter.
- Phase 5: Player list/profile public routes use pagination, search, optional `rotationId`, and stable OpenAPI-visible response shapes.
- Phase 5: Squad list/profile public routes use pagination, search, optional `rotationId`, and the decomposed `routes/routes.ts` plus `routes/tests/*` layout.
- Phase 5: Rotation, commander-side, bounty, and leaderboard endpoints complete the anonymous public stats API contract.
- Phase 6: Steam browser authentication uses a narrow OpenID adapter, HttpOnly session cookies, and injectable user/session stores.
- Phase 6: Bootstrap admin is recognized from configured SteamID, and admin-shaped role management routes are OpenAPI-visible before enforcement in 06-03.
- Phase 6: Role management routes now require authenticated admin users via shared authorization pre-handlers.
- Phase 7: Request creation/status routes require login, scope reads to the current session user, and validate optional replay/player/squad/stat references through an injected validator.
- Phase 7: Request attachments use authenticated owner-scoped routes, recorded metadata, and S3-compatible presigned PUT upload URLs under `attachments/{requestId}/`.
- Phase 7: Moderation queue/detail/decision routes allow `moderator` or `admin` users, record approve/reject comments, and expose request history.
- Phase 7: Approved stats correction requests can create audit patches and trigger an injected recalculation hook.
- Phase 7: Approved workflow requests can record player merge, player split, Steam link, and manual legacy winner fix actions.
- Phase 8: Production v1 deploy path uses Dockerfile plus `docker-compose.prod.yml`, `.env.production`, a one-shot migration service, and persistent PostgreSQL/RabbitMQ/MinIO volumes.
- Phase 8: Runtime readiness now includes parser integration alongside PostgreSQL, RabbitMQ, and S3-compatible storage; Prometheus metrics include parser job outcomes, duration, worker failures, and observed queue depth.
- Phase 8: Parser job publishing logs include structured `job_id`, `replay_id`, object key, parser contract version, and retryable error payloads where available.
- Phase 8: Parse jobs now have durable `parse_job_history`; admin-only operations can retry failed/retryable jobs and create manual reparse jobs for selected replays.
- Phase 8: `openapi:verify` now detects stale committed OpenAPI artifacts without mutating the worktree, and API compatibility notes document future `web` generated-type expectations.
- Phase 8: Backup/restore runbook covers PostgreSQL and S3-compatible object storage, and `ops:backup:check` validates the runbook references production services, volumes, and restore checks.

### Pending Todos

None yet.

### Blockers/Concerns

- GSD subagents are not installed in this environment, so some workflow steps were executed inline.
- Local verification emits Node engine warnings because the active shell is Node v22.22.2 while the repo targets Node >=25 <26.
- Aggregate/bounty formula details, Steam auth protocol details, and production operations details need confirmation during later phase planning.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-09T20:16:00+07:00
Stopped at: Phase 8 plan 08-05 complete; initial v1 milestone implementation is complete
Resume file: .planning/ROADMAP.md
