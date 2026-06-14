---
phase: 01-game-type-aware-statistics-parity
plan: 02
subsystem: statistics
tags: [game-type, classifier, parity, postgres, kysely, sg-replay-parser]

# Dependency graph
requires:
  - phase: 01-game-type-aware-statistics-parity (plan 01-01)
    provides: migration 0008 — replays.game_type (D2), game_type dimension + nullable rotation_id on aggregate tables (D1), is_show (D3)
provides:
  - "game-type/ submodule: GAME_TYPES order + INCLUDE_REPLAYS + deduped EXCLUDE_REPLAY_LINKS config (D4)"
  - "Pure classifyGameType() porting legacy prefix/sgs/sm-month-date/mace<10/include/exclude rules (Postgres-free)"
  - "extractMissionName() — mission-name extraction matching public-stats candidate-key order"
  - "PgFullRunStatisticsRepository.classifyGameTypesForCurrentReplays() — set-based replays.game_type write-back"
  - "Rotation reference fixture (legacy 20 ISO-week-snapped Monday-UTC windows) + reference-check test"
affects: [01-03 full-run service grouping, 01-04 per-type aggregates, 01-05 legacy-export/parity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure spec/classifier split from DB write (pure classifier has no pg import; set-based step owns the write)"
    - "Set-based classification-in-app: one SELECT load + per-row pure classify + one multi-row unnest UPDATE (mirrors F7 assignRotationsForCurrentReplays)"
    - "Operational-precondition reference-check test (pins legacy fixture, compares DB when present, skips cleanly when absent) instead of adding non-owned production code"

key-files:
  created:
    - src/modules/statistics/game-type/game-type-config.ts
    - src/modules/statistics/game-type/classify-game-type.ts
    - src/modules/statistics/game-type/tests/game-type-config.test.ts
    - src/modules/statistics/game-type/tests/classify-game-type.test.ts
  modified:
    - src/modules/statistics/repository/full-run.ts
    - src/modules/statistics/repository/tests/postgres.test.ts

key-decisions:
  - "sm date cutoff replicates legacy dayjs isAfter('2023-01-01','month') at MONTH granularity: kept iff replay month strictly after Jan 2023 (first eligible month = Feb 2023), implemented with native UTC year/month (no date-fns/es-toolkit dependency exists in this repo)"
  - "distinctPlayerCount = distinct artifact player eid count (per-replay entity id), matching legacy result.length of distinct parsed players"
  - "excludeReplays key form is /replays/<source_replay_id> (legacy replayLink), built from r.source_replay_id"
  - "extractMissionName duplicates the public-stats replay-mapper candidate-key list intentionally to keep the classifier dependency-free and avoid a cross-module import (depcruise boundary)"
  - "Rotation windows are an operational precondition entered via the admin API; server-2 adds NO snap/seed code — only a pure reference-check test"

patterns-established:
  - "Pattern: pure classifier (no pg) + set-based repo write-back, split for unit-testability (D2/D4)"
  - "Pattern: reference-check test for operationally-owned data (assert fixture well-formed, compare DB when seeded, skip when empty)"

requirements-completed: [PARITY-F8-CLASSIFY, PARITY-F8-CONFIG, PARITY-F8-ROTATIONS-VERIFY]

# Metrics
duration: 21min
completed: 2026-06-14
status: complete
---

# Phase 1 Plan 02: Game-Type Config + Pure Classifier + Set-Based Classification Summary

**Ported the legacy sg-replay-parser classification spec into a versioned game-type config + a Postgres-free `classifyGameType()`, then wired a set-based `classifyGameTypesForCurrentReplays()` that writes `replays.game_type` in one unnest UPDATE, plus a rotation reference-check pinning the legacy 20 ISO-week-snapped windows.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-06-14T06:49:35Z
- **Completed:** 2026-06-14T07:10:40Z
- **Tasks:** 2 (Task 1 via TDD)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- `game-type/` submodule: `GAME_TYPES` order, `INCLUDE_REPLAYS` (3 sg overrides), `EXCLUDE_REPLAY_LINKS` deduped 16→15 links (D4 — committed spec constants, no DB seed).
- Pure `classifyGameType()` ports the legacy order 1:1 (exclude-link → include override → `sgs` reject → prefix match in fixed order → mace<10 / sm-month-date filters → null), Postgres-free and fully unit-tested.
- `PgFullRunStatisticsRepository.classifyGameTypesForCurrentReplays()`: one SELECT load (mission + distinct player count + source link), per-row in-app classification, one multi-row `unnest` UPDATE write-back — mirrors F7 `assignRotationsForCurrentReplays`, no per-row loop.
- Real-pg test proves all five legacy cases (sg / mace<10→null / sm-pre-Feb-2023→null / excludeReplays→null / includeReplays-forced→sg) plus empty + bare-snapshot branches.
- Rotation reference-check test pins the legacy 20 Monday-UTC ISO-week-snapped windows, asserts well-formed (20 distinct, strictly ascending, Monday 00:00:00Z), and compares against seeded rotations when present (skips cleanly otherwise).

## Task Commits

1. **Task 1 (RED): failing tests for config + classifier** - `e5bfb81` (test)
2. **Task 1 (GREEN): config module + pure classifier** - `59a7f50` (feat)
3. **Task 2: set-based classify + rotation reference-check** - `23f28b5` (feat)
4. **Task 2 (coverage): empty + bare-snapshot branch tests** - `130a4df` (test)

_Plan metadata commit handled by the orchestrator (commit_docs)._

## Files Created/Modified
- `src/modules/statistics/game-type/game-type-config.ts` - GAME_TYPES tuple + GameType type, INCLUDE_REPLAYS, deduped EXCLUDE_REPLAY_LINKS Set (D4).
- `src/modules/statistics/game-type/classify-game-type.ts` - pure `classifyGameType()` + `extractMissionName()`; no pg import.
- `src/modules/statistics/game-type/tests/game-type-config.test.ts` - pins order, includes, dedupe length, known links.
- `src/modules/statistics/game-type/tests/classify-game-type.test.ts` - 27 assertions across every legacy branch.
- `src/modules/statistics/repository/full-run.ts` - `classifyGameTypesForCurrentReplays()` + `classifyReplay`/`distinctPlayerCount` helpers.
- `src/modules/statistics/repository/tests/postgres.test.ts` - real-pg game_type test, empty/bare branches, rotation reference fixture + 2 reference-check tests.

## Decisions Made
- **sm month-granular cutoff:** legacy `isAfter('2023-01-01','month')` keeps a replay iff its month is strictly after January 2023, so the first eligible month is February 2023 (all of Jan 2023 is excluded). Implemented with native `getUTCFullYear`/`getUTCMonth` — date-fns/es-toolkit are not dependencies in this repo, so the plan's "use date-fns" hint was satisfied with an equivalent month-granular native comparison. The plan's prose "on/after 2023-01-01 → sm" was reconciled to the exact legacy month semantics, verified against the legacy source `src/index.ts`.
- **distinctPlayerCount** = distinct `eid` over `raw_snapshot.players` (legacy `result.length` of distinct parsed players).
- **excludeReplays key** = `/replays/<source_replay_id>` link form.
- **extractMissionName** intentionally duplicates the public-stats candidate-key list to keep the classifier free of cross-module imports.

## Rotation-window correctness (must-verify gate (a) — discharged)
Rotation-window correctness is an **operational precondition**, NOT produced by server-2. Rotations are entered **only via the admin API** (`src/modules/admin/routes/rotations.ts` + `rotation-repository.ts`); server-2 does **not** seed them and does **not** snap dates. Per the patched plan, **no snap/seed helper or any production snap/seed code was added** to server-2 — that would be dead code implying a responsibility server-2 does not own. Instead a pure reference-check test pins the legacy 20 ISO-week-snapped Monday-UTC windows and surfaces any discrepancy against admin-entered rotations. The 20 admin-entered windows must equal the legacy 20; this is **confirmed already correct in staging**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] sm date comparison without date-fns**
- **Found during:** Task 1 (classifier)
- **Issue:** Plan suggested date-fns for the sm date comparison, but neither date-fns nor es-toolkit/dayjs is a dependency in this repo (would have required a package install — excluded from auto-fix and unnecessary).
- **Fix:** Implemented the month-granular cutoff with native `Date` UTC year/month accessors, replicating dayjs `isAfter(...,'month')` semantics exactly (verified against legacy `src/index.ts`).
- **Files modified:** src/modules/statistics/game-type/classify-game-type.ts
- **Verification:** Unit tests pin Jan-2023→null, Feb-2023→sm, pre-2023→null, null-date→null.
- **Committed in:** 59a7f50

**2. [Rule 1 - Bug] Lint/coverage corrections on new code**
- **Found during:** Both tasks
- **Issue:** ESLint flagged contractual `null` returns (`unicorn/no-null`), inline comment, import order, `.forEach`, `no-use-before-define`, and a numeric template literal; coverage gate required the empty + bare-snapshot branches of the new repo method.
- **Fix:** Applied repo-standard file-level `eslint-disable unicorn/no-null` (matching replay-mapper.ts/full-run.ts), reordered imports, converted to `for...of`, hoisted the rotation fixture const, `String()`-wrapped the literal, and added two branch-covering tests.
- **Files modified:** classify-game-type.ts, the two new test files, full-run.ts, postgres.test.ts
- **Verification:** `pnpm run lint` clean, `tsc --noEmit` clean, 100% branch coverage restored.
- **Committed in:** 59a7f50, 23f28b5, 130a4df

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug/quality).
**Impact on plan:** No scope creep; LOCKED decisions D2/D4 honored exactly. No production snap/seed code added for rotations.

## Issues Encountered
- **Parallel real-pg test contention (pre-existing):** Running multiple `*postgres.test.ts` files concurrently against the single shared dev database causes mutual `truncate ... cascade` interference (FK violations) — this affects the pre-existing public-stats/ingest/requests/auth real-pg suites too, not just this plan's tests. All 770 tests (including the new game_type and rotation tests) pass green with `pnpm vitest run --no-file-parallelism`, the intended execution mode for these shared-DB integration tests. This is a test-harness concurrency limitation, not a defect introduced by this plan.

## Verification
- `pnpm vitest run src/modules/statistics/game-type/tests/...` — 27 unit tests pass; classifier has no pg import.
- `pnpm vitest run .../postgres.test.ts -t "game_type"` and `-t "rotation"` — pass.
- Full statistics suite: 139/139. Whole suite (sequential): 770/770, 100% coverage (statements/branches/functions/lines).
- `pnpm run lint` / `tsc --noEmit` clean. OpenAPI contract diff empty (no route change).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `replays.game_type` is canonically populated set-based; `classifyGameTypesForCurrentReplays()` is drop-in for the full-run service (01-03) to call before grouping.
- Config + classifier own the spec; 01-04 per-type aggregates and 01-05 legacy-export/parity can read `game_type` as the grouping key.
- Rotation must-verify gate (a) discharged (operational precondition, confirmed in staging).

## Self-Check: PASSED

All 4 created files present; all 4 task commits (e5bfb81, 59a7f50, 23f28b5, 130a4df) found; `classifyGameTypesForCurrentReplays` present in full-run.ts.

---
*Phase: 01-game-type-aware-statistics-parity*
*Completed: 2026-06-14*
