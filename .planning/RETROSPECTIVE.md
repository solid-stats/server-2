# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 -- MVP

**Shipped:** 2026-05-10
**Phases:** 9 | **Plans:** 39 | **Sessions:** N/A

### What Was Built

- TypeScript/Fastify backend runtime with typed configuration, structured logging, health checks, metrics, Swagger UI, OpenAPI generation, and verification scripts.
- PostgreSQL canonical domain model for users, roles, players, squads, rotations, replays, ingest staging, parse jobs, parser results, events, aggregates, requests, attachments, moderation actions, and audit patches.
- Durable ingest and parser lifecycle with staging promotion, duplicate conflict state, RabbitMQ parse request publishing, parser completion/failure handling, retry/reparse operations, and job history.
- Parser artifact persistence and deterministic recalculation for player, squad, commander-side, and bounty aggregates.
- Anonymous public stats API plus authenticated Steam sessions, role management, player requests, moderation decisions, audited corrections, identity workflows, and manual legacy winner fixes.
- Production Docker Compose, backup/restore runbook, OpenAPI drift verification, operational visibility, and final closure fixes for runtime integration gaps.

### What Worked

- Requirement traceability stayed explicit enough for the final audit to verify 68/68 v1 requirements.
- The inserted Phase 08.1 provided a clean way to close audit blockers without rewriting completed phase history.
- Keeping parser logic outside `server-2` preserved the boundary: this repo consumes parser artifacts and recalculates backend aggregates, but does not parse OCAP replay files.
- PostgreSQL-backed integration tests caught persistence and recalculation risks that route-level memory tests would have missed.

### What Was Inefficient

- Production store wiring landed late, which required a closure phase after the first milestone audit.
- OpenAPI and adjacent app contract handoff were documented, but consumption by `web`, `replays-fetcher`, and `replay-parser-2` remains outside this milestone.
- The active shell used Node v22.22.2 while the repo targets Node >=25 <26, so verification emitted known engine warnings.

### Patterns Established

- Fastify route modules use TypeBox schemas as the OpenAPI source.
- Runtime dependency adapters expose health-checkable interfaces.
- Parser job orchestration uses durable PostgreSQL state plus RabbitMQ publish/consume flows.
- Aggregate recalculation replaces normalized parser-event inputs before recomputing derived stats.
- Moderator approvals record auditable decisions and apply domain mutations through explicit workflow appliers.

### Key Lessons

1. Audit closure phases are useful when milestone verification finds integration gaps after nominal phase completion.
2. Public API work should include production read-model wiring before milestone audit, not only memory-backed route contracts.
3. Request approval workflows need tests that prove both audit history and domain mutation happened.
4. Adjacent app handoff should be planned as its own milestone when backend contracts become usable.

### Cost Observations

- Model mix: N/A
- Sessions: N/A
- Notable: Fine-grained phases improved traceability, but late production wiring increased rework near the milestone boundary.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | N/A | 9 | Initial backend build plus audit-driven closure phase |

### Cumulative Quality

| Milestone | Tests | Coverage | Notes |
|-----------|-------|----------|-------|
| v1.0 | 190 | 100% V8 | Final audit verification passed; local Node engine warning remains |

### Top Lessons (Verified Across Milestones)

1. Pending additional milestones.
