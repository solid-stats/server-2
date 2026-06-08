# Codebase Concerns

**Analysis Date:** 2026-06-08

> Source-grounded audit of `server-2`. Findings combine static code review with the
> milestone-tracked debt already recorded in `.planning/v3.0-MILESTONE-AUDIT.md`
> and `.planning/STATE.md`. Items are actionable; each carries file paths and a fix path.

## Tech Debt

**Winner-fix workflow has no winner-side whitelist (WR-04):**
- Issue: `legacy_winner_fix` accepts an arbitrary winner side with no allowed-values check. Frozen by HIST-04 verify-and-freeze, so it must not be patched in place — needs a dedicated follow-up phase.
- Files: `src/modules/requests/routes/workflows/workflows.ts` (action handling ~line 135), `src/modules/requests/routes/workflow-applier.ts`
- Impact: A moderator can write a nonsensical winner value into canonical state; downstream stats/recalculation trust the value.
- Fix approach: New phase adding a side enum/whitelist guard at the workflow boundary; do not mutate the frozen code path directly.

**Winner-fix reports success on a zero-row no-op (WR-05):**
- Issue: `legacy_winner_fix` returns success even when it updates zero rows (e.g. a wrong `replayId`), so callers cannot distinguish "fixed" from "matched nothing".
- Files: `src/modules/requests/routes/workflow-applier.ts` (winner UPDATE), `src/modules/requests/routes/workflows/workflows.ts`
- Impact: Silent moderation failures; audit trail records an apparently-successful action that changed nothing.
- Fix approach: Surface affected-row count and return a not-found / no-op signal when zero rows match. Bundle with WR-04 follow-up phase.

**REPLAY-01 map filter deferred:**
- Issue: Replay list/detail cannot filter by map — no `replays.map_name` column exists.
- Files: `src/modules/public-stats/routes/filters.ts`, `src/modules/public-stats/routes/schemas.ts`, migrations under `src/infra/db/migrations/`
- Impact: A planned public-API filter is missing; `web` cannot offer map filtering.
- Fix approach: Cross-app data-model change — coordinate with `replay-parser-2` / `replays-fetcher` to source `map_name`, then add a column + migration + filter. Do not invent the field locally.

**No security artifact despite enforcement flag:**
- Issue: `workflow.security_enforcement=true` in `.planning/config.json`, but no `*-SECURITY.md` was produced for any v3.0 phase (14–19). Per-phase `<threat_model>` blocks exist in plans instead.
- Files: `.planning/config.json`, `.planning/phases/`
- Impact: Configuration and practice disagree; future audits flag it repeatedly.
- Fix approach: Decide deliberately — either run `/gsd-secure-phase` retroactively or set `security_enforcement=false`. (See MEMORY: security enforcement is treated as advisory.)

## Known Bugs

**Poison-message infinite requeue in RabbitMQ consumer:**
- Symptoms: A parse-result message that always throws during handling is `nack`ed with `requeue=true` forever, hot-looping the consumer.
- Files: `src/infra/queue/rabbitmq.ts:127` (`this.consumeChannel.nack(message, false, true)` in `handleMessage`)
- Trigger: Any message whose JSON parse or handler logic deterministically fails (malformed payload, schema mismatch, persistent downstream error).
- Workaround: None in code. The bare `catch {}` also discards the error — no log of why it failed.
- Fix approach: Add a dead-letter exchange / retry-count header and `nack(requeue=false)` after N attempts; log the caught error with `job_id`/`replay_id` correlation (pino is already the logging stack).

## Security Considerations

**Session cookie missing the `Secure` attribute:**
- Risk: The session cookie is serialized with `HttpOnly; SameSite=Lax` but never `Secure`, so it can be sent over plaintext HTTP.
- Files: `src/modules/auth/routes/cookies.ts:16` (`sessionCookie`), `:29` (`expiredSessionCookie`)
- Current mitigation: `HttpOnly` + `SameSite=Lax` limit XSS/CSRF exposure.
- Recommendations: Add `Secure` (env- or NODE_ENV-gated so local HTTP still works). Consider signing the session token if not already opaque/random.

**Hand-rolled cookie parsing and serialization:**
- Risk: `readCookie` and the cookie serializers are bespoke string manipulation rather than a vetted library (`@fastify/cookie`), inviting edge-case parsing bugs and missing attribute handling.
- Files: `src/modules/auth/routes/cookies.ts`
- Current mitigation: Narrow surface, name-matched lookup.
- Recommendations: Adopt `@fastify/cookie` for parsing/serialization to centralize attribute handling and reduce custom code. (Note: AGENTS.md asks for zero new runtime deps during freeze — schedule post-freeze.)

**No rate limiting, CORS, or security headers registered:**
- Risk: No `@fastify/rate-limit`, `@fastify/cors`, or `@fastify/helmet` is registered in `buildApp`. Public stats and auth endpoints have no abuse throttling or hardened headers.
- Files: `src/app.ts` (plugin registration block, lines 77–127)
- Current mitigation: None at the app layer; relies on any upstream proxy.
- Recommendations: Add rate limiting on auth/write routes and a CORS policy scoped to the `web` origin. Decide whether security headers belong here or at the reverse proxy (Docker Compose / VPS deployment).

**No request-body / upload size guard at the app level:**
- Risk: Fastify default body limit applies, but attachment metadata (`sizeBytes`, `contentType`) flows into S3 presign without an enforced max-size or MIME allowlist check in `server-2`.
- Files: `src/infra/storage/client.ts` (presign with `ContentLength: input.sizeBytes`, `ContentType: input.contentType`), `src/modules/requests/routes/attachment-storage.ts`
- Current mitigation: `safeFileName` sanitizes object-key characters; presign sets `ContentLength`/`ContentType` from caller input.
- Recommendations: Validate `sizeBytes` against a max and `contentType` against an allowlist before presigning, so clients cannot request oversized or arbitrary-type uploads.

**Contract-freeze CI gates are advisory until branch protection is set:**
- Risk: The `Contract diff` and `Verify` jobs run but do not block merges — the freeze guarantee (FREEZE-03/04) is unenforced.
- Files: `.github/workflows/`, repo branch-protection settings (GitHub UI, not in repo)
- Current mitigation: Jobs exist and execute on PRs.
- Recommendations: Mark `Contract diff` + `Verify` as required status checks on the protected branch (manual GitHub setting tracked in `19-UAT.md`).

## Performance Bottlenecks

**Unbounded / unconfigured PostgreSQL pool:**
- Problem: `new Pool({ connectionString })` uses all `pg` defaults — no `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, or statement timeout.
- Files: `src/infra/db/client.ts:6` (`createDatabasePool`)
- Cause: No tuning for a single-VPS deployment shared by API + ingest runtime + recalculation.
- Improvement path: Set explicit `max`, idle/connection timeouts, and a statement timeout; size the pool against PostgreSQL `max_connections` minus other consumers.

**Heavy aggregate SQL concentrated in very large repository files:**
- Problem: The hottest read/aggregate logic lives in oversized modules that mix many query shapes, making slow-query isolation and indexing review hard.
- Files: `src/modules/public-stats/repository.ts` (1927 lines), `src/modules/statistics/repository/repository.ts` (938 lines), `src/modules/ingest/repository/repository.ts` (878 lines)
- Cause: Organic growth; each carries a file-level `eslint-disable max-lines`.
- Improvement path: Split by query domain (leaderboards, players, replays, history) and confirm keyset/sort columns are index-backed (migrations `0005_keyset_indexes.sql`, `0007_replay_event_keyset.sql` cover some paths — verify coverage for newer sorts).

## Fragile Areas

**Dynamic keyset/sort SQL fragment composition:**
- Files: `src/modules/public-stats/routes/pagination/keyset.ts`, `src/modules/public-stats/routes/pagination/sort.ts`, `src/modules/public-stats/routes/pagination/cursor.ts`
- Why fragile: Builds SQL predicates from server-chosen fragments (`sortExpr`, `castType`, `idColumn`) with `$n` placeholders. Safety depends entirely on the sort whitelist — any field reaching the builder that is not a canonical whitelisted key would interpolate server-controlled SQL. The 4-branch NULL/tuple expansion is also subtle (logged in STATE: `timestamptz` cast added because `text` cast broke timestamp comparisons).
- Safe modification: Never pass a raw request value as a sort key; always resolve through `SortWhitelist` first. New sortable columns require a whitelist descriptor with the correct `castType` plus a keyset index. Bound values must stay `$n`-parameterized, never interpolated.
- Test coverage: Strong — `keyset.test.ts`, `sort.test.ts`, `cursor.test.ts` exist.

**SteamID masking choke-point (privacy-critical):**
- Files: `src/modules/public-stats/replay-mapper.ts` (`scrubPayload`, `STEAM_KEY_PATTERN`, `STEAM64_PATTERN`, `maskSteamId`)
- Why fragile: Full Steam64 ids must never reach `web`. Masking is enforced at one row→payload mapper boundary by deep-walking and dropping/masking matching keys and string values. A new response field that bypasses the mapper, or a Steam64 nested in an unexpected shape, would leak (a live leak existed and was closed in 14-02/14-03).
- Safe modification: Any new public payload carrying replay/player raw data MUST flow through `scrubPayload`. Re-run the leak-guard suite after changes.
- Test coverage: Strong — `src/test/integration/steamid-leak-guard.test.ts` (real-pg + error paths, asserts no `7656119\d{10}` over bodies/tokens/exported OpenAPI), plus `replay-mapper.test.ts`.

**Default `buildApp` wiring uses in-memory repositories:**
- Files: `src/app.ts:132-173` (`createDefaultAdminOptions`, `createDefaultRequestOptions`, `createDefaultAuthOptions`)
- Why fragile: If a caller invokes `buildApp()` without options (or partially), it silently runs against `InMemory*` stores and `Noop*` appliers — sessions, requests, audit, and workflows become non-persistent with no warning. Only `src/server.ts` wires the `Pg*` implementations.
- Safe modification: Treat in-memory defaults as test-only. Any new entrypoint must inject `Pg*` implementations exactly like `src/server.ts:50-98`.
- Test coverage: Defaults are exercised heavily by route tests (intended), so a misuse would not fail tests — the risk is operational, not test-visible.

**Database migrations run without an advisory lock:**
- Files: `src/infra/db/migrate.ts`
- Why fragile: Migrations are applied sequentially with per-file transactions and a checksum guard, but no `pg_advisory_lock`. Two instances starting concurrently (or a rolling deploy) could race the `schema_migrations` apply.
- Safe modification: Acquire a session/advisory lock around the migration loop before applying.
- Test coverage: Checksum-drift path is guarded; concurrency is not covered.

## Scaling Limits

**Single-VPS Docker Compose deployment:**
- Current capacity: v1 targets one VPS running API + ingest runtime + Postgres + RabbitMQ + S3-compatible storage (per AGENTS.md / PROJECT.md constraints).
- Limit: API throughput and recalculation jobs contend for the same Postgres pool and host resources; no horizontal scaling path in v1 (Kubernetes explicitly out of scope).
- Scaling path: Externalize Postgres/RabbitMQ/object storage, tune the connection pool, and split the ingest/recalculation runtime from the HTTP process before scaling out.

**Ingest promotion / publish batch sizes are fixed defaults:**
- Current capacity: `INGEST_PROMOTION_BATCH_SIZE=25`, `PARSE_JOB_PUBLISH_BATCH_SIZE=25`, `RUNTIME_POLL_INTERVAL_MS=5000` (`src/config/env.ts:45-49`).
- Limit: Throughput is bounded by batch size × poll interval; a large backlog drains slowly.
- Scaling path: Tune via env per deployment; consider adaptive batch sizing under backlog.

## Dependencies at Risk

**No identified abandoned/at-risk runtime dependency.**
- The stack is current (Fastify 5, pg 8.x, amqplib, AWS SDK v3, prom-client, pino). AGENTS.md mandates zero new runtime dependencies through the contract freeze, so dependency additions (e.g. `@fastify/cookie`, `@fastify/rate-limit`) are deliberately deferred rather than missing by oversight.

## Missing Critical Features

**No retry/dead-letter strategy for failed parse-result messages:**
- Problem: Consumer requeues failures indefinitely with no DLQ or attempt ceiling (see Known Bugs).
- Blocks: Operational recovery and the "failed jobs observable and recoverable" core value; a poison message can stall result processing.

**No app-layer abuse protection (rate limiting / CORS):**
- Problem: Public and auth endpoints have no throttling or origin policy (see Security).
- Blocks: Safe public exposure of the stats API without relying on an external proxy.

## Test Coverage Gaps

**RabbitMQ failure / requeue path:**
- What's not tested: The `catch`→`nack(requeue=true)` branch and poison-message behavior in `handleMessage`.
- Files: `src/infra/queue/rabbitmq.ts:116-129`
- Risk: A requeue storm or swallowed error ships unnoticed.
- Priority: High

**Migration concurrency:**
- What's not tested: Concurrent `runMigrations` execution (no advisory lock).
- Files: `src/infra/db/migrate.ts`
- Risk: Racing deploys corrupt or duplicate migration application.
- Priority: Medium

**Pool exhaustion / timeout behavior:**
- What's not tested: Behavior under connection saturation (no pool limits configured).
- Files: `src/infra/db/client.ts`
- Risk: Unbounded connection growth degrades Postgres under load.
- Priority: Medium

**`c8 ignore` suppressed branches in public-stats repository:**
- What's not tested: 2 explicitly ignored branches (NOT NULL valid_from guards per schema).
- Files: `src/modules/public-stats/repository.ts`
- Risk: Low — guards are unreachable given schema constraints; flagged for visibility.
- Priority: Low

**Live-DB half of the CI freeze gate:**
- What's not tested locally: `test:integration` + coverage run only in CI; not locally verifiable. DB-free steps (format/lint/typecheck/test/openapi:check) are green locally.
- Files: `.github/workflows/`
- Risk: Integration regressions only surface in CI, not on the developer machine.
- Priority: Medium

---

*Concerns audit: 2026-06-08*
