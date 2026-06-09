---
phase: 16-slug-resolution-history-provenance
plan: "05"
subsystem: public-stats-routes
tags: [routes, slug-resolution, history, provenance, openapi]
dependency_graph:
  requires: [16-03, 16-04]
  provides: [API-01-routes, HIST-01-routes, HIST-02-routes]
  affects: [public-stats HTTP surface, OpenAPI schema]
tech_stack:
  added: []
  patterns: [Fastify slug-or-uuid param relaxation, history sub-resource route extraction]
key_files:
  modified:
    - src/modules/public-stats/routes/routes.ts
decisions:
  - Extracted player history routes into registerPlayerHistoryRoutes to stay within max-lines-per-function=120 ESLint limit while keeping the overall file pattern consistent
metrics:
  duration: "~8 minutes"
  completed: "2026-06-07"
  tasks_completed: 1
  files_changed: 1
---

# Phase 16 Plan 05: Slug-or-UUID Routes + History Sub-resources Summary

**One-liner:** Wired all public-stats detail and sub-resource routes to `SlugOrUuidParameters`, added `GET /stats/rotations/:id` detail route, and registered three history sub-resource endpoints (`name-history`, player `membership-history`, squad `membership-history`) with TypeBox response schemas and existing 404 NotFound path.

## What Was Built

1. **Relaxed `UuidParameters` → `SlugOrUuidParameters`** on all detail and sub-resource routes:
   - `/stats/players/:id` (detail)
   - `/stats/players/:id/weapons`, `/vehicles`, `/relationships`, `/weekly`
   - `/stats/squads/:id` (detail)
   - `/stats/squads/:id/weapons`, `/relationships`, `/weekly`

2. **New `GET /stats/rotations/:id`** in `registerRotationRoutes` — resolves slug-or-uuid via `readModel.getRotation`, returns `RotationDetailResponse` (summary + provenance), 404 on null.

3. **New `GET /stats/players/:id/name-history`** — returns `NameHistoryResponse` (entries + provenance), 404 on null.

4. **New `GET /stats/players/:id/membership-history`** — returns `PlayerMembershipHistoryResponse`, 404 on null.

5. **New `GET /stats/squads/:id/membership-history`** — returns `SquadMembershipHistoryResponse`, 404 on null.

## 404 Path Preservation

All new routes reuse the existing `reply.code(NOT_FOUND).send({ message: "… not found" })` pattern. The read-model methods (16-04) return `null` for unresolved slugs/UUIDs; the route maps `null ?? reply.code(404)` — identical to existing detail routes. The `mapPublicStatsError` child-scope hook covers all routes without change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint] Extracted `registerPlayerHistoryRoutes` sub-function**
- **Found during:** Task 1 verification (pnpm run lint)
- **Issue:** Adding two history routes to `registerPlayerRoutes` pushed it to 145 lines, exceeding the `max-lines-per-function: 120` ESLint rule.
- **Fix:** Extracted the two Phase 16 history routes into a new `registerPlayerHistoryRoutes` function, called at the end of `registerPlayerRoutes`. Pattern is consistent with the existing decomposition approach.
- **Files modified:** `src/modules/public-stats/routes/routes.ts`
- **Commit:** 2341aa3

## Verification Results

- `pnpm run typecheck` — PASSED
- `pnpm run lint` — PASSED
- `pnpm test` — PASSED (400/400 tests, 61 test files)

## Threat Coverage

| Threat ID | Mitigation Status |
|-----------|------------------|
| T-16-13 (DoS — unbounded path) | All new routes use `SlugOrUuidParameters` (maxLength 128, pattern). |
| T-16-14 (500 instead of 404) | `null` from read-model → `reply.code(404).send(...)` on every new route. |
| T-16-15 (Steam64 in responses) | Response schemas from 16-03 carry no Steam64 fields. |

## Self-Check: PASSED

- File exists: `src/modules/public-stats/routes/routes.ts` — FOUND
- Commit `2341aa3` — FOUND in git log
- All 4 new routes grep-verified
- 28 occurrences of `SlugOrUuidParameters` confirm full param relaxation
- Zero remaining `UuidParameters` on detail/sub-resource routes
