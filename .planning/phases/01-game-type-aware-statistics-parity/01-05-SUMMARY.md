---
phase: 01-game-type-aware-statistics-parity
plan: 05
subsystem: statistics
tags: [game-type, parity, all-time, is-show, real-pg, legacy-export, F8]

# Dependency graph
requires:
  - phase: 01-game-type-aware-statistics-parity (plan 01-03)
    provides: game-type-aware recalc — sg per-rotation + sg/mace/sm all-time rows, player_stats.is_show persisted per scope
  - phase: 01-game-type-aware-statistics-parity (plan 01-04)
    provides: per-type/all-time legacy export with the is_show straight-read split
provides:
  - "F8 parity proof: an extended real-pg comparison harness proving per-type (sg/mace/sm) + all-time + sg-per-rotation aggregates and the is_show split against a hand-derived legacy oracle"
  - "seedParityCorpus: deterministic steam-id multi-type corpus exercising every legacy classification branch (sg×2 rotations, mace>=10/<10, sm Feb-2023/Dec-2022, excludeReplays link, includeReplays Red Dawn)"
  - "Per-scope is_show boundary proof (same player hidden all-time, shown per-rotation) + audit-path/report-shape preservation under the corpus"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-derived parity oracle: expectations computed from the seed (replay_count per scope, 15% is_show threshold) — never re-run from the code under test (T-01-13)"
    - "Per-scope is_show oracle: a player below the sg all-time 15%-threshold (1 of 8 < 1.2) but above its sg per-rotation threshold (1 of 4 >= 0.6) proves is_show is computed per scope, not globally"
    - "Exclusion proven by ABSENCE: mace<10 / sm<2023 / excludeReplays-only players assert count(*)=0 across all buckets, not just missing-from-one-list"

key-files:
  created: []
  modified:
    - src/modules/statistics/repository/tests/postgres.test.ts

key-decisions:
  - "Corpus uses pre-seeded steam-id identities so every player's scope replay_count is exactly the number of seeded replays they were listed in (the aggregator counts a replay_count for each artifact player), making the is_show + per-type oracle fully hand-derivable"
  - "sg all-time = 8 games (4 RotA + 4 RotB incl. the Red Dawn include-force); the excludeReplays-linked sg replay is game_type NULL and is asserted to contribute to NOTHING (Above's count stays 8, not 9)"
  - "Single parity test commit covers both plan tasks: the corpus seed (Task 1) and the assertions (Task 2) are one cohesive change to one file; classification smoke + per-type/all-time + is_show + audit/report are distinct it() cases"

patterns-established:
  - "Pattern: parity oracle hand-derived from a steam-id-pinned seed; exclusions asserted by absence; is_show proven at two scope sizes for the same player"

requirements-completed: [PARITY-F8-PARITY-PROOF]

# Metrics
duration: ~25min
completed: 2026-06-14
status: complete
---

# Phase 1 Plan 05: F8 Parity Proof — Per-Type + All-Time + is_show Summary

**Extended (not replaced) the real-pg comparison harness with a hand-derived multi-type corpus that proves, end-to-end, the game-type-aware path: per-type sg/mace/sm + all-time + sg-per-rotation aggregates, exclusion of mace<10 / sm<2023 / excludeReplays / NULL replays, the per-scope is_show split, and preservation of the single-replay audit path and the ops:stats:recalculate report shape — all green under full `pnpm verify` with 100% coverage and an empty OpenAPI contract diff.**

## Performance
- **Tasks:** 2 (both type=auto; combined into one cohesive parity-proof change to one file)
- **Files modified:** 1 (`postgres.test.ts`) + 4 prior-plan files reformatted (whitespace only)

## Accomplishments
- **`seedParityCorpus`** builds a deterministic steam-id corpus exercising every legacy branch (RESEARCH B): sg across two rotation windows (RotA 4 games, RotB 4 games incl. the `Red Dawn` includeReplays force), mace `>=10` (kept) and `<10` (excluded), sm `2023-02-01` (kept) and `2022-12-31` (excluded), and an `excludeReplays`-linked (`/replays/1662231981`) sg replay (NULL). Runs the full set-based recalc once.
- **Classification smoke** proves every seeded replay resolves to the expected `game_type` (incl. the four NULLs).
- **Per-type + all-time parity:** sg all-time = RotA+RotB games with no per-rotation/all-time double-count and no cross-type bleed; mace/sm produce all-time rows only (asserted zero per-rotation rows); the excludeReplays-linked sg replay does NOT raise `Above`'s sg count; mace<10-only, sm<2023-only, and excluded players are absent from EVERY bucket (`count(*)=0`).
- **is_show per scope:** `Below` (1 sg game) is hidden in the sg all-time scope (`1 < 0.15*8`) yet shown in its sg rotation (`1 >= 0.15*4`) — same player, different scope. The legacy export (`PgLegacyPublicStatsExportRepository.loadExportData` + `LegacyPublicStatsExportService.export`) reflects the persisted `isShow` flag straight (D3).
- **Audit + report guard (must-verify gate b):** single-replay `recalculatePlayerAndSquadStatsForParserResult` keeps its exact return key-set (`playerStats/rotationId/squadStats/status`); the full-run report preserves its top-level + `summary` key-sets and the additive optional `allTimeAggregateRows` field in fixed `[sg,mace,sm]` order.

## The parity oracle (hand-derived, not re-run from the code) — T-01-13
Every expectation is derived from the seed, not from the implementation. The aggregator assigns each artifact player a `replay_count` equal to the number of distinct replays they appear in within a scope; the is_show threshold is the legacy `(15 * scopeGames) / 100` (scope < 125) UNROUNDED. With 8 sg replays all-time and `Above` in all 8 / `Below` in 1, the all-time threshold is `1.2` → `Above` shown, `Below` hidden; with RotB's 4 sg games the threshold is `0.6` → `Below` shown. Exclusions are proven by asserting absence (`count(*)=0`), so a regression that silently included a filtered replay would fail, not pass.

## Task Commits
1. **F8 parity proof (corpus seed + per-type/all-time/is_show/audit assertions)** — `1f5f8dd` (test)
2. **Prettier on prior-plan files drifting the format gate** — `e81ca1d` (chore)

_SUMMARY/STATE/ROADMAP intentionally NOT committed per execution constraints for this plan._

## Files Modified
- `src/modules/statistics/repository/tests/postgres.test.ts` — `seedParityCorpus` + `seedCorpusReplay`/`requiredEid`/`playerScopeReplayCounts`/`playerScopeIsShow` helpers; four new parity `it()` cases (classification smoke, per-type+all-time, per-scope is_show, audit+report). File-level eslint disable extended with `max-statements`, `unicorn/consistent-function-scoping` (test-helper convention, matching the existing disables).
- `src/modules/statistics/repository/full-run.ts`, `.../game-type/classify-game-type.ts`, `.../game-type/tests/classify-game-type.test.ts`, `.../service/full-run-recalculation.ts` — prettier whitespace only (no logic), see deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing prettier drift in prior-plan files failed the tree-wide format gate**
- **Found during:** running `pnpm verify` after the parity commit.
- **Issue:** `prettier --check .` (first step of `verify`) flagged 4 files committed by 01-02/01-03 (`full-run.ts`, `classify-game-type.ts`, its test, `full-run-recalculation.ts`) as unformatted — purely line-wrapping whitespace, no behavior change. This blocked the mandated full-`verify` green gate.
- **Fix:** `prettier --write` on those 4 files (and my own test file). No logic touched; isolated in a separate `chore(01-05)` commit so the parity proof commit stays test-only.
- **Files modified:** the 4 files above.
- **Verification:** `prettier --check .` clean tree-wide; all suites + coverage unchanged.
- **Committed in:** e81ca1d

**2. [Rule 1 - Test correctness] First-draft oracle mis-seeded the mace-kept replay**
- **Found during:** first parity run.
- **Issue:** the initial corpus reused `seedManyPlayerKillReplay` (which names players `Alpha`/`Bravo`/`Filler N`) for the kept mace replay, so the named `MaceKept` steam player was never actually in it → `maceAllTimeCounts.get("MaceKept")` was `undefined`. The oracle expectation was right; the seed was wrong.
- **Fix:** seeded the mace-kept replay via `seedCorpusReplay` with 11 named steam players including `MaceKept` + the 10 pre-seeded `MaceFiller N`. Also corrected my own report-key expectation (had omitted `reportVersion`).
- **Files modified:** postgres.test.ts.
- **Verification:** all 6 parity cases green.
- **Committed in:** 1f5f8dd (pre-commit fix).

---

**Total deviations:** 2 auto-fixed (1 blocking-format, 1 test-correctness). No LOCKED decision altered; no production code changed; no scope creep. **The parity proof surfaced NO discrepancy in the 01-01..01-04 implementation** — every hand-derived expectation matched the persisted aggregates and the export output on the first correct seed.

## Verification
- `pnpm vitest run .../postgres.test.ts --no-file-parallelism` — 26/26 (22 pre-existing + 4 new parity, the new block contributing 6 assertions-cases counting the smoke split).
- **Full `pnpm verify` GREEN:** format ✓, lint ✓, typecheck ✓, unit 606 ✓, integration 181 ✓, `openapi:check` ✓ (empty contract diff — regenerated client types with no drift), backup-runbook ✓, boundary ✓.
- **Coverage 100%** statements (3205/3205) / branches (1501/1501) / functions (1026/1026) / lines (3154/3154), 787 tests.

## Known Stubs
None.

## Threat Flags
None — test-only change. The only trust boundary touched (test oracle → asserted output) is in the plan's register: T-01-13 (false-green oracle) mitigated by hand-deriving every expectation from the seed and asserting exclusions by absence; T-01-14 (non-deterministic seed) mitigated by fixed timestamps/source ids, steam-id-pinned identities, and the truncate-per-test isolation.

## Next Phase Readiness
- F8 parity is now proven end-to-end on the new side. The per-type + all-time + is_show export matches the hand-derived legacy `sg-replay-parser` semantics, the single-replay audit path and ops report shape are intact, and the public OpenAPI contract is byte-unchanged — unblocking the F8 parity-driver diff against legacy `sg_stats`.

## Self-Check: PASSED
Both task commits (`1f5f8dd`, `e81ca1d`) present in git log; the parity proof lives in the single modified tracked file `postgres.test.ts`; full `pnpm verify` green with 100% coverage and an empty OpenAPI diff.

---
*Phase: 01-game-type-aware-statistics-parity*
*Completed: 2026-06-14*
