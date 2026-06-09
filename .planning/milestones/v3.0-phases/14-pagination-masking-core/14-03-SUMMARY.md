---
phase: 14-pagination-masking-core
plan: 03
subsystem: public-stats
tags: [pagination, keyset, cursor, openapi, page-01, page-02, page-03]
requires:
  - "src/modules/public-stats/routes/pagination/cursor.ts (encode/decodeCursor — 14-01)"
  - "src/modules/public-stats/routes/pagination/keyset.ts (buildKeysetPredicate — 14-01)"
  - "src/modules/public-stats/routes/pagination/sort.ts (resolveSort + *_SORT whitelists — 14-01)"
  - "src/modules/public-stats/routes/pagination/mask.ts (maskSteamId — 14-02)"
  - "src/test/integration/steamid-leak-guard.test.ts (expectNoSteam64 — 14-02)"
provides:
  - "page(query, whitelist, defaultSort) -> keyset PageQuery (cursor decode + sort/order cross-check)"
  - "keysetResult() over-fetch limit+1 reassembly (hasMore + nextCursor, no COUNT/total)"
  - "{ items, nextCursor, hasMore } contract on players/squads/bounty/leaderboards"
  - "migration 0005_keyset_indexes.sql (composite keyset indexes)"
  - "OpenAPI contract guard (contract.test.ts): scoped no page/pageSize/total + zero Steam64"
affects:
  - "OpenAPI artifact: list-response schemas now items/nextCursor/hasMore (breaking; web is a new consumer)"
  - "All four list endpoints: page/pageSize/total removed from query + response"
tech-stack:
  added: []
  patterns:
    - "Keyset (seek) pagination: HAVING for aggregate sort keys, WHERE for stored columns, id ASC tie-breaker, limit+1 over-fetch"
    - "Opaque base64url cursor cross-checked against request sort/order (reject drift)"
    - "preValidation legacy-param guard + setErrorHandler BadCursorError->400, scoped to the public-stats plugin"
    - "JSON-scoped OpenAPI contract assertion (paginated schema objects only — never whole-file grep)"
key-files:
  created:
    - "src/infra/db/migrations/0005_keyset_indexes.sql"
    - "src/modules/public-stats/routes/filters.test.ts"
    - "src/openapi/contract.test.ts"
  modified:
    - "src/modules/public-stats/repository.ts"
    - "src/modules/public-stats/routes/filters.ts"
    - "src/modules/public-stats/routes/routes.ts"
    - "src/modules/public-stats/routes/pagination/keyset.ts"
    - "src/modules/public-stats/routes/schemas.ts (pre-session)"
    - "src/modules/public-stats/routes/models.ts (pre-session)"
    - "src/modules/public-stats/tests/postgres.test.ts"
    - "src/test/integration/steamid-leak-guard.test.ts"
    - "openapi/server-2.openapi.json"
decisions:
  - "Leaderboards delivered as ONE endpoint with three independently-paginated sections (bounty/playersByKills/squadsByKills), each { items, nextCursor, hasMore }, driven by per-surface query params bountyCursor/playersCursor/squadsCursor + a shared limit. Least churn for web vs three separate cursor endpoints."
  - "WHERE-vs-HAVING split: players.kills/teamkills and squads.kills/teamkills are runtime aggregates -> seek in HAVING; squads.name and bounty.points are stored columns -> seek in WHERE (players/squads name is also post-GROUP-BY so still HAVING)."
  - "Keyset value placeholder is ALWAYS cast (::int numeric, ::text non-numeric) so PG can type the `$n IS NULL` branches — fixes 'could not determine data type of parameter' on cursored name-sort paging (Rule 1 bug)."
  - "NULL sort-key end-to-end: the production schema has no nullable sort column (display_name NOT NULL; kills/teamkills coalesce to 0), so the real-pg proof asserts the shared-value + id-tie-breaker dimension; the four NULL-aware OR branches stay exhaustively unit-proven in keyset.test.ts."
  - "`sort` stays a free Type.String() at the schema layer (per-endpoint literal-union enums deferred to Phase 19 freeze); whitelist enforced in page()/resolveSort -> 400."
metrics:
  duration: "~70 min"
  completed: "2026-06-05"
  tasks: 4
  files: 12
requirements: [PAGE-01, PAGE-02, PAGE-03]
---

# Phase 14 Plan 03: Pagination Migration Summary

Wired the Wave-1 cursor/sort/keyset primitives through the `page()` choke point
so players, squads, bounty, and leaderboards all speak the one opaque-cursor +
server-side-sort contract `{ items, nextCursor, hasMore }`, replaced OFFSET with
keyset seek (HAVING for aggregate sort keys, WHERE for stored columns, id ASC
tie-breaker, limit+1 over-fetch), removed `page`/`pageSize`/`total` from schema/
types/SQL/and the exported OpenAPI artifact, and proved cross-page-boundary
stability against real PostgreSQL.

## What Shipped

### Task 1 — cursor contract on schema/types/filter + mixed-param guard (PAGE-01)
Largely landed in a prior session (commit `dbf4747`) and verified intact this
session: `PaginationQuery` is cursor/limit/sort/order; `paginated()` is
items/nextCursor/hasMore; `PageQuery`/`PaginatedResult` redefined (no `total`,
no `extends PageQuery`); `page()` decodes the cursor, cross-checks sort/order
(400 on drift), resolves sort against the endpoint whitelist; `routes.ts` has a
plugin-scoped `preValidation` legacy-param guard (page+cursor -> 400, leftover
page/pageSize -> 400) and a `setErrorHandler` mapping `BadCursorError` -> 400.
Route tests assert all four 400 cases (page+cursor, leftover, unknown sort,
sort/order drift) plus malformed-cursor.

### Task 2a/2b — keyset SQL + getLeaderboards + indexes (PAGE-02, PAGE-03) — `3c9f4cb`
- `listPlayers`/`listSquads`/`listBounty` run `buildKeysetPredicate` (HAVING for
  the aggregate kills/teamkills/name keys after GROUP BY, WHERE for the stored
  `bounty.points`), `orderBySql` ending in `id ASC`, `LIMIT limit+1`; no OFFSET,
  no COUNT. The orphaned `select count(*) from bounty_points` is gone.
- `keysetResult()` over-fetches limit+1, sets `hasMore`, drops the surplus row,
  encodes `nextCursor` from the last kept row (null when not `hasMore`).
- `getLeaderboards` builds a per-surface cursor `PageQuery` (no `{ page: 1,
  pageSize }` caller remains); `emptyLeaderboards` returns the cursor shape per
  surface.
- Migration `0005_keyset_indexes.sql`: `(display_name,id)`, `(name,id)`,
  `(points,id)`, and covering `(player_id,rotation_id)`/`(squad_id,rotation_id)`.

### Task 3 — real-pg stability proof, leak-guard un-skip, OpenAPI guard (PAGE-02, PAGE-03) — `42afe79`, `fdd507e`
- `postgres.test.ts`: every list assertion migrated to the cursor shape; the
  cross-page-boundary stability proof seeds a heavily-tied `kills` dataset
  (`[0,0,0,2,2,5,5]`) + distinct names and pages the whole set via successive
  `nextCursor` calls for asc AND desc on kills AND name, asserting no duplicate /
  no missing id. Overflow tests exercise the per-entity cursor builders and the
  bounty WHERE composition (with and without a rotation filter) and the
  leaderboards per-surface after branch.
- `steamid-leak-guard.test.ts`: the malformed-cursor 400 `it.todo` is un-skipped
  across players/squads/bounty/leaderboards (a planted Steam64 in the cursor
  never appears in the 400 body); a real-pg masked-profile sweep seeds a full
  Steam64 and asserts the `/stats/players/:id` body emits zero `7656119\d{10}`.
- `contract.test.ts`: JSON-scoped guard over the exported artifact — every
  paginated list-response schema (`items`+`nextCursor`+`hasMore`) declares no
  `page`/`pageSize`/`total`, and the document carries zero `7656119\d{10}`.
- OpenAPI artifact regenerated and committed (`fdd507e`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Keyset placeholder type-cast for non-numeric sort keys**
- **Found during:** Task 3 (real-pg `name`-sort cursored paging)
- **Issue:** `buildKeysetPredicate` only cast the value placeholder `::int` for
  numeric keys; text keys had a bare `$n`. PG cannot infer a placeholder's type
  when it only appears in `$n IS NULL`/`$n IS NOT NULL` branches, erroring with
  "could not determine data type of parameter $2" on the second page of a
  name-sorted list.
- **Fix:** Always cast — `::int` numeric, `::text` non-numeric — in `keyset.ts`;
  updated the `keyset.test.ts` text-cast assertion.
- **Files modified:** `src/modules/public-stats/routes/pagination/keyset.ts`,
  `src/modules/public-stats/routes/pagination/keyset.test.ts`
- **Commit:** `3c9f4cb` (fix) / `42afe79` (test)

**2. [Rule 2 - Missing coverage] Targeted tests to hold the 100% gate**
- Added `filters.test.ts` (valid-cursor decode, null sort boundary, leaderboard
  per-surface cursor decoding), squad kills/teamkills + no-rotation bounty
  overflow paths, the leaderboards per-surface after branch, and a route test
  for the non-`BadCursorError` re-throw (500). One genuinely-unreachable
  defensive throw in `sortDescriptor` got a `/* v8 ignore */` (project pattern).

### Environment automation (not a plan deviation)
- The Docker Compose dev stack (Postgres 15432, RabbitMQ 5673, MinIO 9000) was
  down at session start; brought up via `docker compose up -d` so
  `db:migrate` / `test:integration` could run (Claude does all automation).
- The stale `steam-alpha` profile assertion in `postgres.test.ts` was updated to
  the 14-02 masked form `...lpha` (masking now applies to all SteamIDs).
- Prettier normalized line-wrapping in three already-committed Wave-1 test files
  (`cursor/mask/sort.test.ts`) — formatting only, committed to keep the tree clean.

## Verification

All green under Node v22 (the `>=25 <26` engine WARN is the documented STATE.md
environment caveat, not a failure):

- `pnpm run verify` — format, lint, strict typecheck, **321 tests**, integration,
  openapi:check, ops:backup/boundary checks, **coverage 100%** (statements/
  branches/functions/lines all 100%).
- Cross-page-boundary keyset stability proven on real PostgreSQL (asc + desc,
  shared values + id tie-breaker).
- Steam64 leak guard covers the malformed-cursor 400 error path + a real-pg
  seeded-profile body.
- Exported OpenAPI list-response schemas carry no `page`/`pageSize`/`total` and
  zero `7656119\d{10}` (JSON-scoped assertion).
- No new entry in `package.json` dependencies/devDependencies.

## Self-Check: PASSED

- `src/infra/db/migrations/0005_keyset_indexes.sql` — FOUND
- `src/modules/public-stats/routes/filters.test.ts` — FOUND
- `src/openapi/contract.test.ts` — FOUND
- Commit `3c9f4cb` (feat) — FOUND
- Commit `42afe79` (test) — FOUND
- Commit `fdd507e` (chore: openapi) — FOUND
