# Quick Task 260617-v4e: Golden e2e integration oracle — Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Full rationale:** see `DEEP-BRAINSTORM.md` in this directory (the locked decision pack from a deep
Socratic brainstorm). This CONTEXT is the lean digest — decisions here are LOCKED, do not re-litigate.

<domain>
## Task Boundary

Build golden end-to-end integration test(s) that pin the **current observable behavior** of the
`server-2` ingest→stats pipeline (plus the public read surface) as a **behavioral regression oracle**
BEFORE the upcoming **Phase 2 Track C refactor** (Oxfmt mass-reformat + full Oxlint + `tsc`→tsdown
2-entry + depcruise/knip/lefthook — explicitly behavior-preserving). The oracle catches integration-level
drift that the unit suite (mocked boundaries) and the frozen-contract/oasdiff gate (API shape only) miss.

Convention-bound test work — author it THROUGH `solidstats-server-ts-tests` (+ shared testing standards),
citing the rules relied on. Do NOT hand-roll.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Scope — full chain + read API
One golden test drives the real production path per real artifact:
`IntervalTask.runOnce()` → `IngestPromotionService.promotePending()` (`src/modules/ingest/service.ts`)
→ durable `parse_jobs` row + RabbitMQ publish (`src/modules/ingest/publisher.ts`)
→ real broker delivery → `ParseCompletedMessage` consumer (`src/infra/queue/rabbitmq.ts`)
→ real S3 artifact load (`artifactLoader.loadParserArtifact({bucket,key})`, `src/modules/ingest/runtime.ts:94`)
→ `recordParserCompleted()` (`src/modules/ingest/repository/repository.ts:525`)
→ `ParserResultRecalculationService.recalculateParserResult()` (`src/modules/statistics/service/recalculation.ts`)
→ assert via `GET /stats/*` (`src/modules/public-stats/...`).

### Realism — real PG + real RabbitMQ + real S3 (no mocked boundary)
Mirror the existing harness: docker-compose services on fixed localhost ports (PG `15432`, Rabbit `5673`,
S3 `9000`, env-overridable), real schema via `runMigrations()`, `truncate … cascade` isolation,
**unique S3 keys + ephemeral queue per run**. A mock at a contract boundary hides the exact failures the
oracle exists to catch (brief anti-pattern #1). Drive promotion via `IntervalTask.runOnce()` (no real
timer — principle 9); await parse-completed via a **bounded DB-state poll** (the consumer exposes no
completion Promise; the test may run long).

### Fixtures — hundreds of REAL artifacts, committed as a gzip archive, unpacked at test start
Real `ParserArtifact` JSONs (the shape `server-2` ingests — `src/modules/statistics/parser-artifact.ts`,
matches parser-2 `parse-artifact-v3.schema.json`). Stored as ONE committed gzip archive in-tree, unpacked
at test start, iterated with `test.each`. **Capture is gated** (agent lacks VPS access): a deterministic
**capture script pulls the real production artifacts from the VPS over SSH** (the actual objects prod
ingested) and packs the archive — human runs it once under `!`. Note: Happ VPN is always-on; SSH to own
VPS needs the `ip rule` bypass or it hangs (global memory `happ-vpn-bypass-for-servers`). Local fallback
floor = the ~10–13 `replay-parser-2` golden inputs parsed via its CLI, committed so the oracle is never
empty. The test **guards on archive presence and skips cleanly** when absent (principle 8).

### Assertions — characterization snapshots + bounty anchor
Golden snapshots of the FULL observable surface (`parser_results` + all evidence fields, `parser_events`,
`player_stats`, `squad_stats`, `commander_side_stats`, `bounty_points`, terminal `parse_jobs`,
`ingest_staging_records` status/evidence, and `GET /stats/*` responses) with **deterministic
normalization** (UUID→stable natural key by checksum/nickname/replay, timestamps redacted, rows sorted),
PLUS hand-computed bounty assertions on 2–3 anchor cases (bounty values are business-critical — check
semantics, not only snapshot equality). Pin CURRENT behavior as-is; if a pinned behavior is known
tech-debt, comment it + point to backlog — do NOT "fix" inside the oracle (principle 7).

### Invariants / idempotency to pin (from current code, as-is)
- Durable `parse_jobs` row exists **before** the RabbitMQ publish (never fire-and-forget).
- Re-promote same staging row → dedup/no-op: `status='promoted'` + `promotion_evidence.duplicate_replay_id`.
- Same `source_system`+`source_replay_id`, different bytes/checksum → `status='conflicted'` +
  `conflict_details.reason='source_identity_changed_bytes'` (`service.ts:147`).
- Checksum-duplicate (no source match) → `status='promoted'` + duplicate evidence appended (`service.ts:166`).
- Re-deliver same `parse.completed` → terminal state recorded once.
- Auth/role gate (flow 4): a protected route rejects without role / accepts with role via the shared
  `requireRole`/`requireAnyRole` pre-handlers (`src/modules/auth/routes/authorization.ts`).

### Gate placement — master-only, slow, separate from `verify`
Dedicated script (e.g. `test:golden`) + a **master-only pre-deploy CI job**. NOT in `verify` and NOT in
`test:coverage` → zero coverage obligation (principle 10); `verify` stays green at 100% without the
archive (principle 8). The test MAY run long — that is accepted and intended.

### Cross-app boundary (from replay-parser-2 decision pack — respect it)
The parser does NOT calculate bounty. The parser emits compact kill/stat facts; **`server-2` computes
final bounty from previous-rotation effectiveness + cross-replay state**. Consequence for fixtures: a
single-artifact run yields meaningful bounty ONLY if a **previous rotation with known effectiveness is
seeded**. The bounty anchor cases MUST set up the previous-rotation state. CORRECTION (RESEARCH §1):
server-2 does NOT verify artifact bytes on ingest — `loadParserArtifact` is plain `JSON.parse`, no schema
or checksum gate; `artifact_checksum`/`source_checksum` are stored as metadata only and need not match the
bytes (byte-verification is parser-2's job). A fixture needs only a well-formed `^[0-9a-f]{64}$` checksum.

### Out of scope (non-goals)
- request/moderation **business-logic workflow** (Phase 2 rewrites it → pinning = false reds). Only the
  role-gate mechanism is in scope.
- NOT wired into fast `verify`/`test:coverage`; no coverage obligation.
- NO fresh-schema/bucket/db per test — repo convention is `truncate … cascade` (Step 0: repo overrides
  the generic brief).
- NOT a parity/value-vs-legacy comparison (that is the cutover diff harness). Pins `server-2`'s OWN
  current behavior.
</decisions>

<specifics>
## Specific Ideas

- Harness divergence already documented in `.planning/codebase/TESTING.md`: integration suite connects to
  **docker-compose** services, NOT programmatic testcontainers. Follow that, not the brief's "testcontainers".
- Existing references to mirror for wiring: `src/test/integration/adapters.test.ts` (real PG+Rabbit+S3
  health), `src/modules/ingest/repository/tests/postgres.test.ts` (real `IngestPromotionService` +
  `PgIngestRepository` + Postgres, reuses seed helpers).
- Extract ONE shared fixture-loader/unpacker and ONE snapshot-normalizer; reuse the production schema/types
  (never a hand-mirrored copy) — principle 9.
- `verify` for the plan's tasks must rely on typecheck/lint + unit + the golden test **skipping cleanly**
  when Docker/the archive are absent (live run is CI/master-only). Docker is frequently unavailable in the
  local dev env — the golden test and its `verify` step must tolerate that.
</specifics>

<canonical_refs>
## Canonical References

- `DEEP-BRAINSTORM.md` (this directory) — full decision pack, question ledger, risks, acceptance criteria.
- `/tmp/golden-integration-test-prompt.md` — the reusable source brief (server-2 section is ground truth;
  read its "real call path", "durable-job invariant", "high-value golden flows", anti-patterns).
- `.planning/codebase/TESTING.md` — the repo's actual testing reality (harness, coverage gate).
- Skills: `solidstats-server-ts-tests` (harness, per-layer map, coverage), `solidstats-server-ts-conventions`,
  `solidstats-shared-testing-standards`, `solidstats-shared-project-standards`.
- parser-2 `schemas/parse-artifact-v3.schema.json` — the cross-app artifact contract.
</canonical_refs>
