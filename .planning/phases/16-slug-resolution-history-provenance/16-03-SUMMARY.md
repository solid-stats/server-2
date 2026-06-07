---
phase: 16-slug-resolution-history-provenance
plan: "03"
subsystem: public-stats-contracts
tags: [schemas, domain-types, typebox, read-model, history, provenance, slug]
dependency_graph:
  requires: [16-01]
  provides: [SlugOrUuidParameters, ProvenanceResponse, slug-fields, history-union-schemas, read-model-methods]
  affects: [16-04, 16-05]
tech_stack:
  added: []
  patterns: [typebox-discriminated-union, typebox-intersect-provenance, read-model-stub-pattern]
key_files:
  created: []
  modified:
    - src/modules/public-stats/routes/schemas.ts
    - src/modules/public-stats/routes/models.ts
    - src/modules/public-stats/routes/empty-read-model.ts
    - src/modules/public-stats/repository.ts
    - src/modules/public-stats/routes/tests/fixtures.ts
decisions:
  - "Named counterpart schemas SquadReferenceResponse/PlayerReferenceSlugResponse (unicorn/prevent-abbreviations requires full names)"
  - "Provenance added to parity singular responses (PlayerWeapons/Vehicles/Relationships/Weekly, Squad*) — additive, Plan 04 wires real values"
  - "Repository + fixtures updated with slug/provenance stubs in same commit to keep typecheck green"
metrics:
  duration: ~60min
  completed: "2026-06-07"
  tasks_completed: 2
  files_modified: 5
---

# Phase 16 Plan 03: Phase Contracts (Schemas + Domain Types + Read-Model) Summary

Declared ALL Phase 16 TypeBox schemas, TS domain types, and read-model interface extensions additive against the existing public-stats contracts. Plan 04 (repository) and Plan 05 (routes) now build against fixed shapes without codebase investigation.

## What Was Built

**schemas.ts (additive):**
- `SlugOrUuidParameters` — bounded `{ id: string(minLength:1, maxLength:128, pattern:^[A-Za-z0-9-]+$) }` (T-16-06 DoS mitigation)
- `ProvenanceResponse` — `{ lastUpdatedAt: string(date-time) | null }`
- `slug: Type.String()` added to `RotationSummaryResponse`, `PlayerSummaryResponse`, `SquadSummaryResponse`
- `provenance: ProvenanceResponse` added to `PlayerProfileResponse`, `SquadProfileResponse`, all Phase-15 parity singular responses (PlayerWeapons/Vehicles/Relationships/Weekly, SquadWeapons/Relationships/Weekly), `RotationDetailResponse`
- `RotationDetailResponse = Type.Intersect([RotationSummaryResponse, Type.Object({ provenance })])`
- `SquadReferenceResponse`, `PlayerReferenceSlugResponse` — counterparts with `{ id, slug, name|displayName }` only (T-16-07: no Steam64)
- `NameHistoryEntry`, `PlayerMembershipHistoryEntry`, `SquadMembershipHistoryEntry` — `Type.Union` discriminated unions with `kind: "alias"|"membership"|"unknown-gap"` (3x `Type.Literal("unknown-gap")`)
- `NameHistoryResponse`, `PlayerMembershipHistoryResponse`, `SquadMembershipHistoryResponse` — entries array + provenance
- `Static<>` exports: `SlugOrUuidParametersType`, `RotationDetailResponseType`, `NameHistoryResponseType`, `PlayerMembershipHistoryResponseType`, `SquadMembershipHistoryResponseType`

**models.ts (additive):**
- `slug: string` added to `RotationSummary`, `PlayerSummary`, `SquadSummary`
- `provenance: { lastUpdatedAt: string | null }` added to `PlayerProfile`, `SquadProfile`, all parity payload types, `RotationDetail`
- `RotationDetail extends RotationSummary { provenance }`
- `SquadReference`, `PlayerReferenceSlug` counterpart interfaces (no Steam64)
- `NameHistoryEntry`, `PlayerMembershipHistoryEntry`, `SquadMembershipHistoryEntry` discriminated union TS types
- `NameHistoryPayload`, `PlayerMembershipHistoryPayload`, `SquadMembershipHistoryPayload` wrappers
- `PublicStatsReadModel` extended with `getRotation`, `getPlayerNameHistory`, `getPlayerMembershipHistory`, `getSquadMembershipHistory`

**empty-read-model.ts:** 4 new `() => Promise.resolve(null)` stubs — boot-without-DB compiles.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repository and test fixtures needed updating to satisfy extended interface**
- **Found during:** Task 2
- **Issue:** `PgPublicStatsReadModel` implements `PublicStatsReadModel`; extending the interface without updating the class broke typecheck in repository.ts, tests/fixtures.ts, server.ts, integration tests
- **Fix:** Added Phase 16 stubs in repository.ts mappers (`slug: ""`, `provenance: { lastUpdatedAt: null }`) and 4 new method stubs (`getRotation`, `getPlayerNameHistory`, `getPlayerMembershipHistory`, `getSquadMembershipHistory` → `Promise.resolve(null)`); updated fixtures.ts fake data and added matching stub methods
- **Files modified:** `src/modules/public-stats/repository.ts`, `src/modules/public-stats/routes/tests/fixtures.ts`
- **Commit:** accb904

**2. [Rule 1 - Lint] Naming violations for abbreviated counterpart names**
- **Found during:** Task 1 lint
- **Issue:** `unicorn/prevent-abbreviations` rejects `SquadRefResponse` and `PlayerRefSlugResponse`
- **Fix:** Renamed to `SquadReferenceResponse` and `PlayerReferenceSlugResponse` in schemas.ts; `SquadRef` → `SquadReference` and `PlayerRefSlug` → `PlayerReferenceSlug` in models.ts
- **Files modified:** schemas.ts, models.ts

**3. [Out of Scope - Deferred] Pre-existing lint errors in Phase 16-01 files**
- Files: `history-gaps.ts`, `history-gaps.test.ts`, `provenance.ts`, `provenance.test.ts`, `slug.ts`, `slug.test.ts`
- 31 lint errors in those files (abbreviations, curly, array-type, no-magic-numbers etc.)
- Not introduced by this plan; logged to deferred-items

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `slug: ""` in `mapRotation/mapPlayerSummary/mapSquadSummary` | repository.ts | Plan 04 wires real DB column (0006 migration adds slug) |
| `provenance: { lastUpdatedAt: null }` in all parity mappers | repository.ts | Plan 04 wires real timestamp from DB rows |
| `getRotation/getPlayerNameHistory/getPlayerMembershipHistory/getSquadMembershipHistory: null` | repository.ts | Plan 04 implements full SQL queries |

These stubs are intentional holding patterns. The contracts (interfaces + schemas) are fixed; Plan 04 fills the implementations.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced — this plan is schema/type declarations only. T-16-06 (DoS via unbounded param) mitigated by `SlugOrUuidParameters` maxLength:128. T-16-07 (Steam64 leak) mitigated by counterpart schemas carrying only `{id,slug,name|displayName}`.

## Self-Check: PASSED

- schemas.ts: FOUND
- models.ts: FOUND
- empty-read-model.ts: FOUND
- Commit accb904: FOUND
