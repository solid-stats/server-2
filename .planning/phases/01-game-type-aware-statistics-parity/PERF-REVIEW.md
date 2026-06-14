# Review — branch fix/perf-large-bucket-identity vs master (ebdc4ea)

**Scope:** Single commit 34aae9d — behavior-preserving perf fix for statistics recalc.
Files changed: `repository.ts`, migration `0010_...sql`, 4 test files (+2 new).
Focus: byte-identity of aggregate output across all three changes (F3 identity index, F4 set-based resolve, F5 batched inserts).

**Gates:**
- API contract: ✅ No route or schema touched — internal repository functions only. No OpenAPI impact.
- Layer/DI: ✅ All changes stay inside `src/modules/statistics/repository/`. No cross-module import changes, no DI wiring changed.
- Migration: ✅ `IF NOT EXISTS`, functional index only, additive, 0009 untouched.

---

## Blockers 🔴

_none_

---

## High 🟠

_none_

---

## Medium 🟡

### 1. `repository.ts:919` [correctness] — `display_name` indexed unconditionally for ALL loaded identities, including steam-id-only matches

`buildPlayerIdentityIndex` calls `pushTo(byLowerName, identity.display_name.toLowerCase(), entry)` for every row, regardless of how `loadPlayerIdentities` fetched it. A row fetched only because `psi.steam_id = any($steamIds)` (no display_name or nickname match against observed names) gets bucketed under its display_name in `byLowerName`. When a player's `player.n` happens to equal that display_name, it surfaces as a candidate — `playerIdentityMatchPriority` then returns `DISPLAY_NAME_MATCH_PRIORITY` and the row gets selected.

**This is not a regression:** the old `bestPlayerIdentity` O(n) scan ran `playerIdentityMatchPriority` against ALL loaded identities including steam-id-fetched ones, so the display_name match would have fired there too. Behavior is identical.

The risk is that the comment in the JSDoc ("candidates are only the rows indexed under the player's steam id and lower(name)") implies the index is narrow, but it's actually wider than stated — every row's display_name is indexed regardless of whether it is an observed name. If `loadPlayerIdentities` later changes to fetch additional rows (e.g. by relation), the index could surface false candidates where the old scan would too — so parity is still preserved, but the index is silently broader than its documentation claims.

**Fix:** Narrow the JSDoc claim or, if tighter correctness guarantees are desired in future, track which keys were "observed names" separately. No code change required for current behavior.

### 2. `repository.ts:1369` [correctness] — `JSON.stringify(row.stats)` changes serialization path for jsonb

Old per-row insert passed `row.stats` (a plain TS object) directly as a pg parameter. pg serializes TS objects to JSON automatically when the column is `jsonb`. New insert does `JSON.stringify(row.stats)` and passes the string; pg accepts pre-serialized JSON strings for jsonb columns.

Both produce the same stored JSONB, **but** if `row.stats` ever contains a value that `JSON.stringify` handles differently from pg's own object serialization (e.g. a `Date` property — `JSON.stringify` produces `"2024-..."` while pg may coerce differently, or a `toJSON()` override), the results would diverge. Current `stats` type (`PlayerAggregateRow.stats`) has only `number` and `version: 1` fields, so no divergence today.

The same applies to `JSON.stringify(row.inputs)` for bounty (line 1465) — `BountyPointRow.inputs` has `number` and literal fields only, so no divergence today.

**Fix:** Document the pre-serialization assumption in a comment, or assert in the test that the round-tripped JSON equals the original object. Low urgency given current types. Also applies at `repository.ts:1388` (squad stats) and `repository.ts:1465` (bounty inputs).

### 3. `repository.ts` [correctness] — `ensureNameFallbackIdentities` OR-split drops the `cp.id = pn.player_id` join in the nickname EXISTS, widening the match set

Old query:
```sql
left join player_nicknames pn on pn.player_id = cp.id
where lower(cp.display_name) = lower(occ.name)
   or (lower(pn.nickname) = lower(occ.name) and ...)
```
The `cp.id = pn.player_id` join scoped the nickname side to nicknames belonging to the same canonical player as the display_name side. The new second EXISTS:
```sql
exists (select 1 from player_nicknames pn where lower(pn.nickname) = lower(occ.name) and ...)
```
has no join to `canonical_players` — it matches any nickname row across all players.

**This is semantically equivalent for the function's purpose:** the question asked is "does this (name, ts) occurrence already have SOME canonical identity?" not "is it the same canonical player for both halves?" The widened second EXISTS can only ever mark MORE occurrences as already-covered (potentially preventing duplicate canonical_player creation), never fewer. So it is at least as conservative as the old query.

**However**, if a nickname exists that matches `occ.name` in the window but belongs to a player whose display_name is unrelated, the old query would NOT have matched that occurrence (because the outer EXISTS required a single cp row satisfying BOTH display_name OR nickname via the join), while the new EXISTS DOES match it. This means the new code could skip creating a canonical_player for a name that the old code would have created one for.

**Worked example:** Suppose no canonical_player has `lower(display_name) = 'ace'`, but a player_nicknames row exists with `nickname = 'ace'` in the active window. Old code: `exists (select 1 from cp left join pn on pn.player_id = cp.id where lower(cp.display_name) = 'ace' or (lower(pn.nickname) = 'ace' and ...))`. The first half of the OR is never satisfied (no cp has display_name 'ace'). For the second half to fire, there must be a `cp` row such that `pn.player_id = cp.id AND lower(pn.nickname) = 'ace'` — this EXISTS fires if the player with nickname 'ace' exists in canonical_players (which they do by assumption). So the old query ALSO finds this match. **The semantic widening is a non-issue in practice** because `player_nicknames.player_id` always references a `canonical_players.id` (FK), so any pn row's `player_id` always has a matching cp row — the old LEFT JOIN was redundant for the OR's right side.

The comment in the code states "identical to the original OR" which is correct given the FK constraint. But the analysis relies on the FK being enforced — worth a brief comment noting this.

**Fix:** Add a comment noting that the second EXISTS omits the cp join because `player_nicknames.player_id` is an FK to `canonical_players.id`, making the join redundant for EXISTS purposes.

---

## Low 🔵

### 4. `repository.ts:886-927` [naming] — `IndexedIdentity` interface is unexported but `PlayerIdentityIndex` and `buildPlayerIdentityIndex` are exported; `IndexedIdentity` appears in the public `PlayerIdentityIndex` type indirectly only through the `Map` value type

`PlayerIdentityIndex` exposes `Map<string, IndexedIdentity[]>` in its public interface, meaning callers who import `PlayerIdentityIndex` will encounter `IndexedIdentity` in inferred types but cannot name it. `IndexedIdentity` should either be exported alongside the other two or the maps should be typed with an inline type (the intent is the latter). Minor since no external consumer currently destructures the maps.

### 5. `tests/batched-write.test.ts:474` [tests] — `countQueries(client, "select occ.idx")` is a prefix match but the actual SQL starts with multiple leading newlines

`ScriptedClient.query` trims SQL (`sql.trim()`) before storing in `queries`. The actual query SQL added in this diff starts with `\n      select occ.idx` — after trim it starts with `select occ.idx`. `countQueries` uses `startsWith("select occ.idx")`. This is correct; the trim makes it safe. No bug, but a future SQL reformatting (e.g. adding a CTE before the SELECT) would silently break the count assertion without a compile error. Note for future maintainability.

### 6. `insert-assertions.ts:20-33` [tests] — `bountyInsertRows` re-zips with unchecked array lengths

The function destructures `[rotationId, gameType, playerIds, points, inputs]` and zips on `inputs.map((inputJson, row) => [..., playerIds[row], points[row], ...])`. If `playerIds` or `points` is shorter than `inputs` (a param count regression), `playerIds[row]` silently returns `undefined` instead of failing fast. The test then asserts on the re-zipped row, and the undefined would propagate without a clear assertion failure pointing at the mismatch.

**Fix:** assert `playerIds.length === inputs.length && points.length === inputs.length` before the zip, or use `zip`-style utility that throws on length mismatch.

---

## Non-Findings Checked

- **Identity tie-break (first-in-array on equal priority):** The new `toSorted` secondary key `left.candidate.order - right.candidate.order` (ascending order = earlier array element wins) correctly reproduces the stable sort behavior of the old code. The `order` field is set from `identities.entries()` (0-based insertion order), so the tie-break is byte-identical. ✓

- **Inactive nicknames not matching:** `buildPlayerIdentityIndex` indexes ALL nicknames (active or not) under `byLowerName`. When an inactive nickname is a candidate, `playerIdentityMatchPriority` returns `undefined` (nickname window check fails, display_name check also fails for a name-mismatch) and the candidate is excluded via `flatMap`. The test at `identity-index.test.ts:725` (player `eid:4, n:"Char"` — expired nickname) confirms this. ✓

- **`ensureNameFallbackIdentities` timestamp parameter:** `occ.ts` is correctly bound to `$2::timestamptz[]` (the `replayTimestamp` per occurrence), and the correlated nickname window check `pn.observed_from <= occ.ts` is a proper lateral reference. PostgreSQL allows outer-query column references in EXISTS subqueries. ✓

- **Batched unnest column order vs INSERT column list:** All three new unnest inserts specify explicit column lists in the INSERT clause (`insert into player_stats (rotation_id, player_id, stats, game_type, is_show)`) and the SELECT uses named aliases from the `as data(...)` clause — no positional dependency that could silently swap columns. ✓

- **Empty arrays / empty loop equivalence:** All three batched inserts are guarded by `.length > 0`; an empty input produces no INSERT, exactly matching the old empty `for` loop. ✓

- **`player_id` nullable in `commander_side_stats`:** `aggregates.map((row) => row.playerId)` produces `(string | undefined)[]`; the cast `$3::uuid[]` accepts NULL positionally via unnest. The test `commander.test.ts:593` confirms `[null]` is the first element when commander has no resolved identity. ✓

- **`display_name` non-nullable in `PlayerIdentityRow`:** TypeScript types `display_name: string` (not `string | null`), so `identity.display_name.toLowerCase()` in `buildPlayerIdentityIndex` is safe — no null-dereference risk. ✓

- **Migration 0009 untouched:** Diff touches only 0010 (new file). Migration sequence is intact. ✓

---

## Verdict

**APPROVE**

No blockers, no high findings. The three medium findings (1, 2, 3) are documentation/future-proofing concerns — the code is correct for all current inputs. Finding 3 (OR-split FK analysis) is the highest-risk item and is proven equivalent given the FK constraint. The identity index, tie-break, and batched inserts are all byte-identical to the original for every reachable input.

Mandatory before merge: none.
Optional follow-up: findings 1, 2, 3 (comment clarity), 6 (test robustness).
