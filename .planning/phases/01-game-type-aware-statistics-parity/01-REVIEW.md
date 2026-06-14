---
phase: 01-game-type-aware-statistics-parity
reviewed: 2026-06-14T00:00:00Z
depth: deep
files_reviewed: 10
files_reviewed_list:
  - src/infra/db/migrations/0008_game_type_aggregates.sql
  - src/modules/statistics/game-type/classify-game-type.ts
  - src/modules/statistics/game-type/game-type-config.ts
  - src/modules/statistics/game-type/is-show.ts
  - src/modules/statistics/repository/full-run.ts
  - src/modules/statistics/repository/repository.ts
  - src/modules/statistics/repository/legacy-export.ts
  - src/modules/statistics/repository/parity-sql.ts
  - src/modules/statistics/service/full-run-recalculation.ts
  - src/test/integration/schema.test.ts
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Review — feat/parity-phase-01-game-type-stats (Phase 1: Game-Type-Aware Statistics, Parity)

**Scope:** `git diff master..HEAD -- . ':!.planning'` (base `c334f45`). Parity-critical backend change feeding the legacy-export the parity-driver diffs against. Reviewed against CONTEXT D1–D4, RESEARCH §B legacy spec, and the `solidstats-server-ts-code-review` ruleset.
**Gates:** `pnpm verify` not run (read-only review). OpenAPI contract: no public route/schema files in the diff — contract diff is empty (verified by inspection, no `public-stats/routes` or `openapi/*.json` touched).

## API contract
✅ No public route, zod schema, or `openapi/server-2.openapi.json` change in the diff. The recalc/legacy-export/parity-sql surfaces are internal; the additive `allTimeAggregateRows?` / report fields are optional, so existing `ops:stats:recalculate` consumers are unaffected. Contract gate passes.

## Blockers 🔴

1. `src/modules/statistics/repository/repository.ts:92-136, 1211-1230` [correctness/parity] — **The single-replay audit path corrupts the per-type bucket after classification.** `recalculatePlayerAndSquadStatsForParserResult` (and the commander/bounty siblings) load `loadAggregateReplayInputs(client, rotationId)` — which is *type-agnostic*, selecting **every** current replay in the rotation regardless of `game_type` — but then write the result through `replayRotationScope`, whose `scope.gameType` is the *triggering replay's* persisted `game_type` (e.g. `'sg'`). So a moderator-triggered patch on one `sg` replay runs `delete from player_stats where rotation_id = $r and game_type = 'sg'` and re-inserts a **mixed all-types (sg+mace+sm+other) aggregate into the `sg` bucket**. After a full run has classified replays, the very first audit recompute silently destroys the sg per-rotation parity bucket the parity-driver compares against. This is the CONTEXT "must-verify: existing single-replay audit path preserved" gate, and it is broken. Pre-phase this was safe because `game_type` was always NULL (one bucket). Fix: the audit path must either load type-filtered inputs matching the write scope (use `loadScopedAggregateReplayInputs` with the resolved scope) **or** the write scope must stay `gameType: null` and only ever touch the legacy single bucket — it cannot load one set and persist it under a different key. This is reachable live via `requests/routes/audit-recalculator.ts` → `recalculateForPatch`. — [conv: layers → Repositories; std: correctness → Contract compliance]

2. `src/infra/db/migrations/0008_game_type_aggregates.sql:1-62` + `src/modules/statistics/repository/repository.ts:1245-1289` [data integrity/parity] — **No backfill or cleanup of pre-migration aggregate rows; a full recalc leaves stale `game_type IS NULL` per-rotation rows that the public path then double-counts.** Existing `player_stats`/`squad_stats`/`commander_side_stats`/`bounty_points` rows keep `game_type = NULL` after the migration. The full-run rebuild deletes only the bucket it writes (`game_type is not distinct from 'sg'`), so it never deletes the old `(rotation_id set, game_type NULL)` rows. They survive every recalc. The parity legacy-export masks this because it filters `game_type = 'sg'`, but the **public-stats hot path** (`parity-sql.ts` with `bucket = undefined`) sums *all* `player_stats` rows for a player — old NULL per-rotation rows **plus** the new `sg` per-rotation rows **plus** the new `sg` all-time row — triple-counting kills/games for any migrated production DB. CONTEXT D-discretion explicitly calls for "a one-time backfill + recompute" and "moderation audit patches must be preserved"; the migration ships neither a backfill nor a cleanup of the now-orphaned NULL-type rows. The real-pg parity harness never catches this because it `truncate`s all four tables before each scenario (`postgres.test.ts:67,781,874,959`), so the migrate-on-existing-data path is untested. Fix: add a one-time `delete from <aggregate> where game_type is null and rotation_id is not null` (or a documented full re-truncate-and-recalc) to the migration, and add a harness case that seeds pre-phase NULL-type rows before recalc. — [std: correctness §AB; conv: schemas-and-data → migrations]

## High 🟠

3. `src/modules/statistics/repository/repository.ts:561-571, 911-926` [correctness/perf] — **O(n²)–O(n³) identity resolution on the single huge all-time bucket** (the parity-driver's flagged concern). `aggregateInputsFromRows` calls `resolvedPlayers` per replay, which calls `bestPlayerIdentity(input.identities, …)` per player, which `.flatMap`s over the **entire** `identities` array (every canonical player matched by any name/steam-id in the bucket) and then `.toSorted()`s. For the all-time `mace` bucket (~20735 replays × ~tens of players × |identities| in the thousands) this is a full scan per player on every replay. Same shape in `commanderIdentities`. A dedicated perf fix is planned, but flagging as agreed: build a `Map` keyed by lower(name)/steam_id once per bucket and look up in O(1) instead of scanning. — [std: correctness §AB — resource lifecycle / O(n²)]

4. `src/modules/statistics/repository/repository.ts:685-726, 728-759` [correctness/perf] — **Identity load join fans out and the fallback `where exists` correlated subquery won't scale on the all-time bucket.** `loadPlayerIdentities` joins `canonical_players ⨯ player_steam_ids ⨯ player_nicknames` with no aggregation, so a player with N steam-ids and M nicknames yields N×M rows, all shipped to Node and re-scanned by finding 3. `ensureNameFallbackIdentities` runs a `where exists (… canonical_players left join player_nicknames …)` over an `unnest` of *every distinct (name, ts)* occurrence in the 20735-replay bucket — a correlated existence probe per occurrence with no supporting index named in the migration on `lower(player_nicknames.nickname)` / `lower(canonical_players.display_name)`. Confirm a functional index exists (none added this phase); without it this is a sequential scan per occurrence. — [std: correctness §AB]

5. `src/modules/statistics/repository/repository.ts:1265-1289` [correctness/perf] — **Per-row `INSERT` loop for the all-time buckets.** `replaceAggregateRows` / `replaceCommanderRows` / `replaceBountyRows` issue one `await client.query(insert …)` per aggregate row inside the request transaction. For the mace all-time bucket that is one round-trip per player/squad — thousands of sequential awaits holding the transaction open. The classification UPDATE (`full-run.ts:152`) and the fallback inserts (`repository.ts:792-823`) already use the multi-row `unnest` pattern; the replace inserts should too. (Out of strict v1 perf scope but contiguous with the parity-driver's large-bucket flag.) — [std: correctness → Async safety; conv: schemas-and-data → batch inserts]

6. `src/modules/statistics/repository/legacy-export.ts:199-251` [parity] — **Rotation `total_games` ignores `game_type`, but the rotation player/squad payloads filter `game_type = 'sg'`.** `ROTATION_STATS_SQL` computes `count(distinct replay.id)` over `replays … where replay.rotation_id = rotation.id and replay.status = 'parsed'` with **no game-type filter**, so `totalGames` counts mace/sm/other/excluded replays in the window, while the nested `players`/`squads` aggregate only `sg`. Legacy `getStatsByRotations` runs for `gameType === 'sg'` only and its rotation game count is the sg-scoped count. This makes the new-side `rotationStats[].totalGames` larger than legacy whenever a rotation window contains non-sg replays — a parity divergence on a field the driver diffs. Fix: filter the `left join replays` to `replay.game_type = 'sg'` (and reconcile with `status = 'parsed'`, since classification keys off `parser_results.status='current'`, not `replays.status`). — [std: correctness → Contract compliance]

7. `src/modules/statistics/repository/legacy-export.ts:248` [parity] — **`replay.status = 'parsed'` vs `parser_results.status = 'current'` mismatch for the rotation game count.** Every aggregate/classification path in this phase scopes replays by `parser_results.status = 'current'` (`repository.ts:586`, `full-run.ts:143`). The rotation `total_games` here instead counts `replays.status = 'parsed'`. A replay can be `parsed` without a `current` parser_result (superseded/failed), or `current` without `replays.status='parsed'`, so the displayed rotation game count can disagree with the count the aggregates were actually built from — and with the legacy scope count. Align the denominators. — [conv: layers → Repositories]

## Medium 🟡

8. `src/modules/statistics/repository/repository.ts:1211-1230, 36-38` [correctness] — **Audit-path scope can manufacture per-rotation rows for `mace`/`sm`, which D1 says must be all-time only.** Independent of finding 1: `replayRotationScope` always returns `kind: "rotation"` with `gameType` = the replay's persisted type. If a moderator patches a `mace` replay, the audit recompute writes `(rotation_id set, game_type='mace')` rows — but CONTEXT D1 mandates mace/sm get **all-time rows only, no per-rotation**. This pollutes the schema with rows no export reads and that the all-time pass never deletes. The audit path must resolve the correct scope kind per game type (or stay on the NULL legacy bucket per finding 1). — [conv: schemas-and-data → data model invariants]

9. `src/modules/statistics/repository/repository.ts:1276` [parity] — **`is_show` is computed only for the write scope, but the audit path reuses the legacy single-bucket write with a type-agnostic `scopeGames`.** `computeIsShow(row.stats.replay_count, games)` uses `scopeGameCount` of the *loaded* inputs. On the audit path (finding 1) `games` is the count of all-types replays in the rotation, not the sg-scoped count, so even after fixing the bucket key the threshold denominator would be wrong unless the inputs are type-filtered. Worth an explicit test pinning is_show on the audit path. — [std: correctness → Contract compliance]

10. `src/modules/statistics/repository/legacy-export.ts:118-122` (`parity-sql.ts:118-122`) [parity] — **`bool_or(stats.is_show)` over the bucket join is correct only because the all-time bucket has exactly one row per player; document/guard the assumption.** The global `playerStatsSql` bucket path `coalesce(bool_or(stats.is_show), true)`. If the NULL-type stale rows from finding 2 leak into this join (they can't today only because of the `game_type = 'sg'` predicate), `bool_or` would silently OR an unrelated row's is_show. Low risk given the predicate, but the correctness hinges entirely on finding 2 being fixed. Note in a Non-Findings/assumption comment. — [std: correctness → Contract compliance]

11. `src/modules/statistics/game-type/game-type-config.ts:41-58` [parity/quality] — **The deduped exclude set silently drops the duplicate, but the count is not asserted against the legacy "16 entries, one duplicate → 15 distinct" contract in this module.** The comment claims 16 raw / 1 duplicate (`/replays/1612798741`) → 15 distinct, and a test asserts it, but the raw array length and the deduped size are not pinned by a `satisfies`/const-assertion here, so a future edit that adds a second accidental duplicate would still compile and quietly change the corpus. Add a compile-time or in-module invariant (e.g. assert `RAW_EXCLUDE_REPLAY_LINKS.length === 16` and `EXCLUDE_REPLAY_LINKS.size === 15`). Confirmed the dedupe itself is correct. — [std: SKILL §A]

## Out of scope (pre-existing)
- `repository.ts:685-726` the `canonical_players ⨯ steam_ids ⨯ nicknames` fan-out join predates this phase; this phase newly *relies* on it at all-time scale (hence finding 4 is in-scope), but the join shape itself is pre-existing.

## Non-Findings Checked
- **Classification order** (`classify-game-type.ts:78-114`): exclude-link → include-override → `sgs` exclusion → prefix → per-type filters. Include-before-exclude (vs RESEARCH B.10 fetch→include→exclude) is behaviorally equivalent because exclude keys on source link and include keys on mission name — independent dimensions, no replay can flip outcome by ordering. Correct.
- **sm month cutoff** (`classify-game-type.ts:140-150`): `isAfter('2023-01-01','month')` ⇒ kept iff month strictly after Jan 2023. `year===2023 && month>0` excludes all of Jan 2023, first eligible Feb 2023. Matches legacy.
- **mace `<10` distinct players** (`full-run.ts:249-252`, `classify-game-type.ts:106`): distinct `eid` count, `< 10` → excluded. Correct and correctly folded into the in-app classification step (not a pure SQL UPDATE) per D2.
- **`filterPlayersByTotalPlayedGames` threshold** (`is-show.ts:29-38`): `scopeGames < 125 ? (15*scopeGames)/100 : 20`, unrounded, `totalPlayedGames >= min`. Boundary `< 125` (not `<= 125`) matches legacy `if (gamesCount < 125)`. Unrounded division matches legacy verbatim. Correct.
- **`includeReplays` (3 forced sg)** and the `@`-bypass: `applyIncludeOverride` rewrites prefix-less missions to `sg@name`, missions containing `@` bypass. Correct.
- **D1 all-time keying / NULLS NOT DISTINCT**: PG17 confirmed (docker-compose `postgres:17-alpine`), `unique nulls not distinct` valid (PG15+). sg gets both per-rotation + all-time; mace/sm all-time only via `ALL_TIME_GAME_TYPES` + `PER_ROTATION_GAME_TYPE='sg'`. Schema test pins duplicate-all-time rejection.
- **No double-count in global legacy-export**: `LEGACY_GLOBAL_GAME_TYPE='sg'` + `statsBucketJoinPredicate` reads only `rotation_id IS NULL and game_type='sg'` (the sg all-time bucket), not per-rotation+all-time. Correct *given finding 2 is fixed*.
- **commander unique constraint** with nullable `player_id`: `calculateCommanderSideAggregates` keys by `side:playerId`, so at most one null-player row per side per bucket — no intra-bucket NULLS-NOT-DISTINCT collision. Correct.
- **Report shape additive**: `allTimeAggregateRows?` optional, `changedAggregateRows` rolls in all-time totals additively, `results`/`failures`/`summary` unchanged. Coverage report untouched. Preserved.
- **Rotation chronological rebuild ordering** (`full-run.ts:381-387`): sorted by first-seen ISO timestamp so bounty carry-in reads the prior rotation's fresh stats. Sound.

## Validation Gaps
- `pnpm verify` / typecheck / lint not executed (read-only).
- Migrate-on-existing-data path (finding 2) is untested — the real-pg harness truncates aggregates before every scenario, so stale NULL-type rows are never exercised.
- Audit-path-after-classification (findings 1, 8, 9) has no test; the parity harness only drives the full-run service.
- Perf (findings 3–5) not benchmarked; flagged from code shape per the parity-driver's request.

## Verdict
**BLOCK** — two 🔴 findings. Finding 1 corrupts the sg parity bucket on the first moderation recompute after a full run (breaks the CONTEXT audit-path-preservation gate); finding 2 leaves stale NULL-type rows that triple-count on the public path and ships no backfill despite D1 requiring one. Both must be fixed before this lands on master. Address the 🟠 parity divergences (6, 7) before claiming F8 parity — the rotation `total_games` mismatch will surface directly in the parity diff. 3–5 are the perf fixes the parity-driver flagged (a dedicated pass is acceptable). Classification, is_show, D1 keying, and report-shape additivity are all correct.

---

_Reviewed: 2026-06-14_
_Reviewer: Claude (gsd-code-reviewer) — solidstats-server-ts-code-review_
_Depth: deep_

## Re-review (fixes)

**Re-reviewed:** 2026-06-14 · **Scope:** the 5 fix commits `a9f7e80 1bf0c85 3e9e0a7 0fdf15c 2a56971` on `feat/parity-phase-01-game-type-stats` (`git diff cbb2494..HEAD -- . ':!.planning'`). All 5 reachable from HEAD `2a56971`. Re-applied `solidstats-server-ts-code-review` (+ conventions/standards). `pnpm verify` not run (read-only); the fix report claims green (794 unit + 185 integration, 100% coverage, OpenAPI diff empty).

### Verdict: APPROVE — clear to land on master

All four prior blockers/highs and both mediums are genuinely fixed (not masked), and the ~18 touched existing tests were **strengthened, not weakened** — every relaxed-looking change is a *more* specific assertion of the new per-type contract.

### Per-finding confirmation

- **🔴 Blocker 1 (audit path) — FIXED.** `recalculate*ForParserResult` now resolve the replay's persisted `game_type` via `replayGameType()` and loop over `auditScopes()`: `null` → `[]` (true no-op), `sg` → sg per-rotation(that rotation) + sg all-time, `mace`/`sm` → that type's all-time only. Inputs are loaded type-filtered through `loadScopedAggregateReplayInputs`/`loadScopedCommanderReplayInputs` (`scopedCurrentResultsSql` filters `r.game_type is not distinct from $1`), so the loaded set always matches the write key — the type-agnostic loaders are removed (`repository.ts`; `grep` confirms zero remaining refs). `is_show` denominator = `scopeGameCount(aggregateRows)` of the scoped (sg-only) inputs (`repository.ts:121,1264`). Public signatures and the `ops:stats:recalculate`/`audit-recalculator.ts` report shape are unchanged — `PgAuditPatchRecalculator.recalculateForPatch` still consumes the three `string → {status}` methods unmodified (`audit-recalculator.ts:34-45`).
  - **Tests strengthened, not weakened (spot-checked):** `commander.test.ts` assertions changed from `[..., null]` to `[null, ..., "mace"]` — now pinning the all-time `rotation_id` + `game_type` *column*, strictly more specific. `bounty.test.ts` went `bountyRows:1`→`2`, pins insert[0] ends in `"sg"` (per-rotation, carry-in) and insert[1] has `rotation_id NULL` + `"sg"` (all-time). `index.test.ts` row-mapping tests moved to `auditGameType:"mace"` (single all-time scope) keeping `playerStats:2`/`squadStats:1` — values still asserted, just isolated to one scope; sg two-scope behavior is proven in real-pg. The ScriptedClient `auditGameType` default is `sg`, so the per-replay-vs-set-based equality tests now exercise the two-scope path by default.
  - **New real-pg oracle is independent and adversarial:** "audit recompute after classification…" snapshots `(game_type, rotation_id IS NULL) → sum(kills)` BEFORE, then proves (a) sg audit leaves `sg:true`/`sg:false` byte-identical, manufactures no `null:*` bucket, and the sg all-time sum equals the sg-only computed sum (no mixed bleed); (b) mace audit yields **zero** `mace + rotation_id is not null` rows; (c) excluded replay (`/replays/1662231981`) is a true no-op (`playerStats/squadStats=0`, all prior sums intact). `playerScopeIsShow` reads the real persisted `is_show` column — genuine oracle, not a re-derivation.

- **🔴 Blocker 2 (migration 0009) — FIXED.** `0009_delete_pre_phase_null_type_aggregates.sql` deletes `game_type is null` from all four aggregate tables; 0008 untouched (checksum-immutable). Safe-by-construction: production full-run always passes a concrete `gameType` (`PER_ROTATION_GAME_TYPE='sg'`/`ALL_TIME_GAME_TYPES`, `full-run-recalculation.ts:230-288`) and `auditScopes(null,…)` returns `[]`, so **no post-phase path writes a NULL-type aggregate row** — the unconditional delete can only hit genuinely stale pre-phase rows. Harness test reads the **exact shipped migration file from disk**, seeds NULL-type rows (`kills:999`), proves the `bucket=undefined` public `playerStatsSql` includes 999 before, applies the file, asserts zero NULL rows survive in all four tables and the public sum drops to exactly the surviving per-type sum (`< 999`). Independent oracle confirmed.

- **🟠 High 6/7 (rotation totalGames) — FIXED.** `ROTATION_STATS_SQL` join now filters `replay.game_type='sg'` AND `exists(parser_results pr where pr.replay_id=replay.id and pr.status='current')`, replacing `replays.status='parsed'` (`legacy-export.ts:248-258`). Real-pg test seeds 2 sg + mace(12p) + sm + excluded in one window and pins `totalGames===2`.

- **🟡 Medium 11 (exclude-list invariant) — FIXED.** `assertExcludeListInvariant(16,15)` invoked at module load; test covers pass + both throw branches (`game-type-config.ts`, `game-type-config.test.ts`).

- **🟡 Medium 10 (bool_or single-row) — FIXED.** Comment on `isShowSelect` documents the one-row guarantee from 0008 `UNIQUE NULLS NOT DISTINCT` + the `game_type=$bucket` predicate + 0009 cleanup (`parity-sql.ts:118-129`). Documentation-only as requested.

### No new bug from the redesign — buckets stay isolated

Checked the four redesign risk vectors the brief named: bounty all-time carry-in is correctly suppressed (`loadPreviousBountyEffectiveness` returns empty for `rotationId===null`, `repository.ts:963`) so the sg all-time scope never double-applies prior-rotation factors; the previous-rotation read is type-filtered (`game_type is not distinct from $2`) so per-type bounty stays isolated; double-rebuild ordering is fine (per-rotation then all-time are disjoint delete keys via `rotation_id is not distinct from`); no needed recompute is skipped (sg still rebuilds both buckets, mace/sm their one).

### Residual findings (non-blocking)

- **WR — sg single-replay audit now triggers a full sg all-time rebuild inside the request transaction.** `auditScopes('sg',…)` adds the `kind:"allTime"` scope, so one moderator patch on an sg replay re-aggregates **every** current sg replay (~2056) and re-inserts via the per-row `INSERT` loop (`replaceAggregateRows:1253`, `replaceBountyRows`, `replaceCommanderRows`) — thousands of sequential awaits holding the tx open. This is the correct parity behavior (the all-time sg bucket must reflect the patch) but it lands the perf cost (prior findings 3/5) on the *interactive* moderation path, not just the batch full-run. Covered by the deferred perf pass; flagging that it now affects a user-facing path. (`repository.ts:109-125`) [std: correctness §AB]
- **IN — audit path uses the *stale* persisted `game_type`; a patch that rewrites `mission_name` won't reclassify until the next full run.** `recalculateForPatch` mutates `raw_snapshot` then reads `replays.game_type` without reclassifying (classification is a full-run-only step per D2). A mission-name-changing patch could therefore rebuild the wrong type bucket. This matches the documented D2 boundary (classification is set-based/full-run) and the pre-phase rotation-only behavior, so it is acceptable for v1 — noted so it is a conscious boundary, not a latent surprise. (`audit-recalculator.ts:91-114`, `repository.ts:1174-1188`)
- **IN — dead/footgun default param.** `recalculate*ForRotation(rotationId, gameType=null)` retains a `null` default reachable only from tests; a future caller passing no type would silently write a NULL-type row that 0009 semantics treat as stale. Consider dropping the default now that all production callers pass an explicit `GameType`. (`repository.ts:235,246,257`) [std: SKILL §A]

The three residuals are WARNING/INFO and do not gate landing. Perf (the WR) is the already-agreed dedicated pass; the two INs are boundary documentation.

---

_Re-reviewed: 2026-06-14 — verdict APPROVE_
_Reviewer: Claude (gsd-code-reviewer) — solidstats-server-ts-code-review_
