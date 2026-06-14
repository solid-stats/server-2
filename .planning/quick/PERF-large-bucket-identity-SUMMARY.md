# PERF — Large-bucket identity / recalc scaling (F8 gate)

**Branch:** `fix/perf-large-bucket-identity`
**Commit:** `34aae9d` (single atomic commit)
**Status:** complete — full `pnpm verify` green (100% coverage, OpenAPI diff empty)

Behavior-preserving performance fixes for the F8 large all-time buckets (gates the
~20,735-replay `mace` all-time recalc in one pass). Addresses 01-REVIEW findings 3, 4, 5.
No aggregate output changes: `player_stats` / `squad_stats` / `commander_side_stats` /
`bounty_points` and the fallback `canonical_players` / `player_nicknames` rows are byte-identical.

## Finding → Fix

### Finding 3 — O(1) identity resolution (`repository.ts`)
- **Before:** `bestPlayerIdentity` `.flatMap`+`.toSorted` over the ENTIRE identities array per
  player per replay → O(replays × players × |identities|).
- **Fix:** `buildPlayerIdentityIndex` builds, once per bucket, a `bySteamId` + `byLowerName`
  lookup (each identity indexed under its `steam_id`, `lower(display_name)`, and `lower(nickname)`,
  preserving original array order via a stored `order`). `bestPlayerIdentityIndexed` scores only
  the few candidates reachable from a player's steam id / lower(name) using the **unchanged**
  `playerIdentityMatchPriority`, then selects highest priority with first-original-array-order
  tie-break — replicating the prior stable `.toSorted((l,r)=>r.priority-l.priority)[0]` exactly.
- Applied to both the player path (`resolvedPlayers`) and the commander path (`commanderIdentities`).
- **Candidate-completeness proof:** `playerIdentityMatchPriority` returns a priority only via
  steam_id==sid, lower(nickname)==lower(name), or lower(display_name)==lower(name) — all three are
  exactly the index keys, so no matching identity is ever missed.

### Finding 4 — fallback resolve + missing index (`repository.ts`, migration 0010)
- **New index:** `0010_canonical_players_display_name_lower_index.sql` →
  `create index if not exists idx_canonical_players_display_name_lower on canonical_players (lower(display_name))`
  (mirrors the existing `idx_player_nicknames_nickname` on `lower(nickname)`). Confirmed applied
  in the live dev DB. Index-only, no behavior change.
- **Resolve restructure:** the per-occurrence correlated `where exists (cp LEFT JOIN pn WHERE
  displayMatch OR nickMatch)` is rewritten into ONE set-based pass with two index-sargable EXISTS
  halves (`exists(cp where lower(display_name)=lower(name))` OR `exists(pn where lower(nickname)=
  lower(name) AND window)`). Predicate is provably identical (the LEFT JOIN's nickMatch only reads
  `pn` columns, and every `pn` belongs to a `cp`, so the two independent EXISTS = the original OR).
  Statement count unchanged (one query); output ordinalities unchanged.
- **`loadPlayerIdentities` fan-out:** left as-is. The N×M `cp ⨯ steam_ids ⨯ nicknames` rows are now
  consumed in O(1) by the index, so the only residual cost is data transfer, bounded by distinct
  observed names per bucket. Deduplicating in SQL would change row identity/order and risk
  cross-player tie-break drift — **not** behavior-preserving — so it is deliberately not changed.

### Finding 5 — batch the replace inserts (`repository.ts`)
- `replaceAggregateRows` / `replaceCommanderRows` / `replaceBountyRows` converted from one
  `await client.query(insert ...)` per row to a single multi-row
  `insert ... select * from unnest(...)` per table (the F7/FW2 pattern).
- Byte-identical: each `unnest` column carries the same per-row scalar in the same order;
  constant `rotation_id` / `game_type` passed as reused scalars; `jsonb` columns (`stats`,
  `inputs`) JSON-serialized per element exactly as the single-param insert serialized them;
  `numeric(12,2)` `points` stored identically; empty arrays produce zero rows (matching the
  empty loop). Per-table delete predicates unchanged.

## How byte-identity is proven
1. **Real-pg parity harness unchanged & green** (`postgres.test.ts`, 185 integration tests):
   per-replay vs set-based, per-type, all-time, and `is_show` comparisons all still pass against
   the new batched inserts and O(1) resolution — the strongest oracle.
2. **`identity-index.test.ts` (new):** cross-checks `bestPlayerIdentityIndexed` against a verbatim
   re-implementation of the prior per-player scan on an adversarial seeded corpus (steam match,
   active/expired nickname windows, duplicate display names for the tie-break, nickname-beats-
   display, steam-beats-name, no-match) across a 4-point timestamp sweep.
3. **`batched-write.test.ts` (new):** ScriptedClient query-count assertions — exactly ONE insert
   per aggregate table (not per-row) and exactly ONE `select occ.idx` set-based fallback resolve
   regardless of occurrence count; batched commander/bounty params carry all rows.
4. Updated `commander.test.ts` / `bounty.test.ts` assertions to the batched param shape
   (`bountyInsertRows` re-zips the batch back to per-row tuples) — strengthened with explicit
   "one insert per scope" length checks, not weakened.

## Verification
`pnpm verify` (PG/RabbitMQ/MinIO up): format, lint, typecheck, 617 unit + 185 integration tests,
OpenAPI contract diff EMPTY, ops checks, **100% coverage** (stmts/branches/funcs/lines).

## Files
- `src/infra/db/migrations/0010_canonical_players_display_name_lower_index.sql` (new index)
- `src/modules/statistics/repository/repository.ts` (findings 3/4/5)
- `src/modules/statistics/repository/tests/identity-index.test.ts` (new)
- `src/modules/statistics/repository/tests/batched-write.test.ts` (new)
- `src/modules/statistics/repository/tests/insert-assertions.ts` (new helper)
- `src/modules/statistics/repository/tests/{bounty,commander}.test.ts` (assertions updated)

## Deviations
None beyond the documented scope. No architectural changes; `loadPlayerIdentities` fan-out left
intact for behavior-preservation (documented above). Out-of-scope items (classification, bucketing,
is_show formula, legacy-export shape, OpenAPI) untouched.

## Operational note
Migration 0010 must be applied on deploy (`pnpm db:migrate`). It is index-only and additive; no
recalc is required by this change (unlike 0009).
