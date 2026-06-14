# Phase 1 (Parity): Game-Type-Aware Statistics — Research

**Gathered:** 2026-06-14 (two codebase scouts: server-2 stats model + legacy sg-replay-parser rules).
Pre-supplied to the planner — no separate research agent needed.

## A. server-2 current statistics model (what changes)

### Aggregate tables (migration `0001_v1_domain_schema.sql`), all keyed by rotation only — no type:
- `player_stats(id, rotation_id FK rotations, player_id FK canonical_players, stats jsonb,
  calculated_at)`, `unique (rotation_id, player_id)`.
- `squad_stats(...)`, `unique (rotation_id, squad_id)`.
- `commander_side_stats(id, rotation_id, player_id, side text, known_wins/known_losses/
  unknown_outcomes, calculated_at)` — one row per (rotation, player, side), no explicit unique.
- `bounty_points(id, rotation_id, player_id, points numeric(12,2), inputs jsonb, calculated_at)`,
  `unique (rotation_id, player_id)`.
- `rotations(id, name unique, starts_at, ends_at nullable, ...)`.
- `rotation_id` is `NOT NULL` on all four → **the migration must make it nullable** for the all-time
  bucket (CONTEXT D1).

### Mission / game-type source
- No `game_type` anywhere today. `mission_name` lives in the parser artifact:
  `parser_results.raw_snapshot.replay.mission` (also `missionName`/`world`/... — see
  `public-stats/replay-mapper.ts` `extractMapName`, candidate keys `mission, missionName, world,
  worldName, map, mapName`). Used only for the public replay map label; never aggregated.

### Recalc flow (where to inject type grouping)
- `repository.ts` `loadAggregateReplayInputs(client, rotationId)` selects current parser_results
  `where r.rotation_id = $1 and pr.status='current'` → grouping is **rotation-only**.
- `replaceAggregateRows(client, rotationId, aggregates)` deletes+inserts `where rotation_id=$1` —
  add `game_type` to the key, and handle the all-time (rotation_id NULL) bucket.
- Rotation assignment is already set-based: `full-run.ts` `assignRotationsForCurrentReplays()` (one
  correlated `UPDATE replays SET rotation_id=...`). **Mirror this for a `game_type` classification
  UPDATE/step.** F7 added `recalculate*ForRotation`; this phase adds the type dimension + an all-time
  pass. F7/FW2 already made the rotation loop and identity resolution set-based.
- No **all-time** aggregation path exists today — must be added (sg all-time + mace/sm all-time).

### Contracts to extend (parity path only)
- `export/legacy-public-export.ts` shape: `{ playerGlobalStats, rotationStats[], squadStats,
  otherPlayers, weapons, weeks, ... }`; `rotationStats` keyed per rotation. `otherPlayers` is the
  is_show split (CONTEXT D3).
- `repository/parity-sql.ts` `playerStatsSql()` / `squadStatsSql()` join `player_stats`/`squad_stats`
  with no type filter; `repository/legacy-export.ts` `ROTATION_STATS_SQL` groups per rotation. All
  must gain a `game_type` filter/dimension.
- Public HTTP routes (`public-stats/routes/*`, schemas `PlayerStatsResponse`, etc.) and the generated
  `openapi/server-2.openapi.json` are **OUT of scope** — keep contract diff empty.

### Tests that pin current type-agnostic behavior (expect updates)
- `service/tests/aggregates.test.ts` (in-memory aggregates), `repository/tests/index.test.ts`,
  `repository/tests/postgres.test.ts` (real-pg parity harness — extend for per-type), `full-run.test.ts`,
  `export/tests/legacy-public-export.test.ts`, `repository/tests/parity-sql.test.ts`.

## B. Legacy sg-replay-parser rules (exact spec to port)

1. **Types** (`0 - consts/gameTypesArray.ts`): `['sg','mace','sm']`, lowercase, fixed order.
2. **Classification** (`1 - replays/getReplays.ts`): keep replay iff
   `mission_name.startsWith(gameType) && !mission_name.startsWith('sgs')` — prefix, case-sensitive, no
   separator required (`sg_x`, `sg123`, `mace2`, `sm1` all match). Anything `sgs*` excluded for all.
   Dedup `uniqBy(filename)` before filtering.
3. **sm date filter** (`index.ts`): for `sm`, drop replays with `date` not
   `isAfter('2023-01-01','month')` → sm before 2023-01-01 excluded. No date filter for sg/mace.
4. **mace min players** (`workers/parseReplayWorker.ts`): for `mace`, if a parsed replay has
   `result.length < 10` distinct players → the **whole replay is skipped**. None for sg/sm.
5. **Rotations = sg only** (`index.ts`): `getStatsByRotations` runs only when `gameType==='sg'`; mace/sm
   get `byRotations=null` (all-time only).
6. **filterPlayersByTotalPlayedGames** (`0 - utils/filterPlayersByTotalPlayedGames.ts`):
   `minGamesCount=20`; if `gamesCount<125` (scope's replay count) → `minGamesCount = (15*gamesCount)/100`
   (15%). `condition = totalPlayedGames >= minGamesCount`. Mode `'not show'` → sets `isShow` true/false
   (does NOT remove). Applied to **global per-type** (all 3 types) and to **per-rotation for sg**.
7. **Rotations dates** (`0 - utils/rotations.ts`): 20 hardcoded ISO start dates, each
   `.startOf('isoWeek')` (Monday UTC); each window = start .. (next start − 1 day endOf day); last
   open-ended. Dates: 2020-09-14, 2021-01-11, 2021-05-31, 2021-11-01, 2022-02-28, 2022-07-04,
   2022-10-03, 2023-01-09, 2023-04-03, 2023-07-03, 2023-10-02, 2024-04-08, 2024-07-01, 2024-10-01,
   2024-12-30, 2025-04-01, 2025-07-01, 2025-10-01, 2026-01-05, 2026-03-30. **Verify server-2's seeded
   `rotations` match these snapped-to-isoWeek** (CONTEXT must-verify).
8. **includeReplays.json** (3): `[{name:"Red Dawn",gameType:"sg"},{name:"Unorthodox Methods",sg},
   {name:"Nuclear Danger",sg}]` — force the type for prefix-less missions (missions with an `@`
   separator bypass the list and use the explicit prefix).
9. **excludeReplays.json** (16 replay links, e.g. `/replays/1662231981`): removed entirely from all
   stats, all types. (One duplicate in the list — dedupe on load.)
10. Order: fetch → applyInclude (prepend type if prefix missing) → applyExclude → parse → per-type
    filters → stats. Stateless config reads.

## C. Pitfalls

- **rotation_id NULL uniqueness**: default Postgres NULL-distinct lets duplicate all-time rows slip in.
  Use `UNIQUE NULLS NOT DISTINCT` (PG15+) or partial unique indexes (CONTEXT D1).
- **mace<10 needs player count**, not just mission_name — fold into the recalc classification step
  where players are resolved, not a pure SQL UPDATE on mission text.
- **Threshold scope** for is_show: `gamesCount` is the *scope's* replay count (per-rotation games for
  sg rotations; per-type total for all-time), not the global corpus — compute per scope at recalc.
- **Byte-parity discipline** (per F7/FW2): extend the real-pg comparison test
  (`repository/tests/postgres.test.ts`) to prove per-type aggregates + the all-time bucket + is_show
  split match the legacy semantics; keep the single-replay audit path and report shape intact.
- **Canonical game_type ⇒ migration + backfill**: existing aggregate rows are type-agnostic; expect a
  one-time backfill/recompute. Reprocessing may overwrite derived results, but moderation audit
  patches MUST be preserved (project constraint).
- **Cross-app**: none for this slice — mission_name, replays, and the 20 rotations are already in
  server-2; replays-fetcher and the web/OpenAPI contract are untouched.
