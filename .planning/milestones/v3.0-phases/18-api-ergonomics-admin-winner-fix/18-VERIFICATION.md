---
phase: 18-api-ergonomics-admin-winner-fix
verified: 2026-06-08T00:36:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
follow_ups:
  - id: WR-04
    summary: "legacy_winner_fix persists an unvalidated winnerSide string (no side whitelist / no cross-check against replay sides)"
    reason: "Frozen by HIST-04 verify-and-freeze decision (CONTEXT line 100-109); pre-existing behavior, must be a dedicated follow-up phase"
    source: 18-REVIEW.md WR-04 / 18-REVIEW-FIX.md skipped
  - id: WR-05
    summary: "legacy_winner_fix reports success even when zero parser_results rows match (no-op recorded as applied)"
    reason: "Frozen by HIST-04 verify-and-freeze decision; pre-existing behavior, dedicated follow-up phase"
    source: 18-REVIEW.md WR-05 / 18-REVIEW-FIX.md skipped
  - id: CI-GATE
    summary: "Phase 19 contract-freeze gate MUST run the postgres integration suite + steamid no-leak real-pg sweeps in CI"
    reason: "Local env has no PostgreSQL/RabbitMQ/S3; DB-dependent gates (test:integration, test:coverage, full verify) were deferred to CI across all 18-xx SUMMARYs"
    source: ROADMAP Phase 19 SC3 / environment limitation
ci_deferred_gates:
  - "pnpm run test:integration (real-pg admin rotation repository + winner-fix recalc + leak-guard real-pg sweeps)"
  - "pnpm run test:coverage (100% reachable-source V8 gate)"
  - "full pnpm run verify (includes the above)"
---

# Phase 18: API Ergonomics, Admin & Winner-Fix Verification Report

**Phase Goal:** Trust-and-admin surfaces are complete: explainable bounty, filterable commander-side outcomes, admin rotation CRUD, and a frozen moderator winner-fix
**Verified:** 2026-06-08T00:36:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bounty and leaderboard responses include the formula component breakdown (victim effectiveness, squad effectiveness, rotation context) | ✓ VERIFIED | `bounty.inputs` added to `listBounty` SELECT (repository.ts:523); `mapBounty` folds `foldBountyBreakdown(row.inputs)` (1698); breakdown union on `BountySummaryResponse` (schemas.ts:427) auto-propagates to `BountyListResponse` and `LeaderboardsResponse` (446-448); `breakdown` present in generated `/tmp/server-2-openapi.d.ts` (4 occurrences). Rotation context = per-rotation `rotationId` scoping (documented in OpenAPI description, no invented multiplier per D-02). |
| 2 | Commander-side stats expose an explicit, queryable `unknown` outcome and are filterable by rotation and side | ✓ VERIFIED | `unknown_outcomes` selected in `listCommanderSides` (repository.ts:487) → `unknownOutcomes` in generated types (pre-existing, verified not duplicated); new optional `side` predicate `commander.side = $n::text` AND-composed with rotation, bound never interpolated (475-483); ordering byte-identical (492); `CommanderSideQuery` schema (schemas.ts:58-61) + `commanderSideFilters` (filters.ts:129) wired into the `/stats/commander-sides` handler (routes.ts:546-556); `side?: string` in generated contract. |
| 3 | An admin can create, update, and delete rotations via the API; non-admins are rejected | ✓ VERIFIED | `registerAdminRoutes` exposes POST/PUT/DELETE `/admin/rotations` (rotations.ts), all `preHandler: requireRole(options.auth, "admin")` (adminOnly:54), all `tags: ["admin"]`; `PgAdminRotationRepository` is transactional (`withClient` begin/commit/rollback), server-derives slug via `slug_base($1)`, binds all values `$n`, maps 23505→409/23514→422, refuses delete of rotations with dependents (rotation-repository.ts); wired into `buildApp` (app.ts:112) + `server.ts` (PgAdminRotationRepository injected:52). Generated contract: POST 201/400/401/403/409/422, PUT 200/400/401/403/404/409/422, DELETE 204/400/401/403/404/409. 40 admin/bounty/applier tests pass. |
| 4 | A moderator can set the commander-side winner via the existing `legacy_winner_fix` workflow, verified and role-guarded (verify-and-freeze, not rebuilt) | ✓ VERIFIED | `workflows.ts` and `workflow-applier.ts` are UNCHANGED by Phase 18 (last touching commit `0372295` predates the phase) — confirming verify-and-freeze. Freeze tests in `workflows/tests/index.test.ts` assert role guard (401 no-cookie, 403 no-role), audit-row listing; `workflow-applier.test.ts` freezes the jsonb outcome flip (`status:"known"` + winner_side) and downstream `recalculateCommanderSideStatsForParserResult` invocation. Route present in regenerated OpenAPI contract. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/modules/public-stats/repository.ts` | BountyRow.inputs + SELECT + breakdown fold + side predicate | ✓ VERIFIED | inputs field (194), SELECT (523), `foldBountyBreakdown` with array/finite guards (1714-1757), side predicate (475-483) |
| `src/modules/public-stats/routes/schemas.ts` | breakdown union + CommanderSideQuery | ✓ VERIFIED | breakdown (427), CommanderSideQuery (58), CommanderSideQueryType (506) |
| `src/modules/public-stats/routes/filters.ts` | commanderSideFilters | ✓ VERIFIED | conditional-spread side builder (129-134) |
| `src/modules/admin/routes/models.ts` | AdminRotationRepository contract | ✓ VERIFIED | options/contract/input/row/result types |
| `src/modules/admin/routes/rotation-repository.ts` | PgAdminRotationRepository | ✓ VERIFIED | slug_base, withClient, 23505/23514, dependency pre-check |
| `src/modules/admin/routes/rotations.ts` | registerAdminRoutes (3 guarded routes) | ✓ VERIFIED | admin-only guard on all 3, tags:[admin], full response maps incl. 400 (WR-03 fix) |
| `src/modules/admin/routes/memory.ts` | in-memory default repo | ✓ VERIFIED | InMemoryAdminRotationRepository used by buildApp default + leak sweep |
| `src/app.ts` / `src/server.ts` | wiring | ✓ VERIFIED | registerAdminRoutes + createDefaultAdminOptions (app), PgAdminRotationRepository injected (server) |
| `src/test/integration/steamid-leak-guard.test.ts` | write-route sweep | ✓ VERIFIED | DB-free write-sweep block covers /admin/rotations POST/PUT/DELETE + legacy_winner_fix; STEAM64_PATTERN + negative self-test unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| listBounty SELECT | mapBounty | `bounty.inputs` column | ✓ WIRED | inputs selected and folded at mapper boundary |
| BountySummaryResponse | LeaderboardsResponse | `paginated(BountySummaryResponse)` reuse | ✓ WIRED | breakdown auto-propagates, no second schema |
| /stats/commander-sides handler | listCommanderSides | commanderSideFilters(request.query) | ✓ WIRED | routes.ts:556 |
| listCommanderSides | SQL WHERE | `condition.sqlWith("commander.side = $n::text")` | ✓ WIRED | parameterized, AND-composed |
| rotations.ts | requireRole(options.auth,"admin") | preHandler on every mutation route | ✓ WIRED | adminOnly applied to all 3 routes |
| app.ts buildApp | registerAdminRoutes | plugin registration + default options | ✓ WIRED | app.ts:112 |
| server.ts | buildApp admin options | new PgAdminRotationRepository(databasePool) | ✓ WIRED | server.ts:52 |
| winner-fix freeze tests | side_facts.outcome + recalc | approved stats_correction + legacy_winner_fix assertion | ✓ WIRED | applier test freezes jsonb flip + recalc |
| leak-guard sweep | /admin/rotations + winner-fix bodies | expectNoSteam64 over write responses | ✓ WIRED | write-sweep block (494+) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| mapBounty.breakdown | row.inputs | `bounty_points.inputs` jsonb via listBounty SELECT | Yes — folded from stored inputs; defensive null for legacy | ✓ FLOWING |
| listCommanderSides.side | filters.side | client query → parameterized SQL predicate | Yes — narrows real result set | ✓ FLOWING |
| admin rotation routes | options.rotations | PgAdminRotationRepository (server.ts) / InMemory (default) | Yes in server.ts (Pool-backed); in-memory for buildApp default | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit suite | `pnpm test` | 71 files, 550 tests passed | ✓ PASS |
| Typecheck | `pnpm run typecheck` | tsc --noEmit clean exit | ✓ PASS |
| OpenAPI contract not stale | `pnpm run openapi:check` | verify-openapi + openapi-typescript generation succeed | ✓ PASS |
| Admin/bounty/applier targeted suites | `pnpm exec vitest run src/modules/admin ...repository.test.ts ...workflow-applier.test.ts` | 5 files, 40 tests passed | ✓ PASS |
| Admin routes in generated contract | inspect openapi/server-2.openapi.json | POST/PUT/DELETE /admin/rotations with full response maps incl. 400 | ✓ PASS |
| breakdown/side/unknownOutcomes in generated types | grep /tmp/server-2-openapi.d.ts | breakdown (4), side?: string, unknownOutcomes present | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| API-02 | 18-01, 18-05 | Bounty/leaderboard formula component breakdown | ✓ SATISFIED | breakdown fold + schema propagation + contract |
| API-03 | 18-02, 18-05 | Commander-side explicit unknown + rotation/side filter | ✓ SATISFIED | unknownOutcomes verified + parameterized side predicate |
| API-04 | 18-03, 18-04, 18-05 | Admin rotation create/update/delete | ✓ SATISFIED | transactional repo + admin-guarded routes + wiring |
| HIST-04 | 18-05 | Moderator winner-fix verified + role-guarded (freeze, not rebuild) | ✓ SATISFIED | source files unchanged + freeze tests for guard/outcome/recalc/audit |

All 4 declared requirement IDs map to Phase 18 in REQUIREMENTS.md (lines 42, 47-49, 115-118) and are marked Complete. No orphaned requirements: REQUIREMENTS.md assigns exactly API-02/API-03/API-04/HIST-04 to Phase 18, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none blocking) | — | — | — | No TBD/FIXME/XXX debt markers in phase-modified files; no stub/placeholder/unwired returns; in-memory repos are legitimate test/default doubles, not stubs |

### Deferred / Known Follow-Ups

These are NOT gaps — they are intentional scope decisions or environment limitations.

| # | Item | Disposition | Source |
|---|------|-------------|--------|
| WR-04 | `legacy_winner_fix` persists unvalidated `winnerSide` (no side whitelist/cross-check) | Intentionally frozen by HIST-04 verify-and-freeze; needs a dedicated follow-up phase (modifying frozen code now would violate the HIST-04 decision) | 18-REVIEW WR-04 / 18-REVIEW-FIX skipped |
| WR-05 | `legacy_winner_fix` records a no-op (zero matched rows) as success | Intentionally frozen by HIST-04 verify-and-freeze; dedicated follow-up phase | 18-REVIEW WR-05 / 18-REVIEW-FIX skipped |
| CI-GATE | Phase 19 contract-freeze gate MUST run postgres integration suite + real-pg Steam64 no-leak sweeps in CI | Deferred to CI (Phase 19 SC3) — local env has no PostgreSQL/RabbitMQ/S3 | ROADMAP Phase 19 / environment note |
| IN-01..IN-04 | Info-level review notes (String coercion, duplicated rounding constant, unbounded side maxLength, freeze-locks-pass-through) | Out of scope for the critical_warning fix pass; non-blocking polish | 18-REVIEW |

### Human Verification Required

None. All four success criteria are verifiable from source + the passing unit suite + typecheck + openapi:check. The role guard, signal→status mapping, and SQL composition are covered by automated tests; no visual/real-time/external-service behavior requires manual testing for goal achievement.

### Gaps Summary

No gaps blocking the phase goal. All four ROADMAP success criteria are observably true in the codebase:

1. **Explainable bounty** — breakdown is folded from stored `bounty_points.inputs` and propagates to both bounty and leaderboard responses; defensively null for legacy/malformed jsonb (CR-01/WR-01/WR-02 hardening applied and unit-tested).
2. **Filterable commander-side outcomes** — pre-existing `unknownOutcomes` confirmed, new parameterized `side` predicate AND-composes with `rotationId`, ordering preserved.
3. **Admin rotation CRUD** — three admin-only, transactional, slug-deriving, dependency-guarded routes wired into both buildApp and server.ts; full response maps (incl. WR-03 400 fix) present in the regenerated contract.
4. **Frozen moderator winner-fix** — workflow source files are byte-unchanged; freeze tests lock the role guard, outcome mutation, downstream recalc, and audit row; leak-guard extended to the new write-route bodies.

**Environment caveat (not a regression):** DB-dependent gates (`test:integration`, `test:coverage`, full `pnpm run verify`) cannot run in this local env (no PostgreSQL/RabbitMQ/S3, port 15432 refused). These are documented as deferred to CI across all 18-xx SUMMARYs. **Action for Phase 19:** the contract-freeze gate MUST run the postgres integration suite and the real-pg Steam64 no-leak sweeps in CI before the 1.0.0 freeze (ROADMAP Phase 19 SC3).

---

_Verified: 2026-06-08T00:36:00Z_
_Verifier: Claude (gsd-verifier)_
