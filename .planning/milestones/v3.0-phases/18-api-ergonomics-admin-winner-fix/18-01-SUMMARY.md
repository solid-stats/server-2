---
phase: 18-api-ergonomics-admin-winner-fix
plan: 01
subsystem: api
tags: [bounty, leaderboards, public-stats, typebox, openapi, fastify]

# Dependency graph
requires:
  - phase: prior public-stats work
    provides: listBounty/mapBounty mapper, BountySummaryResponse schema, bounty_points.inputs jsonb computed upstream
provides:
  - "BountySummaryResponse.breakdown aggregate (countedKills, victimEffectiveness, squadEffectiveness, baseScore) on /stats/bounty and /stats/leaderboards"
  - "BountyRow.inputs jsonb boundary read + defensive null/old-version handling at the mapper"
  - "mapBounty + BountyRow exported for pure-mapper unit tests"
affects: [18-04 leak-guard sweep extension, web bounty leaderboard UX]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive an additive aggregate from stored jsonb at the mapper boundary (no recomputation)"
    - "Widen untrusted jsonb version field to `number` so the defensive version guard stays live (not statically dead)"
    - "Round summed float factors to the upstream formula scale to avoid IEEE-754 leak into the public body"

key-files:
  created:
    - src/modules/public-stats/repository.test.ts
  modified:
    - src/modules/public-stats/repository.ts
    - src/modules/public-stats/routes/models.ts
    - src/modules/public-stats/routes/schemas.ts
    - src/modules/public-stats/routes/tests/fixtures.ts
    - openapi/server-2.openapi.json

key-decisions:
  - "Discriminate counted-kill events on `player_factor` presence, not `event_type === 'kill'` (the excluded arm can also carry event_type 'kill' for unknown_kill)"
  - "Type BountyRow.inputs with a local widened BountyInputsRow (version: number) so the version!==1 guard is not statically dead code"
  - "Round summed victim/squad effectiveness to 2 decimals (formula ROUND_SCALE=100) to keep the public body clean"
  - "Export mapBounty + BountyRow to unit-test the pure mapper directly (mirrors replay-mapper.ts test style)"

patterns-established:
  - "Pure-mapper unit test: export the mapper + its row type, construct row fixtures directly, no DB"
  - "jsonb-boundary defensiveness: null/old-version inputs -> null aggregate, mirroring mapCommanderPlayer"

requirements-completed: [API-02]

# Metrics
duration: ~8min
completed: 2026-06-07
---

# Phase 18 Plan 01: Bounty Breakdown Surface Summary

**Bounty and leaderboard responses now carry an additive breakdown aggregate (countedKills, summed victim/squad effectiveness, baseScore) derived from the stored bounty_points.inputs jsonb at the mapBounty boundary, with defensive null handling for legacy rows.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-07T23:05:00Z
- **Completed:** 2026-06-07T23:12:00Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified) + regenerated OpenAPI contract

## Accomplishments

- `BountyRow.inputs` reads the previously-discarded `bounty_points.inputs` jsonb; `listBounty` now selects `bounty.inputs` (flows to `/stats/leaderboards` for free via the existing `getLeaderboards` -> `listBounty` reuse).
- `mapBounty` folds an aggregate `breakdown` (countedKills / victimEffectiveness / squadEffectiveness / baseScore) — no recomputation, no formula change, no victim ids.
- Defensive: rows whose `inputs` is null or `version !== 1` return `breakdown: null` with no crash.
- `BountySummaryResponse.breakdown` nullable union added to the OpenAPI contract with a D-02 description (rotation context = per-rotation `rotationId`, no rotation multiplier); auto-propagates to the leaderboard shape.

## Task Commits

1. **Task 1 (RED): failing breakdown mapper tests** - `1275dc8` (test)
2. **Task 1 (GREEN): fold bounty breakdown in mapBounty** - `5bd5bd8` (feat)
3. **Task 2: breakdown union on BountySummaryResponse schema** - `f53a038` (feat)

**Plan metadata:** see final docs commit.

## Files Created/Modified

- `src/modules/public-stats/repository.test.ts` - 4 pure-mapper unit tests (counted-kill fold, null inputs, old version, excluded-arm ignored).
- `src/modules/public-stats/repository.ts` - `BountyInputsRow` boundary type; `BountyRow.inputs`; `bounty.inputs` in `listBounty` SELECT; `mapBounty` folds breakdown via `foldBountyBreakdown`; `mapBounty` + `BountyRow` exported.
- `src/modules/public-stats/routes/models.ts` - `BountyBreakdown` interface + `BountySummary.breakdown` field.
- `src/modules/public-stats/routes/schemas.ts` - `BountySummaryResponse.breakdown` nullable union with OpenAPI description.
- `src/modules/public-stats/routes/tests/fixtures.ts` - bounty fixture extended with a populated `breakdown`.
- `openapi/server-2.openapi.json` - regenerated contract (breakdown on bounty + leaderboard shapes).

## Decisions Made

- Discriminate counted-kill events on `"player_factor" in event` rather than `event_type === "kill"`: the excluded-event arm's `event_type` is the wider `BountyEventType` union and can also be `"kill"`, so `event_type` does not narrow the discriminated union. (See repository.ts comment.)
- `BountyRow.inputs` typed via a local `BountyInputsRow` that widens `version` to `number`. Importing the source-of-truth `BountyPointRow["inputs"]` (where `version` is literal `1`) made the `version !== 1` defensive guard statically dead (lint `no-unnecessary-condition`). Widening keeps the runtime guard meaningful for untrusted legacy jsonb.
- Summed `victimEffectiveness` / `squadEffectiveness` are rounded to 2 decimals (the upstream formula module's `ROUND_SCALE = 100`) so IEEE-754 accumulation noise (e.g. `0.1 + 0.2`) never leaks into the public API body.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Round summed effectiveness factors to avoid float noise in the public body**
- **Found during:** Task 1 (GREEN)
- **Issue:** Naive summation produced `0.30000000000000004` for `0.1 + 0.2`, which would leak IEEE-754 noise into the public bounty response (a trust surface) and broke the deterministic test assertion.
- **Fix:** Added `roundBreakdownFactor` (scale 100, matching the upstream `bounty.ts` `ROUND_SCALE`) applied to both summed factors.
- **Files modified:** src/modules/public-stats/repository.ts
- **Verification:** `pnpm exec vitest run src/modules/public-stats/repository.test.ts` (4/4 green).
- **Committed in:** `5bd5bd8`

**2. [Rule 3 - Blocking] Widen inputs.version type + use `player_factor` discriminator to satisfy strict typing/lint**
- **Found during:** Task 1 (GREEN)
- **Issue:** Importing the literal-`1` `BountyPointRow["inputs"]` made `version !== 1` static dead code (lint error) and `event_type === "kill"` failed to narrow the union (TS2339 on `player_factor`/`squad_factor`).
- **Fix:** Local `BountyInputsRow` with `version: number`; discriminate via `"player_factor" in event`.
- **Files modified:** src/modules/public-stats/repository.ts
- **Verification:** `pnpm run typecheck` + `pnpm exec eslint` clean.
- **Committed in:** `5bd5bd8`

**3. [Rule 3 - Blocking] Extend bounty test fixture with breakdown field**
- **Found during:** Task 1 (GREEN)
- **Issue:** Adding the required `breakdown` field to `BountySummary` broke the `bountySummary` test fixture (TS2741).
- **Fix:** Added a representative populated `breakdown` to the fixture.
- **Files modified:** src/modules/public-stats/routes/tests/fixtures.ts
- **Verification:** `pnpm run typecheck` + full unit suite (519/519) green.
- **Committed in:** `5bd5bd8`

**4. [Rule 3 - Blocking] Regenerate stale OpenAPI contract**
- **Found during:** Task 2
- **Issue:** `pnpm run openapi:check` reported the committed `openapi/server-2.openapi.json` stale after the schema change.
- **Fix:** Ran `pnpm run openapi:export` and committed the regenerated contract.
- **Files modified:** openapi/server-2.openapi.json
- **Verification:** `pnpm run openapi:check` clean; generated `/tmp/server-2-openapi.d.ts` contains `breakdown` (4 occurrences).
- **Committed in:** `f53a038`

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** All auto-fixes were necessary for correctness, strict-typing/lint compliance, and contract regeneration. No scope creep — every change stayed within the two planned tasks.

## Threat Model Compliance

- **T-18-01 (Information Disclosure):** breakdown emits only `countedKills`/`victimEffectiveness`/`squadEffectiveness`/`baseScore` numbers — no `victim_player_id`/`victim_squad_id`, no Steam64. Asserted by the test fixtures and the four-numeric-key schema.
- **T-18-02 (DoS/Tampering on legacy rows):** `inputs?.version !== 1` guard returns `null`; single bounded fold over stored events, no recursion.
- **T-18-03 (Steam64 leak):** breakdown carries only numbers/counts; the leak-guard sweep extension is owned by plan 18-04 (noted, out of scope here).

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- API-02 satisfied: breakdown is live on bounty + leaderboard contracts.
- Plan 18-04 should extend the Steam64 leak-guard sweep over `/stats/bounty` + `/stats/leaderboards` bodies (per T-18-03).
- No new DB columns, no migration, no new query, no new dependency.

## Self-Check: PASSED

---
*Phase: 18-api-ergonomics-admin-winner-fix*
*Completed: 2026-06-07*
