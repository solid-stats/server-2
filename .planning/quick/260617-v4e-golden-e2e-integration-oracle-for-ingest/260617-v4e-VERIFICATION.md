---
phase: 260617-v4e-golden-e2e-integration-oracle-for-ingest
verified: 2026-06-18T00:00:00Z
status: human_needed
score: 8/8
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Commit the staged 3-file DRY consolidation (goldenInfraReachable). Run `git commit` interactively so the GPG pinentry can answer. Then confirm `git status --short` is clean and all 6 prior commits on this branch are intact."
    expected: "Working tree clean. `pnpm verify` still green. `pnpm run test:golden` with Docker up still reports 3 files / 21 tests PASS."
    why_human: "The GPG-signing loop requires an interactive TTY; the agent cannot complete the commit non-interactively. The staged content is verified correct but the commit does not exist yet — the git tree is not clean, violating the project session-hygiene rule."
---

# Task 260617-v4e: Golden E2E Integration Oracle — Verification Report

**Task Goal:** A behavioral regression oracle that pins the CURRENT ingest→stats pipeline behavior (real PG/RabbitMQ/S3), runs master-only (outside `verify`/coverage), uses a committed real-artifact floor + gated VPS capture, asserts full-surface characterization snapshots + hand-computed bounty anchors + the pinned invariants, and skips cleanly without Docker/the archive.

**Verified:** 2026-06-18
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Full production ingest→stats path runs end-to-end against real PG + RabbitMQ + S3, driven through the same factories server.ts wires | VERIFIED | `pipeline.golden.test.ts` imports and constructs `PgIngestRepository`, `IngestPromotionService`, `ParseJobPublisher`, `PgStatisticsRepository`, `ParserResultRecalculationService`, `createRabbitMqParserRuntime`, `createStorageClient`, `PgPublicStatsReadModel`, `buildApp` — identical to server.ts wiring. No mocked boundary. `test.each` over 9 floor artifacts. |
| 2 | Durable `parse_jobs` row exists BEFORE the RabbitMQ `parse.requested` publish | VERIFIED | `pipeline.golden.test.ts` lines 177–188: queries `parse_jobs` between `promotionService.promotePending()` and `publisher.publishQueued()`, asserts `status='queued'` before publish. `invariants.golden.test.ts` invariant 1 repeats same assertion in isolation. |
| 3 | A real `parse.completed` delivered through the live broker loads the S3 artifact, records result, recalculates aggregates/bounty, and state is observable via GET /stats/* backed by PgPublicStatsReadModel | VERIFIED | `pipeline.golden.test.ts` drives full round-trip: `publishCompleted()` → `consumeParserResults` consumer (broker wired) → `recordParserCompleted` → `recalculateParserResult` → `pollUntil(status=succeeded)` → `snapshotSurface()` asserts all DB tables + 5 GET /stats/* endpoints via `app.inject` with `PgPublicStatsReadModel`. 9 committed snapshots under `__snapshots__/`. SUMMARY confirms 3 files / 21 tests LIVE PASS. |
| 4 | Hand-computed bounty values on 2-3 anchor cases match persisted bounty_points with a seeded previous rotation | VERIFIED | `bounty-anchor.golden.test.ts`: (a) player-only kills=3/deaths=1 → `expect(alphaPoints).toEqual(4)` [4.00]; (b) player+squad kills=2/1 + squad 4/2 → `expect(alphaPoints).toEqual(9)` [9.00]; (c) teamkill → `expect(echoPoints).toEqual(0)`. All use `toEqual` with hand-computed values, not snapshot equality. Previous-rotation seeded with real INSERT into `rotations`/`player_stats`/`squad_stats`. |
| 5 | Re-promoting same staging row dedups; same-source different-bytes conflicts; re-delivered parse.completed records terminal state once | VERIFIED | `invariants.golden.test.ts` invariants 2, 3, 4, 5: dedup asserts `promotion_evidence.duplicate_replay_id` set; conflict asserts `conflict_details.reason='source_identity_changed_bytes'`; re-delivery calls `recordParserCompleted` twice, second returns null; `parse.failed` called twice, second returns false. All use production service/repository directly (no synthetic broker round-trip for conflict/failed). |
| 6 | Protected admin route rejects without role and accepts with role via shared requireRole pre-handler | VERIFIED | `invariants.golden.test.ts` invariant 6: `app.inject` to `POST /admin/rotations` — anon gets 401, non-admin session gets 403, admin-role session gets 2xx. Uses `InMemoryAuthUserRepository`/`InMemorySessionStore` + `buildApp({ auth })`, exercising the actual `requireRole` pre-handler. |
| 7 | The golden suite SKIPS cleanly (not fails) when Docker services or fixture archive are absent | VERIFIED | `describe.skipIf(!archivePresent())` at collection time in pipeline + bounty suites; `goldenInfraReachable()` guards `beforeAll` → early return; per-`it` `if (!infraReachable) return`. Invariants suite uses `dockerReachable()` directly (no archive dependency). SUMMARY confirms skip-clean proven: "infra pointed at dead ports → 611ms (39ms tests) — zero failures." |
| 8 | Golden suite wired OUT of verify and test:coverage (zero coverage obligation) and into a dedicated test:golden script | VERIFIED | `package.json` line 24: `test` excludes `src/test/golden/**/*.test.ts`. Line 25: `test:coverage` excludes `src/test/golden/**/*.test.ts`. Line 27: `test:golden` = `vitest run src/test/golden --no-file-parallelism`. `verify` script chains `pnpm test` + `pnpm run test:integration` + `pnpm run test:coverage` — none target `src/test/golden`. `test:integration` positionally targets `src/test/integration` + `*/tests/postgres.test.ts` — no golden overlap. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/test/golden/fixtures/loader.ts` | ONE shared fixture loader — unpacks archive, exposes archivePresent() + dockerReachable() + goldenInfraReachable() guards, production ParserArtifact type | VERIFIED | 123 lines (exceeds 40 min). Imports `ParserArtifact` from production path. All three guard functions present and substantive. goldenInfraReachable() is staged (not yet committed). |
| `src/test/golden/fixtures/normalize.ts` | ONE shared snapshot normalizer — uuid→stable token map, timestamp redaction, deterministic row sort | VERIFIED | 109 lines (exceeds 40 min). UuidMap class, normalizeValue, normalizeRows, TIMESTAMP_KEYS set, source_file + object_key redaction. |
| `src/test/golden/fixtures/harness.ts` | Shared golden-suite helpers — TRUNCATE_ALL, pollUntil, publishCompleted, purgeParserQueues, snapshotSurface | VERIFIED | Present (not in PLAN artifacts but added by executor as DRY consolidation). Imports from messages.ts + normalize.ts. snapshotSurface covers 9 tables + 5 /stats/* endpoints. |
| `src/test/golden/pipeline.golden.test.ts` | Full-chain oracle: promote → durable job → real broker → consumer → recalc → GET /stats/* snapshot; test.each | VERIFIED | test.each over loaded fixtures. Full chain present. goldenInfraReachable guard staged. 9 snapshots committed. |
| `src/test/golden/bounty-anchor.golden.test.ts` | 2-3 hand-computed bounty anchors with seeded previous rotation, asserted with toEqual | VERIFIED | 3 cases: player-only=4, player+squad=9, teamkill=0. toEqual assertions. Previous-rotation seeded. goldenInfraReachable guard staged. |
| `src/test/golden/invariants.golden.test.ts` | Idempotency/conflict/role-gate invariants | VERIFIED | 6 invariants. durable-job, dedup (duplicate_replay_id), conflict (source_identity_changed_bytes), re-delivery (recordParserCompleted null on 2nd), parse.failed (false on 2nd), role-gate (401/403/2xx). |
| `src/test/golden/scripts/capture-artifacts.sh` | Gated VPS S3 capture script — env-driven, no hardcoded host/key/IP, logs counts, fails on missing env | VERIFIED | bash -n passes. VPS_S3_ENDPOINT/ACCESS_KEY/SECRET validated. Happ VPN reminder present. No literal IPs. captured/skipped/floor counts logged. Fails loudly on zero objects. |
| `src/test/golden/scripts/build-floor-archive.sh` | Committable floor: runs replay-parser-2 CLI over its golden OCAP corpus, packs artifacts.tar.gz | VERIFIED | bash -n passes. 9 named inputs (success/partial only). cargo check. Logs captured/skipped. Refuses empty archive. |
| `src/test/golden/README.md` | One-line human capture command, floor-build command, skip semantics, gate placement, CI wiring | VERIFIED | All present: one-line VPS capture command, floor build command, skip semantics doc, CI wiring section referencing cd.yml golden-oracle job. |
| `src/test/golden/fixtures/artifacts.tar.gz` | Committed non-empty floor archive | VERIFIED | File exists at 2215 bytes. Contains 9 JSON artifacts (matching build-floor-archive.sh INPUTS list; 9 snapshots committed). |
| `package.json test:golden script` | test:golden = vitest run src/test/golden --no-file-parallelism | VERIFIED | Present at line 27 exactly as specified. |
| `src/test/golden/__snapshots__/` | 9 file snapshots from floor artifacts | VERIFIED | 9 .snap.json files present (aggregate-combat, combat-events, connected-backfill, duplicate-slot-same-name, killed-events, metadata-drift, side-facts, valid-minimal, vehicle-context). Spot-checked pipeline-valid-minimal.snap.json — substantive normalized DB rows with uuid:N tokens and `<ts>` redaction. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `pipeline.golden.test.ts` | `src/server.ts` (production factories) | Imports `createRabbitMqParserRuntime`, `PgPublicStatsReadModel`, `ParserResultRecalculationService`, `buildApp`, `PgIngestRepository`, `IngestPromotionService`, `ParseJobPublisher`, `PgStatisticsRepository`, `createStorageClient` — same factories server.ts wires, never re-implemented | VERIFIED | All 9 production factory imports confirmed in pipeline.golden.test.ts. |
| `pipeline.golden.test.ts` | `src/infra/db/migrate.ts` | `runMigrations(config.databaseUrl)` in beforeAll | VERIFIED | `runMigrations` import + call confirmed in beforeAll. |
| `loader.ts` | `src/test/golden/fixtures/artifacts.tar.gz` | `existsSync(ARCHIVE_PATH)` + `execFileSync("tar", ["xzf", ...])` at test start | VERIFIED | ARCHIVE_PATH computed via `new URL("artifacts.tar.gz", import.meta.url)`. archivePresent() checks existence. loadGoldenArtifacts() unpacks. |
| `package.json test:golden` | `src/test/golden` | `vitest run src/test/golden --no-file-parallelism` — path no verify-chained script targets | VERIFIED | test:golden targets `src/test/golden` directly. test, test:coverage both have `--exclude 'src/test/golden/**/*.test.ts'`. test:integration uses `src/test/integration` positionally — no golden overlap. verify chain never references test:golden. |
| `cd.yml golden-oracle job` | `pnpm run test:golden` | `if: github.event_name == 'push' && (github.ref == 'refs/heads/master' || github.ref == 'refs/heads/main')` | VERIFIED | `.github/workflows/cd.yml` contains `golden-oracle` job with exact master-push gate, `run: pnpm run test:golden`, 30-minute timeout. Separate from `verify` job. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `pipeline.golden.test.ts` snapshotSurface | `surface` (9 DB tables + 5 /stats/* responses) | `pool.query(sql)` for each table + `app.inject` for each endpoint | Yes — real PG queries; `PgPublicStatsReadModel` wired into `buildApp` so /stats/* reflects DB state | FLOWING |
| `bounty-anchor.golden.test.ts` rotationBountyPoints | `points` from `bounty_points` table | `pool.query("select points from bounty_points where rotation_id=$1 and player_id=$2")` after real recalc | Yes | FLOWING |
| `invariants.golden.test.ts` promotion_evidence / conflict_details | JSONB columns read via raw pool.query | `pool.query("select status, promotion_evidence from ingest_staging_records ...")` | Yes | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED (requires live Docker/RabbitMQ infra; per the task prompt the executor already ran `pnpm test:golden` LIVE with 3 files / 21 tests green). The verifier cannot and must not re-run the full suite. Skip-clean behavior verified structurally: `describe.skipIf(!archivePresent())` + `if (!infraReachable) return` pattern confirmed in all three test files.

---

### Probe Execution

No probe-*.sh files declared in PLAN. capture-artifacts.sh and build-floor-archive.sh are operator tools (require VPS/cargo) — not testable in this environment. Both pass `bash -n` syntax validation.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| INGEST-02 | 260617-v4e-PLAN.md | Ingest pipeline behavioral regression coverage | SATISFIED | pipeline.golden.test.ts + invariants cover full ingest→stats chain against real infra |
| INGEST-03 | 260617-v4e-PLAN.md | Bounty correctness verification | SATISFIED | bounty-anchor.golden.test.ts hand-computed anchors with seeded rotation effectiveness |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/test/golden/scripts/capture-artifacts.sh` | 56 | `XXXXXX` in mktemp pattern matched by debt-marker grep | Info | False positive — mktemp template, not a debt marker. |
| `src/test/golden/scripts/build-floor-archive.sh` | 56 | Same mktemp pattern | Info | False positive — not a debt marker. |

No real TBD/FIXME/XXX markers. No stub implementations. No hardcoded empty data. No orphaned artifacts.

---

### Human Verification Required

#### 1. Commit the staged DRY consolidation (goldenInfraReachable)

**Test:** Run `git commit -m "test(260617-v4e): consolidate golden skip-guard into one shared helper"` in an interactive terminal (so GPG pinentry can complete).

**Expected:** Commit succeeds. `git status --short` is clean. The 3 staged files (loader.ts, pipeline.golden.test.ts, bounty-anchor.golden.test.ts) are committed. `pnpm verify` remains green. `pnpm run test:golden` with Docker up reports 3 files / 21 tests PASS.

**Why human:** GPG signing requires interactive TTY (`/dev/tty`) unavailable to the agent. The staged content has been verified correct at every level — this is exclusively a commit-delivery gap, not an implementation gap. The code exists and is wired; only the git commit is missing.

**Note:** The files read during this verification reflect the staged (working-tree) content, which IS the goldenInfraReachable-consolidated version. The committed tree (pre-stage) has the older duplicated archivePresent()+dockerReachable() pattern in pipeline and bounty suites, but the staged content is what the SUMMARY documents and what was verified LIVE. Either version satisfies the must-haves (both skip cleanly; the staged version is the DRY-consolidated form). The human_needed here is solely for git hygiene.

---

### Gaps Summary

No behavioral or functional gaps. All 8 must-have truths verified, all artifacts present and substantive, all key links wired, all snapshots committed and non-empty.

The single human_needed item is a git-hygiene gap: the DRY guard consolidation (goldenInfraReachable) is staged but not committed due to GPG pinentry unavailability. The implementation is verified correct. Running `git commit` interactively closes this.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_
