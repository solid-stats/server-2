---
phase: 15-profile-parity-stats
reviewed: 2026-06-07T09:40:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - src/modules/public-stats/repository.ts
  - src/modules/public-stats/routes/empty-read-model.ts
  - src/modules/public-stats/routes/models.ts
  - src/modules/public-stats/routes/pagination/sort.ts
  - src/modules/public-stats/routes/routes.ts
  - src/modules/public-stats/routes/schemas.ts
  - src/modules/public-stats/routes/tests/fixtures.ts
  - src/modules/public-stats/routes/tests/players.test.ts
  - src/modules/public-stats/routes/tests/squads.test.ts
  - src/modules/public-stats/tests/postgres.test.ts
  - src/modules/public-stats/tests/schemas.test.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Review — Phase 15 (Profile Parity Stats)

**Scope:** Diff `b4ce383..HEAD` on `src/**` + `openapi/**`. Per-player and per-squad parity sub-resource routes (`weapons`/`vehicles`/`relationships`/`weekly`), extracted shared parity-SQL (`parity-sql.ts`), extended player/squad stats payloads, and the regenerated OpenAPI artifact.
**Gates:** `vitest run src/modules/public-stats` → 164 passed (11 files). PG-backed `postgres.test.ts` → 46 passed against live PostgreSQL (localhost:15432). Typecheck/lint not run in isolation (no source-level type errors observed during review).

## API contract
✅ All five new public routes (`/stats/players/:id/{weapons,vehicles,relationships,weekly}`, `/stats/squads/:id/{weapons,relationships,weekly}`) declare `params` + `200` + `404` response schemas. The OpenAPI artifact was regenerated and contains every new path. Extended `PlayerStatsResponse`/`SquadStatsResponse` add fields only (additive); `web` is a new consumer so no breaking-shape risk.
⚠️ Relationship-entry `player.id` is typed `format: "uuid"` in the contract but the server can emit a non-UUID (see finding 1) — contract inaccuracy, not a generated-client break.

## Blockers 🔴
_none_

## High 🟠
_none_

## Medium 🟡
1. `src/modules/public-stats/routes/schemas.ts:75,176` + `repository.ts:534-547,644-663` [contract] — `PlayerRelationshipEntry`/`SquadRelationshipEntry` declare `player.id` as `Type.String({ format: "uuid" })`, but the relationship target id comes from the `relationshipsSql` COALESCE chain (`parity-sql.ts:184-213`): `coalesce(steam_player.id::text, nickname_player.id::text, display_player.id::text, nullif(payload#>>'{player,name}',''), observed_player_ref)`. When a kill victim does not resolve to a canonical player, `target_player_id` is a raw player **name** or in-replay **ref** — not a UUID. The `where ... target_player_id is not null` guard does not constrain it to UUID shape. fast-json-stringify ignores `format` on serialization, so this won't 500, but the generated `web` client will type `id` as a uuid string while the API can return arbitrary text. Either narrow the SQL to only emit canonical UUIDs (and drop unresolved targets), or relax the schema to `Type.String()` and document that an unresolved target id is opaque. Not a Steam64 leak — the chain never selects `steam_id`. — [conv: schemas-and-data → TypeBox; correctness → Contract compliance]

## Low 🔵
2. `src/modules/public-stats/repository.ts:748-761` [async/perf] — `loadMemberRows` issues one full parity query **per squad member** (parallelized via `Promise.all`), and each query re-runs the heavy `PLAYER_ENTITY_CTE` over the entire `parser_events` table. For a large squad this is N full-table CTE scans on a public read path where a single `entity.player_id = ANY($1::text[])`-scoped query would suffice. Performance is out of v1 review scope and there is no measured hot path yet, so this is flagged for awareness only; if squad sizes grow, fold the per-member fan-out into one array-scoped query. — [conv: correctness → Async safety / N+1]

3. `src/modules/public-stats/repository.ts:604,639,683` [types] — `loadMemberRows`'s `extractRows` callbacks use `result.rows as ParityWeaponRow[]` / `as ParityRelationshipRow[]` / `as ParityWeekRow[]`. The helper types `result` as `{ rows: unknown[] }` and the inner `this.pool.query(sql, values)` (line 756) is the untyped `pg` overload, so the row shape is asserted, not checked. Prefer a generic `this.pool.query<TRow>(...)` so the type flows from the call site instead of an `as`-cast. — [conv: correctness → Contract compliance (no `as` to satisfy a contract)]

4. `src/modules/public-stats/repository.ts:498-505` [comments] — the `/* v8 ignore */` notes claim `statsRow`/`mappedStats` are "always defined", and the empty-branch test `getPlayerVehicles(edgePlayerAId)` (postgres.test.ts:1243) does reach this code with a real (zero-valued) row — `playerStatsSql` returns a row for any existing canonical player. The `?? 0` fallbacks are genuinely unreachable (statsRow defined), so the ignore is correct, but the comment "mappedStats is always defined" reads as if no test exercises zeros. Minor: tighten the comment to "row present, counter sums coalesced to 0 for players with no events." — [conv: correctness → Comments]

5. `src/modules/public-stats/repository.ts:1` [style] — file-level `/* eslint-disable max-lines, max-params, no-magic-numbers, unicorn/no-null */`. `max-params` is disabled but the only multi-param free function is `count(pool, tableName, where, values)` (4 params, under the 5 threshold) and `keysetSeek` (4). The `max-params` disable looks unused now; drop it to keep the blanket-disable honest, or confirm it is needed by a helper I did not flag. — [conv: SKILL §B; correctness → Imports/lint hygiene]

## Non-Findings Checked
- **SQL injection / parameterization:** All five parity builders take `scopeId` only via `valuesFor(scope)` → bound `$1`; the `predicate()` helper appends a fixed `where ... = $1::uuid|text` fragment with no interpolation of the value. `loadMemberRows` passes `member.id` as a bound param. No string concatenation of caller input anywhere in `parity-sql.ts` or the new repository methods. Sort is server-whitelisted (`sort.ts`), never echoed into SQL.
- **Steam64 masking:** No new path emits `steam_id`. Player profile still masks via `maskSteamId` (`mask.ts`); relationship/weapon/weekly payloads carry only canonical id + display name. The two integration leak-guards (`/7656119\d{10}/`, postgres.test.ts:937,1063) assert no Steam64 in any parity body or 404. Confirmed.
- **Byte-identical parity invariant:** `legacy-export.ts` now derives `PLAYER_STATS_SQL`/`SQUAD_STATS_SQL`/`RELATIONSHIPS_SQL`/`WEAPONS_SQL`/`WEEKS_SQL` from the same `parity-sql.ts` builders the API hot paths call (`playerStatsSql`/`weaponsSql`/`relationshipsSql`/`weeksSql`). Per-player surfaces reuse the legacy `mapWeapons`/`mapRelationships`/`mapWeeks` + `sortWeapons`/`sortRelationships`/`sortWeeks`, so single-player output matches the bulk export. Squad surfaces are documented member-level aggregations (no legacy squad-level formula exists — 15-CONTEXT Q3) and recompute `kdRatio`/`score` via the shared `parity-formulas.ts`.
- **404 / error handling:** Every parity route returns a fixed-string 404 with no id echo; `mapPublicStatsError` maps only `BadCursorError` → 400 and re-throws everything else (players.test.ts:239 proves the 500 re-throw). The `:id` param is `format: "uuid"` so a malformed id is rejected at validation before reaching the read model.
- **Squad existence vs empty:** `getSquad{Weapons,Relationships,Weekly}` correctly distinguish "squad missing" (→ null → 404) from "squad exists but no members/events" (→ empty payload) via the `members.length === 0 && !squadExists(id)` guard; both branches are covered by edge tests.

## Validation Gaps
- Standalone `tsc --noEmit` and ESLint were not run as separate gates; review relied on reading the changed files and the passing Vitest suite (which compiles via the test transform). Recommend confirming the project's lint/typecheck gate before merge.
- Finding 1's non-UUID relationship-target case is reasoned from the SQL, not reproduced with a seeded unresolved-victim row; the existing fixtures all resolve victims to canonical players, so the inaccurate-id path is untested.

## Verdict
REQUEST CHANGES — one Medium (finding 1: relationship `player.id` contract/SQL mismatch) should be resolved before merge (mandatory). Findings 2-5 are nice-to-have cleanups. No blockers; SQL is fully parameterized, Steam64 masking holds, and the parity invariant is preserved for the per-player surfaces.

---
_Reviewed: 2026-06-07T09:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
