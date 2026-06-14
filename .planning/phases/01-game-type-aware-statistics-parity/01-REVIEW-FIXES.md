# Phase 1 Review Fixes — feat/parity-phase-01-game-type-stats

Fixes for the BLOCKER + parity findings in `01-REVIEW.md`. Perf findings 3/4/5 were
intentionally left for the dedicated perf pass. `pnpm verify` is fully green:
format, lint, typecheck, 794 unit tests, 185 integration tests, OpenAPI contract
diff EMPTY, backup/boundary checks, and 100% coverage (statements/branches/
functions/lines).

Each fix committed atomically on `feat/parity-phase-01-game-type-stats`.

---

## BLOCKER 1 — single-replay audit path game-type-correctness

**Finding:** `recalculate*ForParserResult` loaded type-AGNOSTIC rotation inputs
(`loadAggregateReplayInputs` = every replay in the rotation) but wrote through a
scope keyed by the triggering replay's persisted `game_type`, so the first
moderation recompute after a full run wrote a mixed all-types aggregate into the
`sg` bucket — corrupting the sg per-rotation parity bucket. Also covered findings
8 (mace/sm must not get per-rotation rows) and 9 (is_show denominator).

**Fix:** `src/modules/statistics/repository/repository.ts`
- New `replayGameType()` reads the replay's persisted canonical `game_type` (D2).
- New `auditScopes(gameType, rotationId)` resolves the type-filtered scopes:
  - `null` (excluded) → `[]` (no-op; contributes to no bucket).
  - `sg` → sg per-rotation bucket for its rotation **AND** sg all-time bucket (D1).
  - `mace`/`sm` → that type's all-time bucket only (D1, no per-rotation).
- The three `*ForParserResult` methods now loop over `auditScopes`, loading each
  scope via `loadScopedAggregateReplayInputs`/`loadScopedCommanderReplayInputs`
  (type-filtered — inputs match the write key). `is_show` uses the scoped game
  count; bounty carry-in reads the previous rotation's same-type bucket.
- Method signatures and the `ops:stats:recalculate` report shape preserved.
- Removed the now-unused type-agnostic loaders `loadAggregateReplayInputs` and
  `loadCommanderReplayInputs`.

**Tests:**
- `postgres.test.ts` (real-pg, new):
  - "audit recompute after classification keeps per-type buckets correct: sg
    rebuild stays sg-only, mace makes no per-rotation rows, excluded is a no-op".
  - "audit recompute is_show on the sg path uses the sg-scoped denominator".
- `postgres.test.ts` (existing audit/cross-path tests strengthened): classify as
  sg and assert the per-type writes (per-rotation + all-time); the per-replay vs
  set-based equality tests now compare the sg per-rotation buckets explicitly.
- Unit (`utilities.ts` ScriptedClient + `index.test.ts`/`bounty.test.ts`/
  `commander.test.ts`): added a configurable `auditGameType` (default `sg`,
  `mace` for single-scope cases) and `select r.game_type` routing; assertions
  updated to the new per-type contract (sg → two scopes, mace → one all-time).

**Commit:** `2a56971`

---

## BLOCKER 2 — stale pre-migration NULL-type aggregate rows

**Finding:** After 0008 added `game_type`, existing aggregate rows kept
`game_type IS NULL`; the full-run rebuild only deletes the bucket it writes, so
those rotation-scoped NULL-type rows survive and the type-agnostic public
`parity-sql` path triple-counts on a migrated DB.

**Fix:** `src/infra/db/migrations/0009_delete_pre_phase_null_type_aggregates.sql`
- `delete from <each of the four aggregate tables> where game_type is null`.
- Comment records that a full `ops:stats:recalculate` must follow deploy to
  repopulate per-type buckets. 0008 left checksum-immutable (untouched).

**Tests:** `postgres.test.ts` (real-pg, new): "migration 0009 cleanup deletes
stale pre-phase NULL-type rows so the public path stops double-counting" — seeds
pre-phase NULL-type rows in all four tables, proves the type-agnostic public path
double-counts before cleanup, applies the exact shipped 0009 DELETEs, asserts no
`game_type IS NULL` rows survive and the public sum no longer includes the stale
contribution.

**Commit:** `a9f7e80`

---

## HIGH 6 + 7 — rotation totalGames parity divergence

**Finding:** `ROTATION_STATS_SQL` counted `count(distinct replay.id)` over
`replays.status='parsed'` with no game_type filter, while the nested players/
squads payloads filter `game_type='sg'`. This inflated `rotationStats[].totalGames`
beyond the legacy sg-only count, and used the wrong status denominator.

**Fix:** `src/modules/statistics/repository/legacy-export.ts` — the rotation game
count join now filters `replay.game_type = 'sg'` AND requires an existing
`parser_results.status = 'current'` row (the scope classification/aggregation
denominator), replacing `replays.status = 'parsed'`.

**Tests:** `postgres.test.ts` (real-pg, new): "rotation totalGames counts only sg
replays with a current parser_result, excluding mace/sm/excluded" — seeds 2 sg +
mace + sm + excluded replays in one window and asserts `totalGames === 2`.

**Commit:** `1bf0c85`

---

## MEDIUM 11 — exclude-list count invariant

**Finding:** the 16-raw/15-distinct exclude-list contract was not pinned
in-module; a second accidental duplicate would compile and quietly change the
corpus.

**Fix:** `src/modules/statistics/game-type/game-type-config.ts` — added
`assertExcludeListInvariant(rawCount, distinctCount)`, invoked at module load with
the real constants.

**Tests:** `game-type-config.test.ts` — pass branch plus both throw branches
(raw-count drift, distinct-count drift).

**Commit:** `3e9e0a7`

---

## MEDIUM 10 — parity-sql bool_or assumption

**Finding:** `coalesce(bool_or(stats.is_show), true)` is correct only because the
bucket join yields exactly one all-time row per player; the assumption was
undocumented and hinges on BLOCKER 2 being fixed.

**Fix:** `src/modules/statistics/repository/parity-sql.ts` — comment on
`isShowSelect` documenting that the single-row guarantee comes from the 0008
`UNIQUE NULLS NOT DISTINCT` constraint and the `game_type = $bucket` predicate,
and that 0009 removes the stale NULL rows.

**Commit:** `0fdf15c`

---

## Notes

- LOCKED D1–D4 honored throughout. No parity test weakened — coverage strengthened
  (per-type audit assertions, migration-cleanup case, rotation-totalGames sg
  scoping, exclude-list invariant branches).
- Docs (SUMMARY/STATE/REVIEW/ROADMAP) intentionally NOT committed; left for the
  orchestrator.
