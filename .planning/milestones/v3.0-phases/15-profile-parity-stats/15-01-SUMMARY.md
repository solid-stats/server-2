---
phase: 15-profile-parity-stats
plan: 01
subsystem: statistics
tags: [parity, sql-extraction, refactor, formulas, byte-identical]
requires: []
provides:
  - "parity-sql module: PLAYER_ENTITY_CTE + 5 scoped/unscoped SQL builders"
  - "parity-formulas module: kdRatio/totalScore/weeklyScore/killsFromVehicleCoef/round"
  - "exported legacy mappers (mapWeapons/mapWeeks/mapRelationships/playerStats/squadStats)"
  - "exported legacy sort/format helpers (sortWeapons/sortWeeks/sortRelationships/weekExport)"
affects:
  - "Plans 02/03 per-entity profile parity API reads (consume scoped builders + reuse mappers)"
tech-stack:
  added: []
  patterns:
    - "Per-surface SQL builder returning { sql, values }; unscoped form byte-identical to legacy constant"
    - "Pure-formula module shared by CLI export and future API mappers"
    - "Parameterized scope predicate ($1::uuid / $1::text); no id string concatenation"
key-files:
  created:
    - src/modules/statistics/parity-formulas.ts
    - src/modules/statistics/parity-formulas.test.ts
    - src/modules/statistics/repository/parity-sql.ts
    - src/modules/statistics/repository/tests/parity-sql.test.ts
  modified:
    - src/modules/statistics/export/legacy-public-export.ts
    - src/modules/statistics/repository/legacy-export.ts
decisions:
  - "round() lives in parity-formulas and is imported by legacy-public-export (perGame stays byte-identical)"
  - "playerStatsSql scopes by player.id = $1::uuid; squadStatsSql by squad.id = $1::uuid"
  - "weapons/weeks scope by entity.player_id = $1::text; relationships by source_player_id = $1::text"
  - "Task 4 = export-in-place (no relocation) — lowest risk for byte-identical CLI output"
metrics:
  duration: "~8 min"
  completed: 2026-06-06
  tasks: 4
  files: 6
---

# Phase 15 Plan 01: Parity SQL/Formula Extraction Summary

Extracted all parity SQL (shared `PLAYER_ENTITY_CTE` + five per-surface queries) from
`legacy-export.ts` into a shared `parity-sql.ts` whose builders emit byte-identical unscoped
SQL for the CLI export and a parameterized scoped form for future per-entity API reads; pulled
the pure scoring formulas into `parity-formulas.ts`; and exported nine previously-private
mappers/helpers so Plans 02/03 can reuse them byte-identically.

## What Was Built

- **Task 1 (TDD):** `parity-formulas.ts` exporting `kdRatio`, `killsFromVehicleCoef`,
  `totalScore`, `weeklyScore`, and the shared `round`. `legacy-public-export.ts` now imports +
  re-exports these (existing importers and formula tests unaffected). New unit test
  `parity-formulas.test.ts` (4 formula groups).
- **Task 2 (TDD):** `parity-sql.ts` exporting `PLAYER_ENTITY_CTE` and five builders
  (`playerStatsSql`, `squadStatsSql`, `relationshipsSql`, `weaponsSql`, `weeksSql`), each
  returning `{ sql, values }`. The unscoped form was verified byte-identical to the original five
  legacy constants via a throwaway diff script (all five MATCH). `legacy-export.ts` consumes the
  unscoped builders; the `ScriptedLegacyExportPool` routing substrings are preserved.
- **Task 3 (TDD):** `parity-sql.test.ts` (16 cases) asserting load-bearing routing substrings
  survive, scoped builders add exactly one `$1` placeholder + one value, no outer-SELECT wrapper
  is introduced, and the scope id is never string-concatenated (SQL-injection guard).
- **Task 4:** Added the `export` keyword to `mapWeapons`/`mapWeeks`/`mapRelationships`/
  `playerStats`/`squadStats` (legacy-export.ts) and `weekExport`/`sortRelationships`/`sortWeapons`/
  `sortWeeks` (legacy-public-export.ts). Bodies, signatures, order, and names unchanged
  (`relationshipsForPlayer` deliberately left private).

## Critical Invariant Held

Unscoped builder output is byte-identical to the prior constants (verified mechanically). All
three byte-identical guards (`legacy-export.test.ts`, `legacy-public-export.test.ts`,
`export-legacy-public-stats.test.ts`) plus the two new tests are green. Full unit suite:
**57 files / 288 tests passing.** `typecheck`, `eslint`, and `prettier --check` clean on all
touched files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint] Re-export style for parity formulas**
- **Found during:** Task 1
- **Issue:** `import { ... } from` + bare `export { ... }` tripped `unicorn/prefer-export-from`.
- **Fix:** Split into `import { ... }` (for internal use by playerExport/weekExport/perGame) plus a
  separate `export { ... } from "../parity-formulas.js"` re-export.
- **Files:** src/modules/statistics/export/legacy-public-export.ts
- **Commit:** 380a1b9

**2. [Rule 3 - Lint] Import group ordering in legacy-export.ts**
- **Found during:** Task 2
- **Fix:** `eslint --fix` inserted the required blank line between import groups.
- **Commit:** fcd4ea8

**3. [Rule 1 - Lint] parity-sql.test.ts: unicode regex flag + magic number**
- **Found during:** Task 3
- **Fix:** Added `u` flag to the `$1` match regex; extracted `HEADER_PREFIX_LENGTH = 40` constant.
  Also corrected the "no outer wrapper" assertion (squadStatsSql legitimately contains `from (`,
  so the check now compares the preserved leading SQL header instead).
- **Commit:** 426036a

**4. [Rule 1 - Formatting] Prettier line-width reflow on exported signatures**
- **Found during:** Task 4
- **Issue:** Prepending `export ` pushed `mapRelationships` and `sortWeapons` signatures over the
  print width.
- **Fix:** Let Prettier reflow the signature across lines. Bodies untouched; guards stay green.
- **Files:** legacy-export.ts, legacy-public-export.ts
- **Commit:** 81da9b1

## Worktree Note

This agent's branch (`worktree-agent-af250237195fc6787`) was created before the phase-15 planning
docs were committed to master, so the plan/context were read from the main repo working tree. The
phase directory was created locally to host this SUMMARY. STATE.md / ROADMAP.md were intentionally
not modified (orchestrator owns those writes).

## Known Stubs

None.

## Threat Flags

None — refactor + `export` only; no new routes, trust boundaries, or runtime dependencies. The
scoped builders use `$1` parameterization exclusively (T-15-01 mitigated; verified by test).

## Self-Check: PASSED
