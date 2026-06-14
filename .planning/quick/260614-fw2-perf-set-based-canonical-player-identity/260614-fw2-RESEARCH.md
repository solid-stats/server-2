# Quick Task 260614-fw2: Research

**Mode:** quick-task · **Gathered:** 2026-06-14

## Bottleneck (confirmed)

`src/modules/statistics/repository/repository.ts` → `ensureNameFallbackIdentities()` (L549-599),
called by `loadPlayerIdentities()` (L510) on every `recalculate*ForRotation` / `*ForParserResult`
rebuild. Per unique `(name, replayTimestamp)` occurrence it runs:

```sql
-- hot SELECT, ~9ms, once per occurrence (L556-570)
select cp.id
from canonical_players cp
left join player_nicknames pn on pn.player_id = cp.id
where lower(cp.display_name) = lower($1)
   or (
     lower(pn.nickname) = lower($1)
     and (pn.observed_from is null or pn.observed_from <= $2)
     and (pn.observed_to is null or pn.observed_to >= $2)
   )
order by cp.created_at, cp.id
limit 1
```

If no row → `insert into canonical_players (display_name) values ($1) returning id` (L577-580)
then `insert into player_nicknames (player_id, nickname, observed_from, evidence) ...`
(L586-597, evidence `{ source: "parser_artifact_name_fallback" }`). 1-3 round-trips × thousands of
occurrences per large rotation.

`loadPlayerIdentities` (L529-545, the id→aggregate batch) is ALREADY set-based — out of scope.

## Schema (migration 0001_v1_domain_schema.sql)

- `canonical_players(id uuid pk, display_name text not null, created_at, updated_at)`.
- `player_nicknames(id, player_id fk→canonical_players on delete cascade, nickname text not null,
  observed_from timestamptz, observed_to timestamptz, evidence jsonb, ...)`,
  `unique (player_id, nickname, observed_from)`,
  index `idx_player_nicknames_nickname on player_nicknames(lower(nickname))`.
- `player_steam_ids(...)` — not touched by the fallback path (steam matching handled later in
  `loadPlayerIdentities` / `bestPlayerIdentity`).

## Occurrence source order (`uniqueNameOccurrences`, L601-623)

Iterates `parserResults` in query order; for each, `playersFromArtifact(row.raw_snapshot)` in artifact
order. Name = `player.n.trim()`; skip empty. Dedupe key = `lower(name)\0replay_timestamp.toISOString()`
(same name at two timestamps ⇒ two occurrences). The set-based rewrite must keep this exact ordered
list — only the DB round-trips change.

## Set-based patterns to mirror (already in repo)

- `full-run.ts` `assignRotationsForCurrentReplays` — one set-based correlated UPDATE returning rows.
- `loadParserEvents` (L431-456) — `where ... = any($1::uuid[])`.
- `loadPlayerIdentities` (L529-545) — `= any($1::text[])` / `lower(...) = any($2::text[])`.

Recommended resolve query: a single statement that takes the occurrence list as parallel arrays and
LEFT JOINs the predicate, e.g.

```sql
select occ.idx
from unnest($1::text[], $2::timestamptz[]) with ordinality as occ(name, ts, idx)
where exists (
  select 1 from canonical_players cp
  left join player_nicknames pn on pn.player_id = cp.id
  where lower(cp.display_name) = lower(occ.name)
     or ( lower(pn.nickname) = lower(occ.name)
          and (pn.observed_from is null or pn.observed_from <= occ.ts)
          and (pn.observed_to   is null or pn.observed_to   >= occ.ts) )
)
```

Returns the indices of occurrences that already resolve against the pre-insert snapshot. Then the
in-memory ordered replay (CONTEXT §decisions) decides the fallback inserts, applied as two multi-row
inserts (`canonical_players ... returning id`, then `player_nicknames`). `unnest(... ) with ordinality`
preserves occurrence order so results map back by index.

## Pitfalls

- **Order dependence is real.** Do the batch resolve against the snapshot BEFORE any insert, then
  replay occurrence order in memory with a `createdLowerNames` guard. Inserting first, or resolving
  per-name without the ordered replay, can create duplicate or missing fallback CPs vs the loop.
- **Empty-name skip** and the exact dedupe key must be preserved (reuse `uniqueNameOccurrences`).
- **Evidence JSON and observed_from** must match byte-for-byte (`observed_from = occurrence timestamp`,
  `observed_to` null).
- Keep the helper a drop-in: `*ForParserResult` audit path and `*ForRotation` both call it.

## Tests to extend

`src/modules/statistics/repository/tests/postgres.test.ts`:
- "set-based rotation rebuild matches the per-replay path…" (~L653) — truncate-and-compare harness.
- cross-rotation bounty test (~L764).
Add a scenario seeded with multiple brand-new NAME-ONLY players (no steam id, no pre-existing canonical
row) spread across ≥2 replays in one rotation, including the same name at two timestamps — assert the
set-based path produces identical `player_stats / squad_stats / commander_side_stats / bounty_points`
AND identical resulting `canonical_players` / `player_nicknames` fallback rows vs the per-replay path.
