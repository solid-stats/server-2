---
phase: 18-api-ergonomics-admin-winner-fix
fixed_at: 2026-06-08T00:29:00Z
review_path: .planning/phases/18-api-ergonomics-admin-winner-fix/18-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 4
skipped: 2
status: partial
---

# Phase 18: Code Review Fix Report

**Fixed at:** 2026-06-08
**Source review:** .planning/phases/18-api-ergonomics-admin-winner-fix/18-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 6
- Fixed: 4 (CR-01, WR-01, WR-02, WR-03)
- Skipped: 2 (WR-04, WR-05 — frozen by HIST-04 verify-and-freeze decision)

## Fixed Issues

### CR-01: `foldBountyBreakdown` iterates `inputs.events` without an array guard

**Files modified:** `src/modules/public-stats/repository.ts`, `src/modules/public-stats/repository.test.ts`
**Commit:** 1c21bbf
**Applied fix:** Extended the version-1 gate to also require `Array.isArray(inputs.events)` and `Number.isFinite(inputs.base_score)`, returning the documented legacy `null` fallback otherwise. A version-1 row whose `events` is missing/`null`/non-array no longer reaches the `for...of` loop, so `GET /stats/bounty` and `GET /stats/leaderboards` cannot 500 on malformed jsonb. Added 7 new unit tests proving missing/null/non-array `events`, non-object event primitives, and non-numeric `base_score` fold to `breakdown: null` (or a zero-count breakdown) instead of throwing/emitting NaN — closing the coverage gap that let the defect slip through.

### WR-01: counted-kill factors from jsonb summed without numeric validation

**Files modified:** `src/modules/public-stats/repository.ts`, `src/modules/public-stats/repository.test.ts`
**Commit:** 1c21bbf (folded into the CR-01 atomic commit — same function)
**Applied fix:** Replaced the bare `"player_factor" in event` test with an `isCountedKillEvent` type guard (non-null object carrying `player_factor`) plus `Number.isFinite(event.player_factor)` and `Number.isFinite(event.squad_factor)` checks. An event whose factors are strings/null/missing is excluded from the fold rather than poisoning the summed aggregate with NaN/string concatenation. Unit test added: a string-`player_factor` event is skipped while a sibling well-formed event still counts.

### WR-02: `base_score` from jsonb multiplied without numeric validation

**Files modified:** `src/modules/public-stats/repository.ts`, `src/modules/public-stats/repository.test.ts`
**Commit:** 1c21bbf (folded into the CR-01 atomic commit — same function)
**Applied fix:** Added `Number.isFinite(inputs.base_score)` to the version-1 gate so a non-numeric stored `base_score` folds to `null` instead of producing `NaN` for `breakdown.baseScore` (which would violate the `Type.Number()` response schema). Unit test added: `base_score: "1"` yields `breakdown: null`.

### WR-03: admin rotation routes omit the 400 response schema they actually return

**Files modified:** `src/modules/admin/routes/rotations.ts`, `openapi/server-2.openapi.json`
**Commit:** a840ac4
**Applied fix:** Added `400: ErrorResponse` to the `response` map of all three admin rotation routes (`POST /admin/rotations`, `PUT /admin/rotations/:id`, `DELETE /admin/rotations/:id`), since Fastify emits HTTP 400 on body/params (including malformed `:id` UUID) schema-validation failure. Regenerated the committed OpenAPI artifact via `pnpm run openapi:export` (3 new `400` entries, +54 lines) so `web`'s generated client gains the 400 body type. `pnpm run openapi:check` passes (schema no longer stale).

## Skipped Issues

### WR-04: `legacy_winner_fix` persists an unvalidated `winnerSide` string

**File:** `src/modules/requests/routes/workflow-applier.ts:94-122`; `src/modules/requests/routes/workflows/workflows.ts:30-33`
**Reason:** frozen by HIST-04 verify-and-freeze decision; pre-existing behavior; must be addressed in a dedicated follow-up phase, not by mutating frozen code in this phase.
**Original issue:** The workflow body is unconstrained and `applyLegacyWinnerFix` writes `winnerSide` verbatim into `raw_snapshot.side_facts.outcome.winner_side` with no side whitelist or cross-check against the replay's existing sides.

### WR-05: `legacy_winner_fix` reports success even when zero parser_results rows match

**File:** `src/modules/requests/routes/workflow-applier.ts:104-122`
**Reason:** frozen by HIST-04 verify-and-freeze decision; pre-existing behavior; must be addressed in a dedicated follow-up phase, not by mutating frozen code in this phase.
**Original issue:** When the `update parser_results` matches no current row, the function returns `{ status: "legacy_winner_applied" }` — recording a no-op as a successful winner fix instead of surfacing a not-found signal.

## Out of scope (not attempted)

Info findings IN-01 through IN-04 were not in scope for `critical_warning` and were not addressed.

## Verification

All checks run inside the isolated git worktree (`gsd-reviewfix/18-*`):

- `pnpm run typecheck` — PASS (tsc --noEmit, no errors)
- `pnpm exec vitest run src/modules/public-stats/repository.test.ts src/modules/admin/routes/tests/` — PASS (33 tests, 4 files; includes 7 new malformed-jsonb cases)
- `pnpm run openapi:check` — PASS (schema not stale; openapi-typescript generation succeeds)

Not run (pre-existing environment limitation — no live PostgreSQL/RabbitMQ/S3): `pnpm run test:integration`, `pnpm run test:coverage`.

---

_Fixed: 2026-06-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
