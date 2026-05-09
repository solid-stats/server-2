# Phase 2: Domain Schema and Identity Foundation - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure/data-schema phase)

<domain>
## Phase Boundary

Phase 2 delivers PostgreSQL migration infrastructure and the canonical v1 domain schema needed by ingest, parser results, statistics, requests, roles, and audit. It creates schema, status enums, repository/test foundations, and timestamp-aware identity/history tables. It does not implement ingest promotion behavior, parser RabbitMQ publishing/consuming, aggregate calculations, public stats endpoints, Steam auth flows, request workflow APIs, or production operations hardening.

</domain>

<decisions>
## Implementation Decisions

### Data Ownership and Boundaries
- Preserve observed replay/source/player identity as database evidence; do not collapse observed parser identity into canonical identity during parsing or ingest.
- Keep canonical player matching and merge/split state in `server-2`; parser output remains source evidence.
- Store replay file bytes and request attachments in S3-compatible storage; PostgreSQL stores metadata, object keys, checksums, references, and audit records only.
- Keep raw replay discovery and crawling outside `server-2`; this phase may model ingest staging evidence but must not implement fetcher behavior.

### Migration and Schema Foundation
- Use explicit PostgreSQL migrations managed from TypeScript project scripts.
- Prefer readable SQL-shaped schema changes over opaque ORM behavior for lifecycle tables and aggregate-heavy future work.
- Establish deterministic naming for tables, status enums, indexes, and foreign keys.
- Add schema tests that prove tables/enums/indexes exist and key constraints reject destructive identity overwrites.

### Identity and History Model
- Canonical players must support many nicknames and many SteamIDs over time.
- Squad membership history must be timestamp-aware and replay-derived evidence must remain queryable.
- Rotations are admin-defined periods with start/end dates; replay assignment by timestamp is modeled but assignment logic can be implemented later.
- Moderation audit records must preserve decisions, comments, patches, and affected entities without overwriting historical evidence.

### the agent's Discretion
Exact migration runner package, table column naming details, and repository helper shape are at the agent's discretion if they satisfy the roadmap requirements, Phase 1 patterns, and cross-application boundaries.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/env.ts` provides `DATABASE_URL` through typed config.
- `src/infra/db/client.ts` owns PostgreSQL connectivity with `pg.Pool`.
- `src/test/integration/adapters.test.ts` already verifies Compose-backed PostgreSQL access.
- `docker-compose.yml` runs PostgreSQL on host port `15432`.

### Established Patterns
- Node 24 target, ESM, strict TypeScript, npm scripts, and Vitest are established.
- App factory and runtime process startup are separate.
- Infrastructure code lives under `src/infra/`; domain modules live under `src/modules/`.
- README must stay current when commands, architecture direction, or workflow changes.

### Integration Points
- Migration scripts should use the same `DATABASE_URL` configuration path used by the API.
- Schema tests should run against the Compose PostgreSQL service.
- Future phases will consume tables for ingest promotion, parser jobs/results, aggregate recalculation, public APIs, auth, requests, moderation, and operations.

</code_context>

<specifics>
## Specific Ideas

- Start with one initial v1 schema migration plus a migrations ledger.
- Add `npm run db:migrate` and a schema integration test command.
- Keep status enums explicit for ingest, parse jobs, requests, moderation actions, and replay lifecycle.
- Use SQL assertions in integration tests to verify critical tables, enums, indexes, and constraints.

</specifics>

<deferred>
## Deferred Ideas

- Ingest polling, duplicate resolution behavior, and RabbitMQ parse message publishing belong to Phase 3.
- Parser result persistence and aggregate formulas belong to Phase 4.
- Public API response shapes belong to Phase 5.
- Steam authentication/session behavior belongs to Phase 6.
- Request submission/moderation APIs and patch application behavior belong to Phase 7.
- Production backup/restore hardening belongs to Phase 8.

</deferred>

---

*Phase: 2-Domain Schema and Identity Foundation*
*Context gathered: 2026-05-09*
