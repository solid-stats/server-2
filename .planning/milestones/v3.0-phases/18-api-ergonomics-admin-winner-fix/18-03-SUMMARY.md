---
phase: 18-api-ergonomics-admin-winner-fix
plan: 03
subsystem: database
tags: [admin, rotations, postgres, pg, slug, crud, transactional]

# Dependency graph
requires:
  - phase: 16-slug-addressing
    provides: slug_base() SQL function + uq_rotations_slug partial-unique index
  - phase: 01-v1-domain-schema
    provides: rotations table (name UNIQUE, ends_at>starts_at CHECK) + FKs from replays/commander_side_stats/bounty_points
provides:
  - "AdminRouteOptions contract (auth + rotations bundle) for the admin write module"
  - "AdminRotationRepository contract with discriminated create/update/delete results"
  - "PgAdminRotationRepository: transactional, Pool-injected, slug-deriving CRUD with empty-rotation delete guard"
affects: [18-04-admin-rotation-routes, admin-rotation-crud, api-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write-module shape (D-04): handlers/repos take Pool + auth options directly; no public-stats read-model triplet"
    - "Constraint-signal strategy: DB constraint violations (23505/23514) caught and surfaced as discriminated result signals, never raw pg errors leaking to the route"
    - "Same-transaction dependency pre-check before destructive delete"

key-files:
  created:
    - src/modules/admin/routes/models.ts
    - src/modules/admin/routes/rotation-repository.ts
    - src/modules/admin/routes/tests/rotation-repository.test.ts
  modified: []

key-decisions:
  - "Modelled ALL expected outcomes (created/updated/not_found/has_dependents/name_conflict/invalid_range) as discriminated results; only unexpected pg errors throw"
  - "Slug collision (uq_rotations_slug, also 23505) is reported as name_conflict since a colliding slug is a consequence of a colliding name"
  - "Mirrored existing module precedent (interface for contracts, ScriptedClient pool-stub unit tests) rather than introducing a live-DB integration test"

patterns-established:
  - "Constraint-signal mapping: pg code -> typed RotationConstraintSignal in the repository, route maps signal -> HTTP status"
  - "withClient(begin/commit/rollback/release) wrapping every write, identical in shape to PgRequestWorkflowApplier"

requirements-completed: [API-04]

# Metrics
duration: 6min
completed: 2026-06-07
---

# Phase 18 Plan 03: Admin Rotation Repository Summary

**Transactional, Pool-injected `PgAdminRotationRepository` that creates/updates/deletes rotations with a server-derived `slug_base()` slug, maps pg constraint violations (23505/23514) to typed signals, and refuses to delete non-empty rotations via a same-transaction dependency pre-check.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-07T16:15:07Z
- **Completed:** 2026-06-07T16:21:00Z
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- New `src/modules/admin/` write module contract: `AdminRouteOptions`, `AdminRotationRepository`, input/row types, and discriminated create/update/delete result types.
- `PgAdminRotationRepository` with transactional create/update/delete; slug derived server-side via `slug_base($n)` in both create and update (never client-supplied).
- pg `23505` -> `name_conflict` (409) and `23514` -> `invalid_range` (422) surfaced as typed result signals; unexpected pg errors still throw.
- Delete guarded by a same-transaction dependency pre-check unioning `replays` + `commander_side_stats` + `bounty_points`; non-empty -> `has_dependents`, no delete.
- 10 pool-stub unit tests covering create-slug, dup-name 409, bad-range 422, unexpected-error rethrow, update full-replace + slug regen, update unknown-id, delete-blocked, delete-empty, delete-not-found.

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin module contract types** - `3548ab2` (feat)
2. **Task 2: PgAdminRotationRepository transactional CRUD + tests** - `973039c` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified
- `src/modules/admin/routes/models.ts` - AdminRouteOptions + AdminRotationRepository contract, CreateRotationInput/UpdateRotationInput, AdminRotationRow, discriminated create/update/delete result types, documented constraint-signal strategy.
- `src/modules/admin/routes/rotation-repository.ts` - PgAdminRotationRepository (Pool-injected, withClient transactional, slug_base() server-derived, 23505/23514 -> signal mapping, same-tx delete dependency guard).
- `src/modules/admin/routes/tests/rotation-repository.test.ts` - 10 pool-stub unit tests (ScriptedClient style mirroring workflow-applier.test.ts).

## Decisions Made
- **Discriminated results for every expected outcome** (not exceptions): the route in 18-04 maps `name_conflict`->409, `invalid_range`->422, `not_found`->404, `has_dependents`->409 without catching raw pg codes. This satisfies the plan's "typed signal preferred over throwing raw pg errors".
- **Slug collision reported as name_conflict:** both name-unique and slug-unique violations raise 23505; since a colliding slug is downstream of a colliding name, both map to `name_conflict`.
- **Pool-stub unit tests over live-DB integration test:** the repo's established precedent (`workflow-applier.test.ts` ScriptedClient) gives deterministic coverage of all six required behaviors plus rollback/commit assertions without a live Postgres dependency; the plan explicitly permitted either style.

## Deviations from Plan
None - plan executed exactly as written.

The conventions-driven lint cleanup during Task 2 (switching helper return types from `null` to `undefined` per `unicorn/no-null`, and adding the file-level `eslint-disable camelcase, unicorn/no-null` to the test for snake_case DB row shapes — matching `audit-recalculator.test.ts` precedent) is normal verification-loop work within the planned task, not unplanned scope.

## Issues Encountered
- Initial test `failWith` detection used overly specific substring matches (`update rotations set`) that did not match the multi-line update SQL; simplified to `update rotations` before committing. Resolved within Task 2.
- `pnpm run lint src/modules/admin` expands `.` and surfaces pre-existing `.agents/**` parsing errors (GSD tooling files outside tsconfig) — out of scope and not introduced by this plan. Verified my three files are clean via `npx eslint <files>` (exit 0).

## User Setup Required
None - no external service configuration required. No new runtime dependencies, no new DB migration (uses existing rotations table + slug_base() from migration 0006).

## Next Phase Readiness
- 18-04 can build the thin admin rotation route layer on top of `AdminRouteOptions`/`AdminRotationRepository`, mapping the discriminated signals to HTTP statuses.
- No blockers.

## Self-Check: PASSED

---
*Phase: 18-api-ergonomics-admin-winner-fix*
*Completed: 2026-06-07*
