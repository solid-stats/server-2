---
phase: 18-api-ergonomics-admin-winner-fix
plan: 02
subsystem: api
tags: [public-stats, commander-sides, filter, typebox, openapi, sql, tdd]

# Dependency graph
requires:
  - phase: 18-01
    provides: shared public-stats files (repository.ts, schemas.ts, models.ts, repository.test.ts) landed; mapBounty pure-mapper test pattern
  - phase: prior public-stats work
    provides: listCommanderSides + rotationWhere sqlWith combinator, CommanderSideResponse schema, unknownOutcomes already exposed
provides:
  - "GET /stats/commander-sides accepts an optional ?side=<value> filter, AND-composed with the existing ?rotationId"
  - "listCommanderSides composes a parameter-bound commander.side = $n::text predicate via the rotationWhere sqlWith combinator"
  - "CommanderSideQuery schema + CommanderSideQueryType export; RotationFilters.side optional field; commanderSideFilters builder"
affects: [18-04 leak-guard sweep extension, web commander-side filter UX]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-endpoint querystring schema via Type.Intersect([RotationQuery, Type.Object({ extra })]) instead of mutating the shared RotationQuery"
    - "Compose an optional SQL predicate as the next $n using rotationWhere.sqlWith(extra) + [...values, extra] (parameter-bound, never interpolated)"
    - "SQL-composition unit test via a pool stub that captures { sql, values } — asserts predicate text + ordered bindings without a live DB"

key-files:
  created: []
  modified:
    - src/modules/public-stats/routes/schemas.ts
    - src/modules/public-stats/routes/models.ts
    - src/modules/public-stats/routes/filters.ts
    - src/modules/public-stats/repository.ts
    - src/modules/public-stats/routes/routes.ts
    - src/modules/public-stats/repository.test.ts
    - openapi/server-2.openapi.json

key-decisions:
  - "CommanderSideQuery = Type.Intersect([RotationQuery, Type.Object({ side })]) — the shared RotationQuery is left unmutated so rotationFilters() and every other rotation consumer keep their narrow contract"
  - "side predicate composed via condition.sqlWith(`commander.side = $n::text`) with n = condition.values.length + 1, value appended to the bound array — so it auto-numbers as $1 (side-only) or $2 (after rotationId)"
  - "unknownOutcomes verified-not-duplicated: it is already CommanderSideRow.unknown_outcomes -> CommanderSideResponse.unknownOutcomes; confirmed present in the regenerated contract (required field), no schema change"
  - "SQL-composition tests use a pool stub capturing { sql, values } rather than the pure-mapper style — listCommanderSides has no extractable pure mapper; the predicate composition is the behavior under test"

patterns-established:
  - "Pool-stub SQL capture test: cast a { query } object to Pool, push { sql, values } per call, assert predicate substrings + ordered bindings"

requirements-completed: [API-03]

# Metrics
duration: ~6min
completed: 2026-06-07
---

# Phase 18 Plan 02: Commander-Side `side` Filter Summary

**`GET /stats/commander-sides` now accepts an optional `?side=<value>` filter that AND-composes with the existing `?rotationId`, built as a parameter-bound `commander.side = $n::text` predicate via the `rotationWhere.sqlWith` combinator; the explicit `unknownOutcomes` exposure was verified (not duplicated) and the ordering / no-pagination pattern is unchanged.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-07T16:26:57Z
- **Completed:** 2026-06-07T16:32:00Z
- **Tasks:** 2
- **Files modified:** 7 (0 created, 6 source modified + regenerated OpenAPI contract)

## Accomplishments

- **Schema (API-03):** `CommanderSideQuery` (`RotationQuery` intersect optional `side: Type.String({ minLength: 1 })`) + exported `CommanderSideQueryType`. The shared `RotationQuery` is untouched.
- **Filter layer:** `RotationFilters.side?: string` added; `commanderSideFilters(query)` builder uses the exact `...(query.side === undefined ? {} : { side: query.side })` conditional-spread idiom on top of `rotationFilters`.
- **Repository:** `listCommanderSides` composes `commander.side = $n::text` only when `filters.side !== undefined`, via `condition.sqlWith(...)` with the value appended to the bound array (`$1` side-only, `$2` after `rotationId`). When `side` is absent, the base clause/values are byte-identical to before.
- **Route:** `/stats/commander-sides` handler switched to `CommanderSideQuery` schema + `CommanderSideQueryType` generic and now passes `commanderSideFilters(request.query)`.
- **Tests (TDD):** 4 SQL-composition unit tests — empty (no predicate, zero values), side-only (`where commander.side = $1::text`, `["west"]`), rotation+side (`where commander.rotation_id = $1 and commander.side = $2::text`, `[rotationId, "east"]`), and rotation-only (ordering + no side predicate). Ordering clause asserted in every case.
- **Contract:** regenerated `openapi/server-2.openapi.json` — commander-sides query params now `[rotationId, side]`; `unknownOutcomes` still a required response field.

## Task Commits

1. **Task 1: schema + filter builder + RotationFilters.side** - `a9c66f2` (feat)
2. **Task 2 (TDD): compose commander.side predicate + wire route + tests + contract** - `17ead59` (feat)

**Plan metadata:** see final docs commit.

## Files Created/Modified

- `src/modules/public-stats/routes/schemas.ts` - `CommanderSideQuery` schema + `CommanderSideQueryType` Static export.
- `src/modules/public-stats/routes/models.ts` - `RotationFilters.side?: string`.
- `src/modules/public-stats/routes/filters.ts` - `commanderSideFilters` builder + `CommanderSideQueryType` import.
- `src/modules/public-stats/repository.ts` - `listCommanderSides` composes the parameter-bound side predicate via `sqlWith`.
- `src/modules/public-stats/routes/routes.ts` - commander-sides handler uses `CommanderSideQuery` + `commanderSideFilters`.
- `src/modules/public-stats/repository.test.ts` - 4 SQL-composition unit tests (pool-stub capture).
- `openapi/server-2.openapi.json` - regenerated contract (optional `side` query param).

## Decisions Made

- **Intersect, don't mutate:** `CommanderSideQuery` is a new `Type.Intersect([RotationQuery, ...])` so the shared `RotationQuery` keeps its narrow `{ rotationId? }` contract for `rotationFilters` and all other rotation consumers (per the must-have: RotationQuery not mutated, rotationFilters still returns only rotationId).
- **Auto-numbered `$n`:** the side predicate index is `condition.values.length + 1`, so it is `$1` when there is no rotation and `$2` after rotationId — no hardcoded position, no reordering of the existing rotation binding.
- **Pool-stub SQL capture over pure-mapper:** unlike `mapBounty`, the side behavior lives in SQL string composition, not a pure mapper. The test casts a `{ query }` object to `Pool`, captures `{ sql, values }`, and asserts predicate substrings + ordered bindings — deterministic, no live DB.
- **unknownOutcomes verify-only:** confirmed already exposed end-to-end (row column -> response field, required in the regenerated contract); no field added or changed (per D-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerate stale OpenAPI contract**
- **Found during:** Task 2 verification
- **Issue:** `pnpm run openapi:check` reported `openapi/server-2.openapi.json` stale after adding the `side` query param.
- **Fix:** Ran `pnpm run openapi:export`; committed the regenerated contract.
- **Files modified:** openapi/server-2.openapi.json
- **Verification:** `pnpm run openapi:check` clean; contract query params now `[rotationId, side]`, `unknownOutcomes` still required.
- **Committed in:** `17ead59`

**2. [Rule 3 - Blocking] Fix test-file import order for strict ESLint**
- **Found during:** Task 2 lint pass
- **Issue:** `import type { Pool } from "pg"` placed before the relative type import violated `import-x/order`.
- **Fix:** Moved the `pg` type import below `./routes/models.js`.
- **Files modified:** src/modules/public-stats/repository.test.ts
- **Verification:** `pnpm exec eslint` clean on all changed files.
- **Committed in:** `17ead59`

---

**Total deviations:** 2 auto-fixed (both blocking: contract regen + lint ordering)
**Impact on plan:** Both were mandatory to pass the plan's own verification (`openapi:check`) and the repo's strict lint gate. No scope change.

## Threat Model Compliance

- **T-18-04 (SQL injection on side):** the `side` value is bound as `$n::text` via the `sqlWith` combinator — never string-interpolated — and validated at the schema layer as `Type.String({ minLength: 1 })`. Asserted by the side-only and rotation+side tests (predicate text contains `$1`/`$2`, value carried in the bound array).
- **T-18-05 (Information disclosure):** filtering narrows the result set; commander-side rows expose only already-public aggregate counts + the existing masked/omitted player reference (`mapCommanderPlayer` unchanged). No Steam64 — the leak-guard sweep extension is owned by 18-04.
- **T-18-06 (DoS, accepted):** no pagination added; the side filter narrows rather than widens the set, so it cannot increase result size (D-03 deferral honored).

## Known Stubs

None. The `side` filter is fully wired schema -> filter builder -> route -> SQL; no placeholder or empty-data path was introduced.

## Issues Encountered

- 9 integration/postgres test files (`*/tests/postgres.test.ts`, `src/test/integration/*`) fail/skip with `ECONNREFUSED 127.0.0.1:15432` — no local PostgreSQL/RabbitMQ/S3 in this environment. Pre-existing, unrelated to this change (out of scope per the executor SCOPE BOUNDARY). The plan's verification gates (`repository.test.ts` unit, `typecheck`, `openapi:check`) all pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- API-03 satisfied: commander-side stats filterable by rotation AND side; explicit unknown outcomes verified.
- Plan 18-04 should extend the Steam64 leak-guard sweep over `/stats/commander-sides` (per T-18-05).
- No new DB columns, no migration, no new query method, no new dependency.

## Self-Check: PASSED

---
*Phase: 18-api-ergonomics-admin-winner-fix*
*Completed: 2026-06-07*
