---
phase: 18-api-ergonomics-admin-winner-fix
plan: 05
subsystem: testing
tags: [vitest, fastify, steam-leak-guard, moderation-workflow, admin-rotations, jsonb]

# Dependency graph
requires:
  - phase: 18-01
    provides: bounty breakdown + regenerated OpenAPI contract surface
  - phase: 18-02
    provides: commander-side `side` filter + regenerated contract
  - phase: 18-04
    provides: /admin/rotations write routes (POST/PUT/DELETE) to sweep
provides:
  - Verify-and-freeze integration coverage for the legacy_winner_fix moderator workflow (role guard, jsonb outcome mutation, downstream recalc, audit row)
  - Steam64 leak-guard sweep extended to all write-route bodies added this phase (winner-fix workflow + /admin/rotations POST/PUT/DELETE)
affects: [19-contract-freeze, moderation, admin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write-route leak-guard sweep: DB-free harness (in-memory admin + request repos) + fake Steam callback login, asserting expectNoSteam64 over response.json() AND response.payload for POST/PUT/DELETE bodies"
    - "Verify-and-freeze: lock existing behavior with tests; assert ZERO source diff on the frozen files instead of rebuilding"

key-files:
  created: []
  modified:
    - src/modules/requests/routes/workflows/tests/index.test.ts
    - src/modules/requests/routes/workflow-applier.test.ts
    - src/test/integration/steamid-leak-guard.test.ts

key-decisions:
  - "Task 1 (role guard + jsonb outcome mutation freeze) was already committed in 87ed069 with all four required assertions present (role guard 401/403, status:known + winner_side mutation, recalc invocation, audit row via listWorkflowActions); confirmed rather than duplicated."
  - "Write-route leak sweep is DB-free: reuses the in-memory admin/request repositories buildApp() defaults to, plus a fake Steam OpenID callback to mint authenticated admin/moderator sessions — so it runs in the unit lane without live Postgres."
  - "endsAt: null retained (schema is Type.Union([date-time, Type.Null()])); added file-level eslint-disable unicorn/no-null mirroring the established admin-test convention rather than coercing to undefined."

patterns-established:
  - "Write-route Steam64 sweep block: authenticate via fake Steam callback, inject POST/PUT/DELETE, assert expectNoSteam64 on json() + payload (204 swept over the empty payload string)."

requirements-completed: [HIST-04, API-02, API-03, API-04]

# Metrics
duration: 12min
completed: 2026-06-08
---

# Phase 18 Plan 05: Winner-Fix Verify-and-Freeze + Write-Route Leak-Guard Summary

**Froze the legacy_winner_fix moderator workflow (role guard, jsonb outcome flip, downstream recalc, audit row) with passing integration tests and extended the Steam64 leak-guard to sweep every write-route body added this phase — winner-fix workflow + /admin/rotations POST/PUT/DELETE — with zero source changes to the frozen workflow files.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-08
- **Completed:** 2026-06-08
- **Tasks:** 2
- **Files modified:** 3 (1 modified this session; 2 confirmed already committed)

## Accomplishments
- Confirmed Task 1 verify-and-freeze coverage for the winner-fix workflow: negative-authz (unauthenticated → 401, authenticated-no-role → 403), the exact `jsonb_set` outcome mutation (`side_facts.outcome` → `status:"known"` + supplied `winner_side`), downstream `recalculateCommanderSideStatsForParserResult` invocation, and a workflow-action audit row (via `listWorkflowActions`).
- Extended `steamid-leak-guard.test.ts` with a new write-route sweep block covering POST/PUT/DELETE `/admin/rotations` and the `legacy_winner_fix` workflow response — asserting `expectNoSteam64` over both `response.json()` and `response.payload`, with the 204 DELETE swept over its empty payload.
- Verified the source-freeze invariant: `workflows.ts` and `workflow-applier.ts` show ZERO diff across the whole plan.
- Confirmed the full phase surface is present in the committed OpenAPI contract: `/admin/rotations` + `/admin/rotations/{id}`, the winner-fix workflow route, the commander-sides `side` query param, and the bounty `breakdown`/`countedKills` fields.

## Task Commits

1. **Task 1: Verify-and-freeze the legacy_winner_fix workflow (role guard + outcome + recalc + audit)** — `87ed069` (test) — already committed prior to this session; all four required assertions confirmed present, no duplication added.
2. **Task 2: Extend the Steam64 leak-guard to winner-fix + admin write-route bodies** — `f18418e` (test)

_Note: Task 1 was a TDD verify-and-freeze task whose freeze tests had already landed in `87ed069`; this session validated completeness and proceeded to Task 2._

## Files Created/Modified
- `src/modules/requests/routes/workflows/tests/index.test.ts` — role-guard freeze test (non-admin/non-moderator → 401/403) + audit-row assertion via `listWorkflowActions` (committed `87ed069`).
- `src/modules/requests/routes/workflow-applier.test.ts` — jsonb outcome-mutation freeze test (status:known + winner_side, scoped to current row by replay_id) + recalc invocation (committed `87ed069`).
- `src/test/integration/steamid-leak-guard.test.ts` — new "write-route body sweep (T-18-19)" describe block sweeping `/admin/rotations` POST/PUT/DELETE bodies and the winner-fix workflow body with `expectNoSteam64`; STEAM64_PATTERN and negative self-tests left unchanged.

## Decisions Made
- Task 1 was already satisfied by `87ed069`; verified the four success-criteria assertions exist and are green rather than re-adding them (avoids duplication, per the plan's "grep first, add only what's missing" instruction).
- Built a DB-free harness for the write-route sweep so it runs in the unit lane (no live Postgres dependency), reusing `buildApp`'s default in-memory repos and the fake Steam callback login pattern from the workflow test utilities.
- Kept `endsAt: null` (schema-correct) and added a file-level `eslint-disable unicorn/no-null` matching the existing admin-test convention; replaced two unnecessary `as { id: string }` assertions with typed locals to satisfy `@typescript-eslint/no-unnecessary-type-assertion`.

## Deviations from Plan

None - plan executed as written. Task 1's freeze tests were pre-existing (committed `87ed069`) and confirmed complete; Task 2 added the write-route sweep as specified. No source/route/schema files were changed (verify-and-freeze honored).

## Issues Encountered

- **Leftover unused imports in the working tree:** `steamid-leak-guard.test.ts` started with two uncommitted, unused imports (`InMemoryAuthUserRepository`/`InMemorySessionStore` partial, `FakeRequestSteamAdapter`) from a prior incomplete Task 2 attempt. These are now used by the new sweep block; the completed import set was committed in `f18418e`.
- **Minor lint fixups:** `unicorn/no-null` (resolved via the established file-level disable) and two unnecessary type assertions (resolved via typed locals). All within the touched test file; no production code affected.

## Environment Limitation (NOT a code failure)

The plan's final task calls `pnpm run verify`, which includes `test:integration` and `test:coverage` against live PostgreSQL/RabbitMQ/S3. This environment has no live services (port 15432 refused), a pre-existing limitation documented across 18-01..18-04 SUMMARYs. What was run and is GREEN:

- `pnpm run typecheck` — PASS
- `pnpm test` (unit suite) — PASS (71 files, 544 tests)
- `pnpm exec eslint src/` — PASS (zero errors in `src/`; the 111 `pnpm run lint` errors are all pre-existing parse errors in `.agents/hooks/*` infra files outside tsconfig — out of scope)
- `pnpm exec prettier --check` on the changed file — PASS (after `--write`)
- `pnpm run openapi:check` — PASS (no contract drift; full phase surface present)
- `pnpm exec vitest run src/test/integration/steamid-leak-guard.test.ts` — 24 passed (incl. 2 new write-route sweeps), 7 skipped; the 4 real-pg blocks fail ONLY with `ECONNREFUSED 127.0.0.1:15432` (no DB), not assertion failures.
- `pnpm exec vitest run src/modules/requests/routes/workflows ...workflow-applier.test.ts` — PASS (11 tests)

Integration/coverage gates that require DB/queue/S3 could not be exercised locally and were not fabricated. The new write-route leak sweep itself is DB-free and passes; the DB-dependent real-pg sweeps remain unchanged and will run in CI where services are available.

## Next Phase Readiness
- HIST-04 winner-fix is verified-and-frozen; API-02/03/04 write surfaces are leak-swept. The full Phase 18 surface is present in the OpenAPI contract and ready for the Phase 19 contract freeze.
- Concern: the full `pnpm run verify` (integration + coverage) must be re-run in an environment with live PostgreSQL/RabbitMQ/S3 (CI) to close the integration/coverage gates before the Phase 19 freeze.

## Self-Check: PASSED

- FOUND: `.planning/phases/18-api-ergonomics-admin-winner-fix/18-05-SUMMARY.md`
- FOUND: `src/test/integration/steamid-leak-guard.test.ts`
- FOUND commit: `87ed069` (Task 1 freeze tests)
- FOUND commit: `f18418e` (Task 2 leak-guard extension)

---
*Phase: 18-api-ergonomics-admin-winner-fix*
*Completed: 2026-06-08*
