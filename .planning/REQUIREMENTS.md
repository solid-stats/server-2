# Requirements: server-2

**Defined:** 2026-05-09
**Core Value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Server starts as a TypeScript Fastify application with typed configuration and structured logging.
- [ ] **INFRA-02**: Server connects to PostgreSQL, RabbitMQ, and S3-compatible storage through health-checkable adapters.
- [ ] **INFRA-03**: Local Docker Compose runs API dependencies for PostgreSQL, RabbitMQ, and S3-compatible storage.
- [ ] **INFRA-04**: Production Docker Compose configuration supports v1 deployment on a single VPS.
- [ ] **INFRA-05**: Health checks and metrics cover API, queue, DB, storage, and worker/job processing.
- [ ] **INFRA-06**: Daily backup and restore process covers PostgreSQL and S3-compatible storage.

### API Contract

- [ ] **API-01**: Server publishes an OpenAPI 3.x schema endpoint or artifact.
- [ ] **API-02**: The OpenAPI schema is compatible with `openapi-typescript` generation in `web`.
- [ ] **API-03**: API behavior or payload changes update the OpenAPI schema in the same change.
- [ ] **API-04**: Verification catches missing or stale OpenAPI schema updates where practical.

### Authentication and Roles

- [ ] **AUTH-01**: User can sign in through Steam authentication.
- [ ] **AUTH-02**: User session persists across requests and can be cleared by logout.
- [ ] **AUTH-03**: Bootstrap admin is created or recognized from configuration.
- [ ] **AUTH-04**: Admin can assign and revoke roles through role management APIs.
- [ ] **AUTH-05**: Public stats endpoints do not require login.
- [ ] **AUTH-06**: Request submission APIs require login.
- [ ] **AUTH-07**: Moderation and admin APIs enforce moderator/admin roles.

### Data Model

- [ ] **DATA-01**: Schema supports users, roles, canonical players, player nicknames, player SteamIDs, squads, squad memberships, rotations, replays, ingest staging, parse jobs, parse results, events, player stats, squad stats, commander-side stats, bounty points, requests, request attachments, and moderation actions.
- [ ] **DATA-02**: Replay records preserve source identity, object key, checksum, size, and promotion evidence from ingest.
- [ ] **DATA-03**: Canonical player model supports multiple nicknames and multiple SteamIDs over time.
- [ ] **DATA-04**: Squad membership history supports replay-derived membership over time.
- [ ] **DATA-05**: Rotations are admin-defined periods with start/end dates, and replays can be assigned by timestamp.
- [ ] **DATA-06**: Moderation audit records preserve decisions, comments, patches, and affected entities.

### Ingest

- [ ] **INGEST-01**: Server polls `replays-fetcher` staging/outbox records for pending replay candidates.
- [ ] **INGEST-02**: Server deduplicates replay candidates by checksum plus external source identity.
- [ ] **INGEST-03**: Server routes ambiguous duplicate conflicts to manual review instead of silently merging or skipping.
- [ ] **INGEST-04**: Server promotes accepted staged records into canonical `replays` records.
- [ ] **INGEST-05**: Server creates parse jobs for promoted replay records.
- [ ] **INGEST-06**: Server exposes staged, promoted, conflicted, and failed ingest status for admin/operator visibility where practical.

### Parsing Jobs

- [ ] **JOB-01**: Server creates durable parse jobs when replay files are promoted from ingest staging or accepted admin upload.
- [ ] **JOB-02**: Server publishes RabbitMQ parse requests containing `job_id`, `replay_id`, `object_key`, `checksum`, and `parser_contract_version`.
- [ ] **JOB-03**: Server records parser completion results.
- [ ] **JOB-04**: Server records parser failure results with structured error information.
- [ ] **JOB-05**: Admin can inspect and retry failed parse jobs.
- [ ] **JOB-06**: Admin can trigger manual reparse for selected replay records.
- [ ] **JOB-07**: Parser result handling is idempotent enough to avoid duplicate side effects from redelivery or retry.

### Statistics

- [x] **STAT-01**: Server stores current raw/normalized parser output required for audit and recalculation.
- [x] **STAT-02**: Server calculates player stats by rotation.
- [x] **STAT-03**: Server calculates squad stats by rotation.
- [x] **STAT-04**: Server calculates commander-side stats with known and unknown outcomes.
- [ ] **STAT-05**: Moderators can manually fill legacy missing winners with audit.
- [x] **STAT-06**: Server calculates bounty points per rotation using previous-rotation player and squad effectiveness.
- [x] **STAT-07**: Teamkills do not award bounty points.
- [x] **STAT-08**: Server recalculates affected aggregates after parser completion and approved corrections.
- [x] **STAT-09**: Bounty formula is documented and covered by tests.

### Public Stats APIs

- [ ] **PUB-01**: Public API exposes stats overview.
- [ ] **PUB-02**: Public API exposes player list/search and player profile.
- [ ] **PUB-03**: Public API exposes squad list/search and squad profile.
- [ ] **PUB-04**: Public API supports rotation filtering.
- [ ] **PUB-05**: Public API exposes commander-side stats.
- [ ] **PUB-06**: Public API exposes bounty stats and leaderboards.

### Requests and Moderation

- [ ] **REQ-01**: Player can submit statistics correction request.
- [ ] **REQ-02**: Player can submit nickname or identity correction request.
- [ ] **REQ-03**: Player can submit canonical player merge/split request where needed.
- [ ] **REQ-04**: Player can submit SteamID/profile linking issue request.
- [ ] **REQ-05**: Request can include text description.
- [ ] **REQ-06**: Request can include S3-backed attachments.
- [ ] **REQ-07**: Request can reference replay, player, squad, or stat entities.
- [ ] **REQ-08**: Moderator can approve or reject a request with a comment.
- [ ] **REQ-09**: Player can see clear request status and decision information.
- [ ] **REQ-10**: Approved stat correction creates an audit patch and triggers aggregate recalculation.
- [ ] **REQ-11**: Admins and moderators can review request history.

### Operations

- [ ] **OPS-01**: Health checks cover API, PostgreSQL, RabbitMQ, S3-compatible storage, and parser integration.
- [ ] **OPS-02**: Metrics include queue depth, worker failures, parse job outcomes, and job durations.
- [ ] **OPS-03**: Parser and job errors are logged with structured `job_id` and `replay_id` context where available.
- [ ] **OPS-04**: Failed parse jobs are visible and retryable.
- [ ] **OPS-05**: Manual reparse operations are visible in job history.
- [ ] **OPS-06**: Backup and restore documentation is available for v1 production operation.

## v2 Requirements

### Historical Statistics

- **HIST-01**: Product supports annual/yearly nomination statistics.
- **HIST-02**: Product imports full historical data from `~/sg_stats` into production.

### Parser History

- **PARSE-01**: Product preserves versioned parse result history across parser contract changes.

### Deployment

- **DEPLOY-01**: Production deployment runs on Kubernetes with horizontal worker scaling.

### Replay Formats

- **REPLAY-01**: Product supports replay formats beyond OCAP JSON.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Web UI implementation | Owned by the `web` application. |
| Rust parsing logic | Owned by `replay-parser-2`. |
| Replay source crawling and raw ingest implementation | Owned by `replays-fetcher`. |
| Production Kubernetes deployment in v1 | v1 deploys with Docker Compose on one VPS while keeping service boundaries Kubernetes-ready. |
| Replay formats other than OCAP JSON | v1 targets the existing parser contract. |
| Financial bounty rewards | Bounty points are non-financial gameplay/stat scoring. |
| Google Forms | Requests belong in authenticated backend APIs. |
| Full historical import from `~/sg_stats` into production | Historical data is v1 test/golden reference material only. |
| Versioned parse result history | v1 can overwrite derived parse results while preserving moderation audit patches. |
| Annual/yearly nomination statistics | Deferred to v2; legacy yearly results remain historical references. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 8 | Pending |
| INFRA-05 | Phase 8 | Pending |
| INFRA-06 | Phase 8 | Pending |
| API-01 | Phase 1 | Pending |
| API-02 | Phase 1 | Pending |
| API-03 | Phase 8 | Pending |
| API-04 | Phase 8 | Pending |
| AUTH-01 | Phase 6 | Pending |
| AUTH-02 | Phase 6 | Pending |
| AUTH-03 | Phase 6 | Pending |
| AUTH-04 | Phase 6 | Pending |
| AUTH-05 | Phase 5 | Pending |
| AUTH-06 | Phase 6 | Pending |
| AUTH-07 | Phase 6 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| DATA-06 | Phase 2 | Pending |
| INGEST-01 | Phase 3 | Complete |
| INGEST-02 | Phase 3 | Complete |
| INGEST-03 | Phase 3 | Complete |
| INGEST-04 | Phase 3 | Complete |
| INGEST-05 | Phase 3 | Complete |
| INGEST-06 | Phase 3 | Complete |
| JOB-01 | Phase 3 | Complete |
| JOB-02 | Phase 3 | Complete |
| JOB-03 | Phase 3 | Complete |
| JOB-04 | Phase 3 | Complete |
| JOB-05 | Phase 8 | Pending |
| JOB-06 | Phase 8 | Pending |
| JOB-07 | Phase 3 | Complete |
| STAT-01 | Phase 4 | Complete |
| STAT-02 | Phase 4 | Complete |
| STAT-03 | Phase 4 | Complete |
| STAT-04 | Phase 4 | Complete |
| STAT-05 | Phase 7 | Pending |
| STAT-06 | Phase 4 | Complete |
| STAT-07 | Phase 4 | Complete |
| STAT-08 | Phase 4 | Complete |
| STAT-09 | Phase 4 | Complete |
| PUB-01 | Phase 5 | Pending |
| PUB-02 | Phase 5 | Pending |
| PUB-03 | Phase 5 | Pending |
| PUB-04 | Phase 5 | Pending |
| PUB-05 | Phase 5 | Pending |
| PUB-06 | Phase 5 | Pending |
| REQ-01 | Phase 7 | Pending |
| REQ-02 | Phase 7 | Pending |
| REQ-03 | Phase 7 | Pending |
| REQ-04 | Phase 7 | Pending |
| REQ-05 | Phase 7 | Pending |
| REQ-06 | Phase 7 | Pending |
| REQ-07 | Phase 7 | Pending |
| REQ-08 | Phase 7 | Pending |
| REQ-09 | Phase 7 | Pending |
| REQ-10 | Phase 7 | Pending |
| REQ-11 | Phase 7 | Pending |
| OPS-01 | Phase 8 | Pending |
| OPS-02 | Phase 8 | Pending |
| OPS-03 | Phase 8 | Pending |
| OPS-04 | Phase 8 | Pending |
| OPS-05 | Phase 8 | Pending |
| OPS-06 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 68 total
- Mapped to phases: 68
- Unmapped: 0

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-09 after roadmap creation*
