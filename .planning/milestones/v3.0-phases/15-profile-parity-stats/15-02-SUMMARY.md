---
phase: 15-profile-parity-stats
plan: "02"
subsystem: public-stats/parity-routes
tags: [parity, player-profile, http-routes, openapi, integration-tests]
dependency_graph:
  requires: ["15-01"]
  provides: [parity-sub-resource-routes, extended-player-stats]
  affects: [openapi/server-2.openapi.json, web-frontend-types]
tech_stack:
  added: []
  patterns: [scoped-sql-builder, mapper-reuse, tdd-red-green, steam64-leak-guard]
key_files:
  created:
    - src/modules/public-stats/tests/schemas.test.ts
  modified:
    - src/modules/public-stats/routes/schemas.ts
    - src/modules/public-stats/routes/models.ts
    - src/modules/public-stats/routes/empty-read-model.ts
    - src/modules/public-stats/repository.ts
    - src/modules/public-stats/routes/routes.ts
    - src/modules/public-stats/tests/postgres.test.ts
    - openapi/server-2.openapi.json
decisions:
  - "Player existence check via `select exists(...)` before all parity queries — prevents empty arrays on unknown player (returns null → 404)"
  - "sortWeeks() already applies weekExport() internally — no double-application needed in repository layer"
  - "getPlayerVehicles runs playerStatsSql + weaponsSql in parallel (Promise.all) for single round-trip"
  - "PlayerStatsPayload.totalPlayedGames = replayCount (from player_stats.stats->>'replay_count')"
  - "Relationship targets exposed as {player: {id, displayName}, count} — no Steam64, no name-only raw strings"
metrics:
  duration: "~2h (including compaction break)"
  completed: "2026-06-06"
  tasks: 3
  files: 7
---

# Phase 15 Plan 02: Parity Sub-Resource Routes Summary

4 player parity endpoints (weapons/vehicles/relationships/weekly) wired to per-entity-scoped SQL builders from Plan 01, reusing existing mappers/formulas for byte-identical output; PlayerStatsResponse extended with kdRatio/totalScore/totalPlayedGames.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 (RED) | TypeBox schemas + ReadModel interface + empty-read-model stubs + fixture updates | c4b6746 |
| 2 (GREEN) | PgPublicStatsReadModel parity methods (getPlayerWeapons/Vehicles/Relationships/Weekly) | b25b2bc |
| 3 | Routes registration + integration tests + Steam64 leak guard + OpenAPI regeneration | 1ba5d65 |

## What Was Built

### New HTTP Endpoints (registered in `registerPlayerRoutes`)
- `GET /stats/players/:id/weapons` — `{ firearms: [{name, kills}], vehicles: [{name, kills}] }` sorted by kills desc then name
- `GET /stats/players/:id/vehicles` — `{ killsFromVehicle, vehicleKills, killsFromVehicleCoef, vehicles }` with coef from parity formula
- `GET /stats/players/:id/relationships` — `{ killed, killers, teamkilled, teamkillers }` each as `[{player:{id,displayName}, count}]`
- `GET /stats/players/:id/weekly` — `{ weeks: [PlayerWeekBucket] }` with kdRatio/score/coef per week
- All endpoints return 404 with fixed string `"player not found"` for unknown players

### Extended PlayerStatsResponse
`PlayerStatsResponse` now includes `kdRatio`, `totalScore`, `totalPlayedGames` alongside existing fields.

### Implementation Details
- `getPlayerWeapons`: existence check → `weaponsSql({scopeId})` → `mapWeapons` → `sortWeapons` → firearms/vehicles split
- `getPlayerVehicles`: existence check → `Promise.all([playerStatsSql, weaponsSql])` → `mapPlayerStats` for counters → `mapWeapons` for list → `killsFromVehicleCoef` formula
- `getPlayerRelationships`: existence check → `relationshipsSql({scopeId})` → `mapRelationships` → `sortRelationships` per list → `{player:{id,displayName}, count}` mapping
- `getPlayerWeekly`: existence check → `weeksSql({scopeId})` → `mapWeeks` → `sortWeeks` (internally applies `weekExport`) → map LegacyWeekExport fields to PlayerWeekBucket

## Integration Tests Added

`seedParityEvents()` helper seeds `parse_jobs` + `parser_results` + `parser_events` (player_counter, kill, destroyed_vehicle events) for Alpha/Bravo players, enabling real-PostgreSQL integration testing of all parity methods.

Test cases cover:
- Correct weapon sorting (Rifle×2 > Pistol×1 in firearms)
- Vehicle counters (killsFromVehicle=1, vehicleKills=2, coef≈0.333)
- Relationship lists (Alpha killed Bravo 3×, Bravo killed Alpha 1×)
- Weekly bucket formulas (kdRatio, totalPlayedGames, killsFromVehicleCoef)
- PARITY-05: `getPlayer` returns stats.kdRatio/totalScore/totalPlayedGames
- Steam64 leak guard: regex `/7656119\d{10}/` finds 0 matches in all parity response bodies + 404 body

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong parent-directory import path (`../../statistics/`)**
- **Found during:** Task 2 implementation
- **Issue:** `../../statistics/` from `src/modules/public-stats/repository.ts` resolves to non-existent `src/statistics/`; correct path is `../statistics/`
- **Fix:** Changed all 4 parity import paths to `../statistics/`
- **Files modified:** `src/modules/public-stats/repository.ts`
- **Commit:** b25b2bc

**2. [Rule 1 - Bug] `sortWeeks()` double-application of `weekExport`**
- **Found during:** Task 2 implementation
- **Issue:** `sortWeeks()` already internally calls `weekExport()` on each week; calling it again in repository would double-compute formulas and fail typecheck
- **Fix:** Removed extra `weekExport()` call; mapped `LegacyWeekExport` fields directly
- **Files modified:** `src/modules/public-stats/repository.ts`
- **Commit:** b25b2bc

**3. [Rule 1 - Bug] `prefer-destructuring` ESLint violations**
- **Found during:** Task 2 ESLint pass
- **Issue:** `const entry = mapped[0]` → must use `const [entry] = mapped`
- **Fix:** Destructured all first-element accesses
- **Files modified:** `src/modules/public-stats/repository.ts`
- **Commit:** b25b2bc

**4. [Rule 2 - Security] Player existence check before empty array return**
- **Found during:** Task 2 design — empty parity results (no events) vs. unknown player (no row)**
- **Issue:** Without existence check, unknown players would return `{ firearms: [], vehicles: [] }` instead of null → 404
- **Fix:** Added `private playerExists(id)` method called before each parity query
- **Files modified:** `src/modules/public-stats/repository.ts`
- **Commit:** b25b2bc

**5. [Rule 1 - Bug] Worktree path drift — edits landed in main repo**
- **Found during:** Task 1 initial implementation
- **Issue:** Working directory was main repo (`/server-2`) not worktree; edits went to wrong location
- **Fix:** Copied changed files to worktree, restored main repo via `git checkout --`
- **Files modified:** All Task 1 files
- **Commit:** c4b6746

## Known Stubs

None — all 4 parity methods are fully wired to real PostgreSQL via scoped SQL builders.

## Threat Flags

None — new endpoints expose no new trust boundaries. All parity responses:
- Contain no Steam64 (only masked `{ id: uuid, displayName: string }` player refs)
- Return fixed-string 404 bodies (no id echoing)
- Are read-only (no mutations)

## Self-Check: PASSED

Files exist:
- src/modules/public-stats/routes/schemas.ts: FOUND
- src/modules/public-stats/routes/models.ts: FOUND
- src/modules/public-stats/repository.ts: FOUND
- src/modules/public-stats/routes/routes.ts: FOUND
- src/modules/public-stats/tests/postgres.test.ts: FOUND
- openapi/server-2.openapi.json: FOUND

Commits exist:
- c4b6746 (Task 1 RED): FOUND
- b25b2bc (Task 2 GREEN): FOUND
- 1ba5d65 (Task 3 routes+tests+OpenAPI): FOUND

Unit tests: 297 passed, 0 failed.
