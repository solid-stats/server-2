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

## Milestone: v2.0 -- Backend Parity and Full-Run Readiness

**Shipped:** 2026-05-12
**Phases:** 5 | **Plans:** 10 | **Sessions:** N/A

### What Was Built

- Parser compact player counters are preserved as backend evidence and used for public aggregate death semantics.
- Full-run recalculation and coverage commands report current parser result freshness, stale results, skipped inputs, failures, lifecycle counts, and changed aggregate rows.
- Rotation and no-SteamID identity readiness command exposes missing/overlapping rotation mappings, unresolved observed names, nickname-history evidence, and conflicts.
- Deterministic `legacy-public-export.v1` emits player, squad, rotation, relationship, weapon, weekly, metadata, and formula surfaces for parity comparison.
- `old-vs-new-diff.v1` defines strict diff failure classes, old/new metadata, corpus scopes, a narrow teamkill-death known-difference policy, and `review_required` output.
- `ops:boundary:check` prevents app workflows from taking over staging SSH, Kubernetes, Secret mutation, rollout orchestration, or kubeconfig usage.

### What Worked

- Keeping each parity concern in its own phase made the final audit straightforward: every requirement group mapped to one concrete operator surface or contract.
- The command-first approach gave operators repeatable evidence without adding premature public API surface area.
- Full `pnpm run verify` stayed stable after every phase, including OpenAPI checks, backup checks, boundary checks, PostgreSQL integration tests, and 100% V8 coverage.
- The diff contract stayed intentionally conservative, which prevents parity work from turning into a broad allowlist.

### What Was Inefficient

- Nyquist validation artifacts were reconstructed at milestone close rather than created during each phase.
- The GSD SDK generated placeholder milestone accomplishments, so the final milestone entry needed manual cleanup.
- The active shell still used Node v22.22.2 while the repo targets Node >=25 <26, causing repeated known engine warnings during verification.

### Patterns Established

- Operator parity commands live under `src/operations/` and are exposed through explicit `ops:*` package scripts.
- Backend parity exports use deterministic metadata, stable sorting, corpus-scope labels, and pinned timestamps for fixture generation.
- Documentation-only requirements still need validation artifacts that point to concrete docs checks or full verification commands.
- App/infrastructure ownership boundaries can be enforced with lightweight workflow scanners included in `pnpm run verify`.

### Key Lessons

1. Diff outputs should stay review-required until infrastructure and human review close the loop.
2. Known-difference policies should default to one documented class and require planning approval to broaden.
3. Parity milestones benefit from command-line evidence surfaces before public API or frontend work starts.
4. Validation artifacts should be generated during phase execution, not reconstructed during milestone closure.

### Cost Observations

- Model mix: N/A
- Sessions: N/A
- Notable: Autonomous execution worked well for phase throughput, but milestone-close SDK output needed review rather than blind acceptance.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | N/A | 9 | Initial backend build plus audit-driven closure phase |
| v2.0 | N/A | 5 | Backend parity evidence, deterministic export, review-required diff contract, and workflow boundary guard |

### Cumulative Quality

| Milestone | Tests | Coverage | Notes |
|-----------|-------|----------|-------|
| v1.0 | 190 | 100% V8 | Final audit verification passed; local Node engine warning remains |
| v2.0 | 230 | 100% V8 | Final verification passed with OpenAPI, backup, and boundary checks; local Node engine warning remains |

### Top Lessons (Verified Across Milestones)

1. Audit and completion artifacts need human review even when SDK helpers generate them.
2. Keep adjacent-app responsibilities explicit in backend docs so parity work does not absorb ingest, infrastructure, parser, or web scope.
