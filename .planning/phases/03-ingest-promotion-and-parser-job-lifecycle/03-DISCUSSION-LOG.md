# Phase 3: Ingest Promotion and Parser Job Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 3-Ingest Promotion and Parser Job Lifecycle
**Areas discussed:** staging/polling handoff, duplicate/conflict policy, parse job publish boundary, parser completion/failure idempotency, operator status APIs

---

## Staging/Polling Handoff

| Question | Options Presented | User's Choice |
|----------|-------------------|---------------|
| Where should the staging/outbox that `server-2` reads live for v1? | Same DB; Fetcher DB; Agent decides | Same DB |
| How should `server-2` claim pending staging rows with parallel workers? | Claim batch; Single worker; Agent decides | Claim batch |
| What should happen when promotion hits a temporary DB/queue/service failure? | Retryable state; Keep pending; Fail fast | Retryable state |
| What is the atomic promotion unit in Phase 3? | Replay+job; Replay only; Replay+publish | Replay+job |

**Notes:** `replays-fetcher` writes staging/outbox rows only. `server-2` owns canonical replay and parse job lifecycle. RabbitMQ publish is deliberately outside the promotion transaction and follows durable DB state.

---

## Duplicate/Conflict Policy

| Question | Options Presented | User's Choice |
|----------|-------------------|---------------|
| What primary dedupe signal should decide that a staging row represents an existing replay? | Checksum first; Source first; Strict both | Checksum first |
| If checksum matches an existing replay but source identity differs, what should happen? | Attach evidence; Conflict review; Ignore new row | Attach evidence |
| If `source_system + source_replay_id` matches but checksum/object_key differs, how should v1 treat it? | Conflict; Latest wins; Ignore newer | Conflict |
| What should conflict_details/promotion evidence contain for manual review? | Full evidence; Minimal refs; Agent decides | Full evidence |

**Notes:** Byte identity wins for dedupe, but conflicting source identity must never be silently overwritten.

---

## Parse Job Publish Boundary

| Question | Options Presented | User's Choice |
|----------|-------------------|---------------|
| How should Phase 3 publish parse requests after creating `parse_jobs`? | DB-backed publisher; Inline publish; Outbox table | DB-backed publisher |
| Should exact RabbitMQ exchange/routing key names be locked now? | Lock names now; Defer names; Config only | Lock names now |
| What parse request message shape is required for v1? | Minimal required; Add evidence; Agent decides | Minimal required |
| What happens when publisher confirms are not received or RabbitMQ is unavailable? | Keep queued; Mark failed; Block promotion | Keep queued |

**Notes:** Publishing should be at-least-once and recoverable. Publish failures are not parser failures.

---

## Parser Completion/Failure Idempotency

| Question | Options Presented | User's Choice |
|----------|-------------------|---------------|
| What should the parser worker return in `parse.completed` for Phase 3? | Artifact ref; Full artifact; DB only | Artifact ref |
| What should `parse.failed` contain for audit and retry decisions? | Structured failure; Message only; Full logs | Structured failure |
| How should repeated or late results for an already terminal `parse_job` be handled? | Idempotent ignore; Hard reject; Overwrite | Idempotent ignore |
| What should Phase 3 do on successful completed result before Phase 4 aggregate persistence? | State only; Persist normalized now; Job only | State only |

**Notes:** Result handling is keyed by `job_id` and should not normalize full artifacts or calculate aggregates in this phase.

---

## Operator Status APIs

| Question | Options Presented | User's Choice |
|----------|-------------------|---------------|
| What API scope is needed in Phase 3 for ingest/parse lifecycle visibility? | Read-only lists; Include actions; Internal only | Read-only lists |
| Which filters are mandatory for read-only lifecycle APIs in Phase 3? | Status+ids; Broad search; Agent decides | Status+ids |
| How should Phase 3 treat auth/roles before Phase 6? | Admin-shaped, unguarded; No routes until auth; Static token now | Admin-shaped, unguarded |
| How detailed should detail responses be for conflicts/jobs? | Evidence summary; Full JSONB; Summary only | Evidence summary |

**Notes:** Routes should be useful for future admin/operator UI and OpenAPI, but final authorization and mutation actions are deferred.

---

## the agent's Discretion

- Exact batch sizes, retry intervals, internal service boundaries, route names, and queue/routing-key names may be chosen during planning as long as documented defaults and adjacent-app compatibility are preserved.

## Deferred Ideas

- Retry/reparse/conflict-resolution actions remain Phase 8 unless planning proves a small internal primitive is necessary.
- Broad search over lifecycle evidence is out of Phase 3 scope.
