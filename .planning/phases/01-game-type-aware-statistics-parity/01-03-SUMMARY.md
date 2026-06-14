---
phase: 01-game-type-aware-statistics-parity
plan: 03
subsystem: statistics
tags: [game-type, recalc, all-time, is-show, parity, postgres, kysely, full-run]

# Dependency graph
requires:
  - phase: 01-game-type-aware-statistics-parity (plan 01-01)
    provides: migration 0008 — replays.game_type, game_type + nullable rotation_id + NULLS NOT DISTINCT uniqueness on the four aggregate tables, player_stats.is_show
  - phase: 01-game-type-aware-statistics-parity (plan 01-02)
    provides: classifyGameTypesForCurrentReplays() set-based write-back, pure classifyGameType(), game-type config module
provides:
  - "Pure computeIsShow(totalPlayedGames, scopeGameCount) — verbatim filterPlayersByTotalPlayedGames port (D3)"
  - "AggregateScope (rotation|allTime × game_type) with scoped load/group/replace in the repository (D1/D2)"
  - "recalculate{PlayerAndSquad,CommanderSide,Bounty}{ForScope,ForAllTime} repo methods + all-time aggregation pass"
  - "game_type-aware replace*Rows (delete+insert keyed on rotation_id/game_type via IS NOT DISTINCT FROM); player_stats carries is_show"
  - "Full-run service classifies then drives sg per-rotation + sg/mace/sm all-time, preserving the ops:stats:recalculate report shape (additive optional allTimeAggregateRows)"
affects: [01-04 per-type legacy-export, 01-05 legacy-export/parity diff]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope discriminated union (rotation|allTime) drives load + delete predicate; pure aggregator stays type-agnostic, repository selects the scoped set (conventions: grouping in orchestration, not in the calc)"
    - "Bucket-keyed delete via `rotation_id is not distinct from $1 and game_type is not distinct from $2` — handles all-time (NULL rotation) and legacy single-bucket (NULL game_type) without a separate code path, and never references audit tables"
    - "Additive-only report evolution: per-type all-time counts roll into changedAggregateRows plus an OPTIONAL allTimeAggregateRows field; existing report keys unchanged (report-shape must-verify gate)"
    - "is_show computed once at recalc from the scope's distinct-replay count, persisted on player_stats (D3 rejects export-time is_show)"

key-files:
  created:
    - src/modules/statistics/game-type/is-show.ts
    - src/modules/statistics/game-type/tests/is-show.test.ts
  modified:
    - src/modules/statistics/repository/repository.ts
    - src/modules/statistics/service/full-run-recalculation.ts
    - src/modules/statistics/repository/tests/postgres.test.ts
    - src/modules/statistics/service/tests/full-run-recalculation.test.ts
    - src/modules/statistics/repository/tests/commander.test.ts
    - src/modules/statistics/repository/tests/bounty.test.ts

key-decisions:
  - "Single-replay *ForParserResult audit path writes rows tagged with the replay's OWN persisted game_type (NULL when unclassified) — preserves the pre-phase single-bucket behavior exactly; per-type split is the full-run service's job (CONTEXT must-verify gate (b))"
  - "Per-rotation rebuild is sg-only (D1); mace/sm get all-time passes only. All-time bounty has no previous rotation (no carry-in) → empty previous effectiveness; per-rotation previous-rotation reads are game-type-filtered so per-type bounty stays isolated"
  - "Delete predicates use IS NOT DISTINCT FROM on (rotation_id, game_type) so one predicate serves rotation, all-time, and legacy-NULL buckets; only the four aggregate tables are ever touched (T-01-07)"
  - "is_show threshold scope = distinct replays in the loaded scope inputs (per-rotation games for sg rotations; per-type total for all-time), computed at recalc"
  - "computeIsShow replicates legacy (15*gamesCount)/100 UNROUNDED; 125 uses the flat 20 threshold, 124 uses 15%"

patterns-established:
  - "Pattern: AggregateScope discriminated union threads game-type + rotation/all-time through load → calc → replace; the pure aggregator never learns about game_type"
  - "Pattern: bucket-keyed delete+insert via IS NOT DISTINCT FROM, audit-table-free, asserted by a real-pg preservation test"
  - "Pattern: additive-only report evolution (optional field + roll-up into existing totals) to keep an external JSON contract stable"

requirements-completed: [PARITY-F8-AGGREGATE-PERTYPE, PARITY-F8-AGGREGATE-ALLTIME, PARITY-F8-ISSHOW, PARITY-F8-AUDIT-PRESERVE]

# Metrics
duration: 49min
completed: 2026-06-14
status: complete
---

# Phase 1 Plan 03: Game-Type-Aware Recalc (Per-Type + All-Time + is_show) Summary

**Made recalc game-type-aware end-to-end: a scoped load/group/replace writes sg per-rotation AND sg/mace/sm all-time (rotation_id NULL) aggregates keyed by `replays.game_type`, persists `is_show` from the legacy threshold per scope, skips excluded (NULL) replays, and preserves the single-replay audit path, the `ops:stats:recalculate` report shape, and moderation audit patches.**

## Performance

- **Duration:** 49 min
- **Started:** 2026-06-14T07:22:18Z
- **Completed:** 2026-06-14T08:11:45Z
- **Tasks:** 3 (Task 1 via TDD)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- Pure `computeIsShow(totalPlayedGames, scopeGameCount)` ports legacy `filterPlayersByTotalPlayedGames` verbatim (flat ≥20 at scope ≥125, unrounded `(15*scopeGameCount)/100` below 125), Postgres-free and fully unit-tested (D3).
- Repository is now game-type-aware via an `AggregateScope` discriminated union: scoped loaders filter current parser results by `replays.game_type` (and rotation for the rotation scope), excluded NULL replays are never selected (D2), and `replace*Rows` write `game_type` + (for player_stats) `is_show` while deleting only the matching `(rotation_id, game_type)` bucket of the four aggregate tables.
- Added the all-time aggregation pass (`recalculate*ForAllTime`) writing `rotation_id NULL` rows for sg/mace/sm; per-rotation rebuild is sg-only (D1).
- Full-run service classifies game_type (01-02) before grouping, drives sg per-rotation + sg/mace/sm all-time, and preserves the `FullRunRecalculationReport` / `ops:stats:recalculate` JSON shape — per-type/all-time counts roll into `changedAggregateRows` plus an OPTIONAL additive `allTimeAggregateRows` field (no existing key removed/renamed).
- Real-pg end-to-end test: sg has per-rotation + all-time rows, mace/sm have all-time only, excluded replays produce no rows, `is_show` is set, and the report `summary` key-set is pinned. A dedicated test proves the recompute leaves `audit_patches` untouched (T-01-07). The cross-path equality test now asserts set-based per-rotation sg rows equal the per-replay audit path.

## Task Commits

1. **Task 1 (RED): failing tests for computeIsShow** - `eb5a991` (test)
2. **Task 1 (GREEN): pure computeIsShow** - `bc518ed` (feat)
3. **Task 2: game-type-aware scoped load/group/replace + all-time + is_show** - `7cceca9` (feat)
4. **Task 3: full-run classify → sg per-rotation + sg/mace/sm all-time, report preserved** - `5408d4c` (feat)

_Plan metadata commit handled by the orchestrator (commit_docs)._

## Files Created/Modified
- `src/modules/statistics/game-type/is-show.ts` - pure `computeIsShow` (legacy threshold port, D3).
- `src/modules/statistics/game-type/tests/is-show.test.ts` - boundary/edge unit tests (124 vs 125, scope 0, unrounded 15%).
- `src/modules/statistics/repository/repository.ts` - `AggregateScope`, scoped loaders, `recalculate*ForScope`/`recalculate*ForAllTime`, game_type+is_show-aware `replace*Rows`, type-filtered previous-bounty read, all-time squad-membership window, single-replay audit path tagged with the replay's own game_type.
- `src/modules/statistics/service/full-run-recalculation.ts` - classify-before-group, sg per-rotation + sg/mace/sm all-time passes, extended repository interface, optional additive `allTimeAggregateRows`, roll-up into `changedAggregateRows`.
- `src/modules/statistics/repository/tests/postgres.test.ts` - per-type/all-time e2e, audit-preservation test, per-rotation-scoped cross-path equality, `seedManyPlayerKillReplay`, scoped `aggregateSnapshot`.
- `src/modules/statistics/service/tests/full-run-recalculation.test.ts` - fake repository gains classify + all-time methods; `calls` assertions updated for the new pass order.
- `src/modules/statistics/repository/tests/commander.test.ts`, `.../bounty.test.ts` - scripted-client insert-param assertions gain the trailing `game_type` column.

## Decisions Made
- **Audit path preservation:** the single-replay `*ForParserResult` path is intentionally NOT re-classified — it writes the replay's currently-persisted `game_type` (NULL when unclassified), so it keeps emitting the pre-phase single bucket and its existing return shape. The per-type split lives only in the full-run service (CONTEXT must-verify gate (b)).
- **Per-rotation = sg only (D1):** the per-rotation rebuild passes `gameType='sg'`; mace/sm are driven only by all-time passes. All-time bounty has no previous rotation, so previous effectiveness is empty; per-rotation previous reads are game-type-filtered to keep per-type bounty isolated.
- **One delete predicate for all buckets:** `rotation_id is not distinct from $1 and game_type is not distinct from $2` serves the rotation, all-time (NULL rotation), and legacy-NULL (audit) buckets without a branch, and references only the four aggregate tables.
- **Report stays a contract:** existing `mode`/`reportVersion`/`summary`/`results`/`failures`/`lifecycle` keys are unchanged; all-time information is purely additive (rolled into `changedAggregateRows` plus an optional `allTimeAggregateRows`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing cross-path equality test diverged by design after per-type grouping**
- **Found during:** Task 3
- **Issue:** The pre-existing "full-run service matches the per-replay path" real-pg test seeded mission-less replays (game_type NULL). After this plan, the full run writes the sg bucket (empty for NULL replays) while the per-replay audit path writes the NULL bucket, so a whole-table snapshot equality necessarily failed.
- **Fix:** Gave the seeded replays sg-prefixed missions, classify before the per-replay path, and compare the *per-rotation sg* snapshots (with a separate assertion that the all-time bucket and the additive report field exist). The cross-path invariant is preserved at the correct granularity.
- **Files modified:** src/modules/statistics/repository/tests/postgres.test.ts
- **Verification:** test passes; per-rotation sg set-based == per-replay; all-time rows present; report keys pinned.
- **Committed in:** 5408d4c

**2. [Rule 3 - Blocking] Scripted-client unit tests pinned the old insert column lists**
- **Found during:** Task 3
- **Issue:** `commander.test.ts` and `bounty.test.ts` assert exact insert parameters; adding `game_type` (commander/bounty) made the param arrays diverge. The full-run unit fake also no longer satisfied the extended repository interface.
- **Fix:** Appended the trailing `game_type` (`null` in these audit-path scenarios) to the affected insert-param assertions; added classify + `*ForAllTime` methods to the fake repository and updated the `calls` ordering assertions. The new `replayRotationScope` lookup falls through the scripted client to an empty result (→ NULL game_type), so no new scripted branch was needed.
- **Files modified:** commander.test.ts, bounty.test.ts, full-run-recalculation.test.ts
- **Verification:** statistics suite 149/149; full suite 778/778; 100% coverage.
- **Committed in:** 5408d4c

**3. [Rule 3 - Blocking] ESLint param-count / import-order / ternary / boolean-compare on new code**
- **Found during:** Tasks 2–3
- **Issue:** `replaceAggregateRows` hit the 3-param max; import ordering, a nested ternary in the test snapshot helper, a redundant `=== true`, and magic-number/inline-comment rules in the new test fired.
- **Fix:** Collapsed `replaceAggregateRows`' aggregates+scopeGames into one `write` object; reordered imports; extracted `aggregateScopePredicate`; simplified the boolean check; applied a file-level `no-magic-numbers, no-inline-comments` disable on the is-show test (matching the repo's existing test-file convention).
- **Files modified:** repository.ts, full-run-recalculation.ts, is-show.test.ts, postgres.test.ts
- **Verification:** `pnpm run lint` clean across all changed files; `tsc --noEmit` clean.
- **Committed in:** bc518ed, 7cceca9, 5408d4c

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). No LOCKED decision was altered; D1/D2/D3 honored exactly. No scope creep.
**Impact on plan:** All auto-fixes were necessary to keep the existing test contracts and lint gate green while the new behavior landed.

## Moderation audit preservation (T-01-07 — discharged)
The recompute rewrites only the four derived aggregate tables. Every delete predicate is `... where rotation_id is not distinct from $1 and game_type is not distinct from $2` against `player_stats`/`squad_stats`/`commander_side_stats`/`bounty_points`; `audit_patches` and `moderation_actions` are never referenced in any recalc path. A real-pg test seeds a `moderation_actions` + `audit_patches` row, runs `recalculateAllCurrentParserResults`, and asserts the audit patch row survives untouched.

## Issues Encountered
- **Parallel real-pg contention (pre-existing):** the shared dev database makes concurrent `*postgres.test.ts` files interfere via `truncate ... cascade`. All suites pass green with `--no-file-parallelism` (the intended mode for these shared-DB integration tests), as documented in 01-02.

## Verification
- `pnpm vitest run src/modules/statistics/game-type/tests/is-show.test.ts` — 6 unit tests pass.
- `pnpm vitest run .../repository/tests/postgres.test.ts --no-file-parallelism` — 21 real-pg tests pass (per-type/all-time, is_show, audit preservation, report shape, cross-path equality).
- `pnpm vitest run .../service/tests/full-run-recalculation.test.ts` — 5 unit tests pass (classify + per-rotation sg + all-time call order).
- Full suite (sequential): 778/778; coverage 100% statements/branches/functions/lines.
- `pnpm exec eslint` clean on all changed files; `tsc --noEmit` clean.
- `pnpm run ops:boundary:check` clean (no layer/module violations); `pnpm run openapi:check` — contract diff empty (public API untouched).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Recalc now produces game-type-aware per-rotation (sg) and all-time (sg/mace/sm) aggregates with persisted `is_show`, behind preserved report/audit shapes.
- 01-04 (per-type legacy-export) can read `player_stats.is_show` directly for the `otherPlayers` split and `game_type` as the grouping key, including the `rotation_id IS NULL` all-time buckets.
- 01-05 (parity diff) can compare per-type + all-time aggregates against legacy.

## Threat Flags
None — no new network endpoints, auth paths, or trust-boundary surface introduced; the only trust boundary touched (recompute → aggregate tables) is the one already in the plan's threat register and is mitigated (T-01-07).

## Self-Check: PASSED

Both created files present; all four task commits (eb5a991, bc518ed, 7cceca9, 5408d4c) found in git log; `computeIsShow` present in is-show.ts; `recalculate*ForAllTime` + `classifyGameTypesForCurrentReplays` wired through the full-run service.

---
*Phase: 01-game-type-aware-statistics-parity*
*Completed: 2026-06-14*
