---
phase: 16-slug-resolution-history-provenance
plan: "04"
subsystem: public-stats-repository
tags: [slug-resolution, history, provenance, parity, temporal-sql]
dependency_graph:
  requires: [16-01, 16-03]
  provides: [slug-or-uuid-resolver, history-read-methods, provenance-at-mapper-boundary]
  affects: [src/modules/public-stats/repository.ts]
tech_stack:
  added: []
  patterns:
    - boolean-flag SQL branch for safe slug-or-uuid resolution
    - maxTimestamp at mapper boundary (never now())
    - withGaps for discriminated-union timeline entries
    - private stat-timestamp helpers for parity provenance
key_files:
  modified:
    - src/modules/public-stats/repository.ts
decisions:
  - Boolean-flag branch ($1::boolean = true and id = $2::uuid) or (false and slug = $2::text) prevents ::uuid cast 500 on slug input
  - playerStatTimestamp/squadStatTimestamp private helpers fetch max(calculated_at) for parity provenance without touching numeric SQL
  - Rotation provenance = max(player_stats.calculated_at for rotation) floored on created_at, per Open Q2 recommendation
  - listRotations adds null::timestamptz as last_calc to satisfy RotationRow interface without unnecessary subquery per-row
metrics:
  duration: "~20 minutes"
  completed: "2026-06-07T04:14:39Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 16 Plan 04: Slug Resolution, History & Provenance Repository Implementation Summary

**One-liner:** PgPublicStatsReadModel extended with boolean-flag slug-or-uuid resolver, three temporal history read methods with withGaps, and maxTimestamp provenance at the mapper boundary across all singular stat responses.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | slug-or-uuid resolver + slug/provenance on row interfaces & detail mappers | 905e210 | repository.ts |
| 2 | history read methods + provenance on parity sub-resources | 905e210 | repository.ts |

## What Was Implemented

### Slug-or-UUID Resolver (Task 1)

`getPlayer`, `getSquad`, and `getRotation` all now branch via:

```sql
where ($1::boolean = true and <table>.id = $2::uuid)
   or ($1::boolean = false and <table>.slug = $2::text)
```

`looksLikeUuid(id)` (imported from `./routes/slug.js`) computes the boolean in TypeScript. A slug input never reaches the `::uuid` cast — PostgreSQL only sees that cast in the UUID branch, so a bad slug returns `null` (404) rather than throwing `invalid input syntax for type uuid` (500).

### Row Interfaces & Mappers (Task 1)

- `PlayerRow` gains `slug: string`, `calculated_at: Date | null`, `updated_at: Date | null`
- `SquadRow` gains `slug: string`, `calculated_at: Date | null`, `updated_at: Date | null`
- `RotationRow` gains `slug: string`, `created_at: Date`, `last_calc: Date | null`
- `playerSelectStats()` and `squadSelectStats()` helpers now emit `players.slug`, `max(stats.calculated_at) as calculated_at`, `players.updated_at` (and squad equivalents)
- `group by` clauses extended to include `slug` and `updated_at`
- `mapPlayerSummary`, `mapSquadSummary`, `mapRotation` — `slug: row.slug` (stub `""` removed)
- `mapPlayerProfile` — `provenance: { lastUpdatedAt: maxTimestamp([row.calculated_at, row.updated_at]) }` (stub null removed)
- `getSquad` — `provenance: { lastUpdatedAt: maxTimestamp([row.calculated_at, row.updated_at]) }`
- `getRotation` — `provenance: { lastUpdatedAt: maxTimestamp([row.last_calc, row.created_at]) }`
- Masking choke point `row.steam_ids.map((steamId) => maskSteamId(steamId))` in `mapPlayerProfile` is unchanged

### History Read Methods (Task 2)

Three new methods added to `PgPublicStatsReadModel`:

- `getPlayerNameHistory(id)`: queries `player_nicknames` ordered `observed_from asc nulls first, n.id`; maps via `withGaps` to `NameHistoryEntry[]`; provenance from `maxTimestamp(rows.flatMap([observed_to, observed_from]))`
- `getPlayerMembershipHistory(id)`: queries `squad_memberships join squads` ordered `valid_from asc nulls first, m.id`; counterpart `{id, slug, name}` — no Steam64
- `getSquadMembershipHistory(id)`: queries `squad_memberships join canonical_players` ordered `valid_from asc nulls first, m.id`; counterpart `{id, slug, displayName}` — no Steam64

All three return `null` when the parent entity does not exist, `{entries, provenance}` otherwise.

### Phase-15 Parity Sub-Resource Provenance (Task 2)

Seven parity methods (`getPlayerWeapons`, `getPlayerVehicles`, `getPlayerRelationships`, `getPlayerWeekly`, `getSquadWeapons`, `getSquadRelationships`, `getSquadWeekly`) now return real provenance via two private helpers:

- `playerStatTimestamp(id)` — `select max(ps.calculated_at) from player_stats ps where ps.player_id = $1::uuid`
- `squadStatTimestamp(id)` — `select max(ss.calculated_at) from squad_stats ss where ss.squad_id = $1::uuid`

Numeric parity (kills, deaths, KD ratios, weapon counts, relationship counts, week buckets) is byte-identical — no numeric aggregates were changed.

## Acceptance Criteria Verification

```
grep -n "::boolean = true" repository.ts  → 3 matches (getPlayer, getSquad, getRotation)
grep -n "looksLikeUuid" repository.ts     → 3 binding sites + 1 import
grep -c "maxTimestamp" repository.ts      → 14
grep -n "slug: row.slug" repository.ts    → 3 (mapPlayerSummary, mapSquadSummary, mapRotation)
grep -n "withGaps" repository.ts          → 4 (import + 3 history methods)
grep -n "order by.*nulls first" repository.ts → 3 ascending nulls-first sorts
No "steam" references in new history/counterpart mappings
All 7 parity sub-resource methods now have real provenance (no "Phase 16 stub" comments remain)
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Implementation Notes

1. `listRotations` updated to include `slug`, `created_at`, and `null::timestamptz as last_calc` in its SELECT so the `RotationRow` interface is satisfied. `mapRotation` is shared by both `listRotations` and `getRotation` — the list path uses the stub `last_calc = null` (no provenance computed for list surfaces, per plan).

2. Import ordering: `withGaps` import placed before `pagination/` imports to satisfy ESLint `import-x/order` rule.

3. Identifier names: lambda parameters in history method `.map()` calls use `row`/`win` instead of single-letter `r`/`w` to satisfy ESLint `id-length` rule.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All SQL is parameterized. Boolean-flag branch prevents T-16-10 (::uuid cast DoS). No Steam64 in any new counterpart mapping (T-16-11 mitigated). maxTimestamp over returned rows only, never now() (T-16-12 mitigated).

## Self-Check

- [x] `src/modules/public-stats/repository.ts` modified
- [x] commit 905e210 exists
- [x] `pnpm run typecheck` — green
- [x] `pnpm test` — 400/400 passed
- [x] `pnpm run lint` — green (0 errors)

## Self-Check: PASSED
