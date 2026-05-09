# Phase 3: Ingest Promotion and Parser Job Lifecycle - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the reliable replay ingest and parser-job lifecycle inside `server-2`: polling/promoting `replays-fetcher` staging rows, handling duplicates/conflicts without silent data loss, creating durable `parse_jobs`, publishing RabbitMQ parse requests, recording parser completion/failure state idempotently, and exposing read-only operator status APIs. It does not fetch external replay sources, parse OCAP contents, persist full normalized parser aggregates, implement retry/reparse actions, or enforce final auth/role policy.

</domain>

<decisions>
## Implementation Decisions

### Staging and Promotion Handoff
- **D-01:** In v1, `replays-fetcher` writes only staging/outbox tables in the `server-2` PostgreSQL database. `server-2` owns canonical `replays`, `parse_jobs`, conflict handling, and parser orchestration.
- **D-02:** `server-2` should claim pending staging rows in batches through a transaction using row locks/`SKIP LOCKED` or an equivalent safe claiming mechanism so parallel workers do not promote the same candidate twice.
- **D-03:** Temporary promotion failures should leave recoverable status and structured error/details for retry. Do not lose staging evidence and do not leave operators with invisible stuck rows.
- **D-04:** The atomic DB promotion unit is canonical replay creation/update, durable `parse_jobs` creation, and staging status update in one transaction. RabbitMQ publish happens after that from durable job state.

### Duplicate and Conflict Policy
- **D-05:** Checksum is the primary byte-level dedupe signal. If SHA-256 matches an existing replay, it represents the same raw replay bytes.
- **D-06:** If checksum matches but source identity differs, do not create a new replay. Attach the new source identity and promotion evidence to the existing replay lineage.
- **D-07:** If `source_system + source_replay_id` matches an existing record but checksum/object key differ, mark the staging row as a conflict for manual review. Do not use latest-wins or silently ignore the new evidence.
- **D-08:** Conflict evidence should preserve both sides: source IDs/URLs when available, object keys, checksums, sizes, timestamps, existing replay/staging refs, and a reason code or explanation.

### Parse Job Publishing
- **D-09:** Use a DB-backed publisher. Promotion leaves `parse_jobs` queued; a publisher selects queued/retryable jobs, publishes with RabbitMQ publisher confirms, then marks jobs as published.
- **D-10:** Lock simple RabbitMQ contract names/defaults during Phase 3 so `server-2` and `replay-parser-2` use the same queues/routing keys. Exact names may be configurable, but documented defaults must exist.
- **D-11:** Parse request messages must stay minimal and match parser expectations: `job_id`, `replay_id`, `object_key`, `checksum`, and `parser_contract_version`.
- **D-12:** If publish confirm is not received or RabbitMQ is unavailable, keep/revert the job to queued or a retryable publish state with attempt/error details. Do not mark this as parser failure and do not block staging promotion on broker availability.

### Parser Result Handling
- **D-13:** `parse.completed` should carry an artifact reference rather than the full artifact: `job_id`, `replay_id`, `parser_contract_version`, artifact object key/checksum/size, and lightweight timing/context.
- **D-14:** `parse.failed` should carry structured failure data: `job_id`, `replay_id`, category/code/message, retryable flag, `parser_contract_version`, and safe timing/log context without secrets.
- **D-15:** Completion/failure handling must be idempotent by `job_id`. Compatible duplicate or late terminal results should be acknowledged/ignored without new side effects; record duplicate evidence only if useful.
- **D-16:** On successful completion in Phase 3, persist terminal job state plus artifact reference/current parser-result placeholder. Deep artifact normalization, parser events, and aggregate recalculation remain Phase 4.

### Operator Status APIs
- **D-17:** Phase 3 should expose read-only, OpenAPI-covered lifecycle visibility APIs for staging/conflicts and parse jobs. Retry/reparse/resolve actions remain Phase 8 unless planning finds a tiny internal primitive necessary for tests.
- **D-18:** Required filters are status plus IDs and identity fields useful for operations: `replay_id`, `source_system`, `source_replay_id`, `checksum`, `job_id`, and pagination. Broad text search is out of scope.
- **D-19:** Because full auth/roles arrive in Phase 6, Phase 3 routes should be shaped like future admin/operator APIs but explicitly document that final authorization enforcement is deferred.
- **D-20:** Detail responses should return evidence summaries: status, IDs, timestamps, attempts, structured error, and summarized promotion/conflict evidence. Do not expose raw large artifacts or leak arbitrary internal JSON by default.

### the agent's Discretion
Exact service/repository boundaries, batch sizes, retry timing, internal enum refinements, RabbitMQ exchange/routing key names, and API path names are at the agent's discretion if they preserve the decisions above, current schema direction, OpenAPI compatibility, and adjacent-app contracts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope and Phase Contract
- `.planning/PROJECT.md` - `server-2` ownership, boundaries, and product-wide workflow rules.
- `.planning/REQUIREMENTS.md` - Phase 3 requirements: `INGEST-01` through `INGEST-06`, `JOB-01` through `JOB-04`, and `JOB-07`.
- `.planning/ROADMAP.md` - Phase 3 goal, success criteria, and planned slices.
- `.planning/STATE.md` - Current project position and blockers/concerns.
- `.planning/research/SUMMARY.md` - Phase 3 research flags and core reliability pitfalls.

### Prior Phase Decisions
- `.planning/phases/01-api-foundation-and-runtime-infrastructure/01-CONTEXT.md` - Fastify/OpenAPI, infrastructure adapter, queue/storage, and verification decisions.
- `.planning/phases/02-domain-schema-and-identity-foundation/02-CONTEXT.md` - Replay evidence, identity boundary, migration/schema, and deferred Phase 3 decisions.

### Existing Code
- `src/infra/db/migrations/0001_v1_domain_schema.sql` - Existing `ingest_staging_records`, `replays`, `parse_jobs`, `parser_results`, lifecycle enums, and indexes.
- `src/infra/queue/client.ts` - Existing RabbitMQ connectivity adapter to extend beyond health checks.
- `src/modules/operations/routes.ts` - Existing TypeBox/OpenAPI route pattern for operational endpoints.
- `src/app.ts` - Existing app factory and module registration pattern.

### Adjacent App Contracts
- `/home/afgan0r/Projects/SolidGames/replays-fetcher/.planning/PROJECT.md` - Fetcher boundary: writes S3 raw objects and staging/outbox records only.
- `/home/afgan0r/Projects/SolidGames/replays-fetcher/.planning/ROADMAP.md` - Fetcher Phase 4 staging/promotion handoff expectations.
- `/home/afgan0r/Projects/SolidGames/replays-fetcher/.planning/STATE.md` - Current fetcher state and open staging schema concern.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/PROJECT.md` - Parser worker message/result ownership and artifact-reference direction.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/STATE.md` - Validated worker behavior: consumes parse requests, writes `artifacts/v3/...`, publishes `parse.completed`/`parse.failed`, and uses ack-after-publish behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/infra/db/client.ts` and `src/infra/db/migrate.ts` provide PostgreSQL connection/migration foundations for new repositories/services.
- `src/infra/db/migrations/0001_v1_domain_schema.sql` already creates the lifecycle tables and enums Phase 3 should build on.
- `src/infra/queue/client.ts` currently health-checks RabbitMQ; Phase 3 can evolve it into publish/consume adapters.
- `src/modules/operations/routes.ts` shows the current Fastify + TypeBox schema pattern and OpenAPI tags.
- `src/test/integration/schema.test.ts` and adapter tests show the current Docker Compose-backed verification style.

### Established Patterns
- TypeScript is strict ESM with Fastify app factory separated from process startup.
- Infrastructure code lives under `src/infra/`; route modules live under `src/modules/`.
- Route schemas are the OpenAPI source of truth; do not hand-maintain DTO mirrors for `web`.
- SQL-shaped schema/repository work is preferred over opaque ORM behavior.
- README and planning docs must stay current when commands, architecture direction, workflow, or phase scope changes.

### Integration Points
- Promotion logic connects `ingest_staging_records` to `replays` and `parse_jobs`.
- Publisher logic connects queued `parse_jobs` to RabbitMQ parse request messages consumed by `replay-parser-2`.
- Result consumers connect parser completion/failure messages back to `parse_jobs` and `parser_results`.
- Status APIs connect lifecycle tables to future admin/operator UI through OpenAPI-covered backend routes.

</code_context>

<specifics>
## Specific Ideas

- Prefer an outbox-like publisher backed directly by `parse_jobs` instead of adding a separate outbox table unless planning finds a concrete need.
- Keep Phase 3 success handling to artifact-reference state only; Phase 4 owns artifact normalization and aggregate recalculation.
- Use evidence summaries in APIs to keep operator visibility useful without exposing arbitrary raw JSONB as the public contract.

</specifics>

<deferred>
## Deferred Ideas

- Retry, manual reparse, and conflict resolution actions belong primarily to Phase 8 operations hardening.
- Full parser artifact normalization, parser event persistence, and aggregate recalculation belong to Phase 4.
- Final moderator/admin authorization enforcement belongs to Phase 6.
- Broad text search over lifecycle evidence is out of Phase 3 scope.

</deferred>

---

*Phase: 3-Ingest Promotion and Parser Job Lifecycle*
*Context gathered: 2026-05-09*
