---
phase: 18-api-ergonomics-admin-winner-fix
plan: 04
subsystem: api
tags: [admin, rotations, crud, fastify, typebox, openapi, authz]

# Dependency graph
requires:
  - phase: 18-api-ergonomics-admin-winner-fix
    plan: 03
    provides: AdminRouteOptions + AdminRotationRepository contract + PgAdminRotationRepository (discriminated create/update/delete results)
  - phase: 06-auth (auth module)
    provides: requireRole / currentUser session-cookie authz used as the admin guard
provides:
  - "registerAdminRoutes Fastify plugin: POST/PUT/DELETE /admin/rotations, admin-guarded, tags: [admin]"
  - "InMemoryAdminRotationRepository (buildApp default + route-test double mirroring the Pg contract)"
  - "buildApp admin wiring (optional admin options + createDefaultAdminOptions) and server.ts Pool-backed injection"
  - "POST/PUT/DELETE /admin/rotations in the regenerated OpenAPI contract"
affects: [18-05-leak-guard-and-freeze, web-openapi-client, api-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin admin controller: translate repository discriminated signals to HTTP status (name_conflict->409, invalid_range->422, has_dependents->409, not_found->404)"
    - "buildApp optional-options + create<Module>DefaultOptions in-memory default (mirrors createDefaultRequestOptions) so buildApp() with no DB still constructs"
    - "Test utilities extracted to tests/utilities.ts to keep each *.test.ts under the 300-line max-lines gate"

key-files:
  created:
    - src/modules/admin/routes/rotations.ts
    - src/modules/admin/routes/memory.ts
    - src/modules/admin/routes/tests/rotations.test.ts
    - src/modules/admin/routes/tests/rotations-validation.test.ts
    - src/modules/admin/routes/tests/utilities.ts
  modified:
    - src/app.ts
    - src/server.ts
    - openapi/server-2.openapi.json

key-decisions:
  - "Route-layer tested with an in-memory AdminRotationRepository double (not real-pg): the route's job is signal->status translation, fully exercised without a live DB; the Pg impl + DB constraints are covered by 18-03's repo unit tests and the real-pg integration profile"
  - "InMemoryAdminRotationRepository doubles as the buildApp default AND the test double — one in-memory impl mirroring the Pg observable contract (server-derived slug, name_conflict, invalid_range, not_found, has_dependents)"
  - "DELETE 204 response schema declared as Type.Null() so the no-body 204 is enumerated in the OpenAPI contract alongside 401/403/404/409"

patterns-established:
  - "Admin write-module controller shape: named status constants + grouped TypeBox const + per-route response map enumerating every status + requireRole(options.auth, \"admin\") preHandler"

requirements-completed: [API-04]

# Metrics
duration: 12min
completed: 2026-06-07
---

# Phase 18 Plan 04: Admin Rotation CRUD HTTP Surface Summary

**Three admin-only `/admin/rotations` routes (POST 201 / PUT 200 / DELETE 204) guarded by `requireRole(options.auth, "admin")`, translating the 18-03 repository's discriminated signals to HTTP status codes, wired into `buildApp` (in-memory default) and `server.ts` (Pool-backed `PgAdminRotationRepository`), and published in the OpenAPI contract under `tags: ["admin"]`.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-07
- **Tasks:** 2
- **Files:** 8 (5 created, 3 modified)

## Accomplishments

- `registerAdminRoutes` async Fastify plugin with three admin-guarded CRUD routes, grouped TypeBox schemas (`RotationBody` with **no** client slug, `RotationIdParameters`, `RotationResponse`, `ErrorResponse`), and a `response` map on every route enumerating every status it returns (201/200/204 + 401 + 403 + 404/409/422 as applicable).
- Signal -> status translation: repository `name_conflict` -> 409, `invalid_range` -> 422, delete `has_dependents` -> 409, `not_found` -> 404; every error body is `{ message }`.
- `InMemoryAdminRotationRepository` mirroring the Pg observable contract (server-derived slug, dup-name conflict, bad-range, unknown-id, dependents-blocked) — used as both the `buildApp` default bundle and the route-test double.
- `buildApp` extended with an optional `admin?: Omit<AdminRouteOptions, "auth">` field + `createDefaultAdminOptions()`; `registerAdminRoutes` registered after the request-module routes. `server.ts` injects `new PgAdminRotationRepository(databasePool)`.
- OpenAPI contract regenerated: `POST/PUT/DELETE /admin/rotations` (+ `/admin/rotations/{id}`) now present under `tags: ["admin"]`.
- 9 new route integration tests (across `rotations.test.ts` + `rotations-validation.test.ts`) proving: admin POST 201 with server-derived slug; moderator 403; unauthenticated 401; unknown PUT 404; delete-empty 204; delete-with-dependents 409; dup name 409 (POST + PUT); bad range 422 (POST + PUT); unknown DELETE 404; null-endsAt + slug fallback.

## Task Commits

1. **Task 1: registerAdminRoutes — 3 admin-guarded CRUD routes** - `9e95254` (feat)
2. **Task 2 (TDD RED): failing route tests + in-memory repo double** - `09e4db8` (test)
3. **Task 2 (TDD GREEN): wire buildApp + server.ts + contract** - `447ccc3` (feat)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified

- `src/modules/admin/routes/rotations.ts` (new) — `registerAdminRoutes`; named status constants; TypeBox schemas; `replyForSignal` helper mapping `RotationConstraintSignal` -> 409/422.
- `src/modules/admin/routes/memory.ts` (new) — `InMemoryAdminRotationRepository` (slug server-derived, name/dependents/range guards), used as default + test double.
- `src/modules/admin/routes/tests/rotations.test.ts` (new) — 7 route integration tests (authz + CRUD happy/edge paths).
- `src/modules/admin/routes/tests/rotations-validation.test.ts` (new) — 2 tests (update dup/bad-range, slug fallback + null endsAt); split out to satisfy the 300-line `max-lines` gate.
- `src/modules/admin/routes/tests/utilities.ts` (new) — shared `buildAdminApp`/`login`/`validBody`/`createRotationId` + status constants.
- `src/app.ts` (modified) — `admin?` option, `createDefaultAdminOptions()`, `registerAdminRoutes` registration.
- `src/server.ts` (modified) — `new PgAdminRotationRepository(databasePool)` injected into the admin options.
- `openapi/server-2.openapi.json` (modified) — regenerated; admin rotation routes added.

## Decisions Made

- **In-memory route-test double over real-pg for the route layer.** The controller only translates repository signals to status codes; an in-memory `AdminRotationRepository` exercises every signal->status branch deterministically with no live DB. The Pg impl and DB constraint codes (23505/23514) are already covered by 18-03's pool-stub unit tests; the real-pg path (slug_base SQL, dependency pre-check) is exercised by the integration profile. The plan explicitly permitted either style.
- **One in-memory impl serves default + test double.** Avoids a separate noop default; `buildApp()` with no DB still constructs and behaves like the real contract.
- **DELETE 204 schema as `Type.Null()`** so the empty-body 204 is part of the published contract response map.
- **Test file split** to honor the repo's 300-line `max-lines` rule (no per-file lint suppression introduced for it).

## Deviations from Plan

None functionally — plan executed as written. The verification-loop refinements within Task 2 are normal: extracting `tests/utilities.ts` and splitting `rotations-validation.test.ts` to satisfy `max-lines` and `unicorn/no-await-expression-member`; `/* v8 ignore */` on the unreachable login guards (mirroring the workflows test analog); `/* eslint-disable unicorn/no-null */` on the validation test that asserts an `endsAt: null` payload; adding extra tests (PUT-constraint, slug-fallback, null-endsAt) to reach 100% reachable-source coverage on the new files.

## Issues Encountered

- **`pnpm run lint` (whole-tree) surfaces pre-existing `.agents/**` / `.claude/**` parsing errors** (GSD tooling files outside tsconfig) — same out-of-scope condition 18-03 documented. Confirmed zero lint errors in `src/` via `npx eslint src/modules/admin src/app.ts src/server.ts` (exit 0).
- **`pnpm run test:coverage` / `pnpm run test:integration` require a live PostgreSQL/RabbitMQ/S3** (ECONNREFUSED 127.0.0.1:15432) which is not running in this sandbox. The 9 failing files are all `*postgres.test.ts` + `src/test/integration/*` (infra-dependent), unrelated to this plan. The non-integration unit suite (`pnpm test`) is fully green: 71 files / 542 tests. The 3 residual uncovered lines in 18-03's `rotation-repository.ts` (109/180/196) are covered only via the real-pg path and are out of this plan's scope.

## Verification

- `pnpm run typecheck` — pass.
- `pnpm exec vitest run src/modules/admin` — 3 files / 19 tests green (7 + 2 route, 10 repo).
- `pnpm test` (full unit suite, integration excluded) — 71 files / 542 tests green.
- `pnpm run openapi:check` — regenerates clean; POST/PUT/DELETE /admin/rotations present under `tags: ["admin"]`.
- Admin-module coverage (new files) — 100% statements/branches/functions/lines for `rotations.ts`, `memory.ts`, both test files, `utilities.ts`.

## Threat Surface

All 18-04 threat-register mitigations are in place: T-18-11 (EoP) — `requireRole(options.auth, "admin")` on all three mutation routes, proven by moderator->403 + unauthenticated->401 tests; T-18-12 (spoofing) — auth via `currentUser`/session cookie, no client-supplied role; T-18-13 (mass assignment) — `slug` not in `RotationBody` (server-derived), id only via uuid `:id` param; T-18-15 (info disclosure) — `{ message }`-only error bodies, no raw pg text (leak-guard sweep added in 18-05). No new threat surface beyond the plan's register.

## Next Phase Readiness

- 18-05 can extend the Steam64 leak-guard sweep to the `/admin/rotations` write-route bodies and finalize the contract freeze.
- No blockers.

## Self-Check: PASSED

All 5 created files exist on disk; all 3 task commits (9e95254, 09e4db8, 447ccc3) exist in git history.
