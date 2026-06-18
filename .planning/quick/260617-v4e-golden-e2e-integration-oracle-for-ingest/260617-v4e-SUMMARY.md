---
phase: 260617-v4e-golden-e2e-integration-oracle-for-ingest
plan: 01
subsystem: testing
tags: [golden-oracle, characterization-test, integration, vitest, rabbitmq, postgres, s3, bounty, ingest, snapshot]

# Dependency graph
requires:
  - phase: ingest + statistics modules
    provides: "PgIngestRepository, IngestPromotionService, ParseJobPublisher, PgStatisticsRepository, ParserResultRecalculationService, createRabbitMqParserRuntime, createStorageClient, buildApp + PgPublicStatsReadModel"
provides:
  - "test:golden suite at src/test/golden/** — a master-only behavioral regression net pinning the CURRENT ingest→stats pipeline against real PG + RabbitMQ + S3"
  - "ONE shared fixture loader/normalizer/harness + ONE shared archive+infra skip-guard"
  - "Full-chain characterization oracle (9 floor artifacts), 3 hand-computed bounty anchors, 6 pinned invariants"
  - "Committed parser-2 floor archive + gated env-driven VPS S3 capture script + README"
affects: [phase-2-track-c-behavior-preserving-refactor]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies (uses installed vitest/pg/amqplib/@aws-sdk)
  patterns:
    - "Characterization (golden) oracle against real infra boundaries — no mocked contract boundary"
    - "Clean-skip guard: live block runs only when archive present AND docker-compose infra reachable; otherwise skips (never fails)"
    - "Bounded DB-state poll with a HARD timeout ceiling as the only backstop against the consumer nack-requeue loop"
    - "Deterministic snapshot normalization: uuid→stable token map (ids + fks), timestamp redaction, natural-key row sort"

key-files:
  created:
    - src/test/golden/fixtures/loader.ts
    - src/test/golden/fixtures/normalize.ts
    - src/test/golden/fixtures/harness.ts
    - src/test/golden/fixtures/artifacts.tar.gz
    - src/test/golden/pipeline.golden.test.ts
    - src/test/golden/bounty-anchor.golden.test.ts
    - src/test/golden/invariants.golden.test.ts
    - src/test/golden/scripts/build-floor-archive.sh
    - src/test/golden/scripts/capture-artifacts.sh
    - src/test/golden/README.md
    - src/test/golden/__snapshots__/
  modified:
    - package.json  # test:golden script; test + test:coverage exclude src/test/golden/**

key-decisions:
  - "Primary fix (golden excluded from test + test:coverage) was already committed by the prior executor; the remaining genuine work was the DRY skip-guard consolidation."
  - "Added ONE shared goldenInfraReachable(config) guard (archive present AND infra reachable) so the pipeline + bounty suites no longer duplicate the archivePresent()+dockerReachable() probe sequence (principle 9)."
  - "Invariants suite keeps the shared dockerReachable() probe directly — it consumes no fixture archive, so gating it on archive presence would wrongly skip it when only Docker is up."

patterns-established:
  - "Golden suite is a separate master-only gate (test:golden), OUT of verify/test:coverage → zero coverage obligation; src/test/** is coverage-excluded so verify stays at 100%."

requirements-completed: [INGEST-02, INGEST-03]

# Metrics
duration: ~20min
completed: 2026-06-18
status: complete
---

# Phase 260617-v4e Plan 01: Golden E2E Integration Oracle for Ingest — Summary

**A master-only `test:golden` suite that pins the current server-2 ingest→stats pipeline against real PostgreSQL + RabbitMQ + S3 (9 full-chain snapshots, 3 hand-computed bounty anchors, 6 invariants), wired OUT of `verify`/`test:coverage` and skipping cleanly without Docker; finished with a DRY skip-guard consolidation and full live + verify proof.**

## Performance

- **Duration:** ~20 min (verification + fix + summary only; the 6 implementation tasks were already done/committed)
- **Tasks:** 6 implementation tasks already complete (T1–T6); this session = fix + verification + SUMMARY
- **Files modified this session:** 3 (loader.ts, pipeline.golden.test.ts, bounty-anchor.golden.test.ts)

## What was built (the 6 tasks — context)

- **T1 Scaffold:** `test:golden` script (`vitest run src/test/golden --no-file-parallelism`); shared `loader.ts` (unpack archive, production `ParserArtifact` type, `archivePresent()` + `dockerReachable()` guards) and `normalize.ts` (uuid→token, ts redaction, row sort); README.
- **T2 Floor + full-chain oracle:** `build-floor-archive.sh` (parser-2 CLI over its golden OCAP corpus), committed `artifacts.tar.gz` (9 success/partial artifacts); `pipeline.golden.test.ts` drives promote → durable parse_jobs row (asserted before publish) → real broker `parse.requested` → real `parse.completed` consumer → S3 load → record + recalc → bounded-poll terminal `succeeded` → normalized full-surface snapshot incl. `GET /stats/*` via `app.inject`, through the SAME factories `server.ts` wires.
- **T3 Bounty anchors:** `bounty-anchor.golden.test.ts` — 3 hand-computed cases with a seeded previous rotation supplying effectiveness, asserted with `toEqual`: (a) player-only 4.00, (b) player+squad 9.00, (c) excluded teamkill 0.
- **T4 Invariants:** `invariants.golden.test.ts` — durable-job-before-publish, re-promote dedup (`duplicate_replay_id`), source-bytes conflict (`source_identity_changed_bytes`), re-delivery idempotency, synthetic `parse.failed` terminal-once, admin role-gate (401/403/2xx via shared `requireRole`).
- **T5 Capture script:** `capture-artifacts.sh` — gated, env-driven VPS S3 pull (no hardcoded host/key/IP), Happ-VPN ip-rule reminder, folds in the floor, logs captured-vs-skipped.
- **T6 CI gate:** README documents the master-only `golden-oracle` job; golden kept out of `verify`.

## The fix applied this session

The interrupted-`verify` root cause from the brief — `test`/`test:coverage` globbing the golden suite — was **already fixed and committed** at HEAD (`--exclude 'src/test/golden/**/*.test.ts'` present in both scripts in commit `dc4faa2`). So no package.json change was needed.

The genuine remaining work was **required-fix item 2 (skip-clean robustness / principle 9 DRY)**. The three suites each re-implemented the `archivePresent()` → `dockerReachable()` probe sequence in their `beforeAll`. I consolidated this into **ONE shared guard helper** `goldenInfraReachable(config)` in `loader.ts` (returns true only when the archive is present AND PG+RabbitMQ+S3 answer a health probe), and rewired the pipeline + bounty suites onto it. The invariants suite keeps the shared `dockerReachable()` probe directly because it consumes no fixture archive (gating it on archive presence would wrongly skip it when only Docker is up).

**Leak audit (required-fix item 3):** confirmed clean — every suite closes broker/app/s3/storage/pool in `afterAll`; the bounded `pollUntil` `setTimeout` always resolves (no dangling timer); no real signal handlers registered. The full golden run exits cleanly in ~4.6s with no open-handle/teardown warnings.

## Files Created/Modified this session

- `src/test/golden/fixtures/loader.ts` — added `goldenInfraReachable(config)`, the ONE shared archive+infra skip-guard.
- `src/test/golden/pipeline.golden.test.ts` — `beforeAll` now gates on `goldenInfraReachable`.
- `src/test/golden/bounty-anchor.golden.test.ts` — `beforeAll` now gates on `goldenInfraReachable`.

## Verification

Docker compose stack (`postgres:17` @15432, `rabbitmq:4` @5673, `minio` @9000, bucket `solid-replays` auto-created) was brought up and healthy.

**`pnpm test:golden` — LIVE PASS: 3 files / 21 tests.** Proven live (not skipped):

- pipeline: 9 full-chain snapshots match (aggregate-combat, combat-events, connected-backfill, duplicate-slot-same-name, killed-events, metadata-drift, side-facts, valid-minimal, vehicle-context) + 1 skip-doc case — ~270–380ms each = real broker round-trips.
- bounty anchors: (a) 4.00, (b) 9.00, (c) 0 all match hand-computed values via `toEqual`.
- invariants: all 6 hold (durable-job, dedup, conflict, re-delivery idempotency, parse.failed terminal-once, role-gate).
- **Skip-clean proven:** with infra pointed at dead ports the suite passes in 611ms (39ms tests) — live blocks early-return, zero failures.

**`pnpm verify` — GREEN end-to-end, every step:**

| Step | Result |
|------|--------|
| format (prettier --check) | PASS |
| lint (eslint) | PASS |
| typecheck (tsc --noEmit) | PASS |
| test (unit; golden + integration excluded) | PASS — 80 files / 681 tests |
| test:integration | PASS — 9 files / 191 tests |
| openapi:check (verify + ts-gen) | PASS |
| ops:backup:check | PASS |
| ops:boundary:check | PASS |
| test:coverage (golden excluded) | PASS — 89 files / 872 tests, **100% coverage** (stmts 3359/3359, branch 1578/1578, funcs 1071/1071, lines 3304/3304) |

The golden suite contributes zero coverage obligation (`src/test/**` is coverage-excluded; `test:golden` is not in the chain) and `verify` holds 100%.

## REVIEW findings addressed (260617-v4e-REVIEW.md)

A follow-up code review (`260617-v4e-REVIEW.md`, verdict REQUEST CHANGES) raised 5 findings. Resolution this session:

| # | Sev | Finding | Resolution |
|---|-----|---------|------------|
| 1 | 🟠 | `normalize.ts` collapses every non-redacted `Date` (e.g. `replay_timestamp`) to `{}` — a deterministic field that asserted nothing | **FIXED.** Added a `value instanceof Date` branch in `normalizeValue` (returning `.toISOString()`) **before** the generic-object branch. now()-driven columns (`created_at`/`updated_at`/`published_at`/`finished_at`/`started_at`/`calculated_at`) stay key-redacted to `<ts>` via `TIMESTAMP_KEYS`. Snapshots regenerated. Added permanent guard `fixtures/normalize.test.ts` (5 cases incl. Date→ISO round-trip and key-based redaction). |
| 2 | 🟡 | redundant/divergent infra-probe — invariants used `dockerReachable` directly while pipeline/bounty used the shared `goldenInfraReachable` | **FIXED (consolidated).** All three suites now use the single shared `goldenInfraReachable(config)` guard. The probe-then-build connect cycle is inherent to a health-probe-before-build design and is **accepted** as the reviewer recommended ("acceptable as-is for a slow master-only gate"). |
| 3 | 🟡 | invariants suite used a bare `describe(...)` → Docker-less run reported PASS, not skipped | **FIXED.** Switched to `describe.skipIf(!archivePresent())` for collection-time skip parity with the sibling suites; runtime infra absence still early-returns inside each `it` (matching the pipeline suite's pattern, since the async probe can't be awaited in `describe.skipIf`). |
| 4 | 🔵 | dead `currentRotationId` param + `void` line in `driveBounty` | **FIXED.** Dropped the unused param and the three call-site args (callers still use `seeds.currentRotationId` for `rotationBountyPoints`). The broad file-level eslint-disable was **kept** (consistent with the sibling golden suites; line-scoping every DB-column-literal/magic-number was judged disproportionate for test files). |
| 5 | 🔵 | README described a `describe.skipIf(!archivePresent() \|\| !dockerReachable)` guard that cannot exist | **FIXED.** Reworded the Running section to: collection-time skip on `!archivePresent()` + runtime infra early-return. |

**`replay_timestamp` snapshot proof:** before → `"replay_timestamp": {}` (asserted nothing); after → `"replay_timestamp": "2026-05-09T00:00:00.000Z"` (the fixed staging literal, now genuinely pinned) across all 9 regenerated pipeline snapshots. now()-driven timestamps remain `<ts>`.

**Re-verification:** `pnpm test:golden` GREEN — 4 files / 26 tests (the 21 live golden + 5 new `normalize.test.ts`); `pnpm verify` GREEN end-to-end with 100% coverage. Golden stays excluded from `test`/`test:coverage`/`verify`.

## Skills cited

- `solidstats-shared-testing-standards` §E (Determinism — a live-broker bounded poll is the permitted exception where deterministic clock control is impossible; the HARD timeout is the backstop), §F (doubles only at true boundaries — this oracle deliberately uses real PG/RabbitMQ/S3, no mocked contract boundary), §B (unit-vs-integration boundary — repository/route correctness needs real infra).
- `solidstats-server-ts-tests` (Integration Harness — `runMigrations()` for the real schema, `truncate … cascade` isolation, `app.inject`; Coverage gate — golden out of the coverage invocation).
- `solidstats-server-ts-conventions` (factory-DI — the oracle constructs the SAME production factories `server.ts` wires, never a hand-mirrored copy; queue reliability — durable `parse_jobs` row before any publish).
- `solidstats-shared-project-standards` (session hygiene — clean tree via committed work; DRY principle 9 — ONE shared guard helper, no duplication; documentation language — README in English).

## Deviations from Plan

The plan's 6 tasks were executed by a prior executor. This session deviated only in that the **primary diagnosed fix was already committed**, so the remaining work was the DRY guard consolidation (required-fix item 2) plus the verification + SUMMARY the prior executor was interrupted before completing. No scope creep; no production behavior changed (the oracle pins current behavior as-is, principle 7).

## Issues Encountered

- **GPG signing blocker (UNRESOLVED — needs user action):** all 6 prior commits on this branch are GPG-signed (`commit.gpgsign=true`), but git's commit path routes to the interactive `gnome3` pinentry which **times out** in this non-interactive session (loopback signing needs `/dev/tty`, unavailable here). The fix is fully **staged** (3 files) but **not yet committed**. The user must complete the commit so the GPG passphrase prompt can be answered. See "Action required" below.

## Residual risks / notes

- **VPS full-corpus capture is gated/manual:** `artifacts.tar.gz` is the committed parser-2 **floor** (9 artifacts). The hundreds of REAL production artifacts require the human to run `capture-artifacts.sh` with the VPS S3 env vars under the Happ-VPN ip-rule bypass; the live full-corpus run is the master-only CI job, not part of `verify`.
- The golden suite is a **master-only pre-deploy gate**, intentionally outside `verify`; PR checks that run without Docker never invoke it.

## Action required (commit the staged fix)

The 3-file fix is staged and verified. GPG pinentry could not complete non-interactively. Run **one** of:

```
# preferred — signed, consistent with the rest of the branch (answer the pinentry prompt):
git commit -m "test(260617-v4e): consolidate golden skip-guard into one shared helper"

# or, if you accept an unsigned commit for this one:
git commit --no-gpg-sign -m "test(260617-v4e): consolidate golden skip-guard into one shared helper"
```

---
*Phase: 260617-v4e-golden-e2e-integration-oracle-for-ingest*
*Completed: 2026-06-18*
