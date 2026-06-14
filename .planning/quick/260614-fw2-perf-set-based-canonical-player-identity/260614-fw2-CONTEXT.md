# Quick Task 260614-fw2: set-based canonical player identity resolution in per-rotation recalc - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Task Boundary

Perf fix (behavior-preserving). Inside per-rotation statistics recalculation, canonical player
identity is still resolved per-player with sequential SQL. The hot path is
`ensureNameFallbackIdentities()` in `src/modules/statistics/repository/repository.ts` (lines 549-599):
it loops over unique `(name, replayTimestamp)` occurrences and runs one SELECT (the
`canonical_players LEFT JOIN player_nicknames` lookup, ~9ms) per occurrence, plus a conditional
2-query INSERT when the name has no canonical record. Thousands of round-trips per large rotation
(R11 = 3710 replays) → ~15-20 min/rotation, ~3h full-corpus ETA.

This is the SECOND perf bug after F7 (set-based rotation-level recalc, master 2930f10 / PR #9). F7
already made the OUTER loop set-based and added the comparison integration test; this task makes the
INNER identity resolution set-based.

Goal: resolve all rotation players' canonical ids with O(1) round-trips (one batch resolve + batched
inserts), then build aggregates from the in-memory set — byte-identical aggregates.
</domain>

<decisions>
## Implementation Decisions (LOCKED — do not revisit)

### Target: `ensureNameFallbackIdentities()` only
- This is the per-player loop. `loadPlayerIdentities()` (lines 529-545) is ALREADY set-based
  (`steam_id = any($1)` / `lower(...) = any($2)`) — leave it. The only sequential round-trips are
  inside `ensureNameFallbackIdentities`.
- Do NOT touch the `*ForParserResult` single-replay audit path semantics, the legacy-public-export
  contract, or `ops:stats:recalculate` report shape. These call the same repository helpers, so the
  helper rewrite must stay drop-in.

### Byte-identical preservation — the ordering subtlety
The original loop has order-dependent write side effects. Two facts make a set-based rewrite provably
equivalent:
1. `lower(cp.display_name) = lower($1)` match is **timestamp-independent**. A fallback CP is inserted
   with `display_name = name`, so once created it matches EVERY later occurrence of the same
   `lower(name)` via display_name, regardless of that occurrence's timestamp.
2. A freshly-inserted fallback CP has a brand-new unique `display_name` (= the name) and one nickname
   (= the name). It can only ever match LATER occurrences of the SAME `lower(name)` (via display_name).
   It can never change the match outcome of a DIFFERENT name (different name ⇒ no display_name match;
   the new nickname text = name ⇒ no `lower(nickname)` match for a different name either).

Therefore the equivalent set-based algorithm:
1. **One batch resolve** against the pre-insert DB snapshot: for each unique `(name, replayTimestamp)`
   occurrence, determine whether a match exists under the EXACT original predicate
   (`lower(display_name) = lower(name)` OR active-nickname-window match at `replayTimestamp`). Use a
   `VALUES`/`unnest` join (mirror the F7 `assignRotationsForCurrentReplays` set-based style), returning
   which input occurrences matched.
2. **In-memory replay in original occurrence order**, maintaining a `createdLowerNames` set:
   - occurrence matched pre-existing ⇒ skip;
   - else `lower(name)` already in `createdLowerNames` ⇒ skip (a fallback CP was created earlier this
     run; original would have matched it via display_name);
   - else ⇒ schedule a fallback insert, add `lower(name)` to `createdLowerNames`.
3. **Batched inserts** for scheduled names: one multi-row `insert into canonical_players ... returning`,
   then one multi-row `insert into player_nicknames ...` with the SAME
   `{ source: "parser_artifact_name_fallback" }` evidence and each occurrence's `replayTimestamp` as
   `observed_from`.

Occurrence ordering MUST stay identical to `uniqueNameOccurrences()` (parser-result order, then
artifact player order; dedupe key `lower(name)\0timestamp.toISOString()`; skip empty trimmed names).

### created_at is safe to collapse
Original loop gives each fallback CP a distinct `created_at` (default `now()` per insert). Batched
insert gives all the same `now()`. This does NOT change aggregates: each fallback name has exactly one
CP, `loadPlayerIdentities` does not order by `created_at`, and `bestPlayerIdentity` resolves by match
priority, not `created_at`. The only consumer of `created_at` ordering was the per-loop
`order by created_at, id limit 1`, which the rewrite eliminates/replicates. The comparison test
asserts this.

### Claude's Discretion
- Exact SQL shape of the batch resolve (CTE with `unnest($names, $timestamps)` vs `VALUES` join) — pick
  the clearest, indexes already exist (`idx_player_nicknames_nickname` on `lower(nickname)`).
- Whether to also batch the secondary `replaceAggregateRows/CommanderRows/BountyRows` INSERT loops.
  DEFERRED unless the identity fix alone does not hit the "minutes" acceptance — keep scope tight
  (anti-scope-creep). The identity loop is the named ~9ms×thousands bottleneck; the insert loops are
  N_players per rotation (~hundreds), not the reported hot path.
</decisions>

<specifics>
## Specific Ideas

- Mirror F7's set-based style already in the repo: `assignRotationsForCurrentReplays` in
  `src/modules/statistics/repository/full-run.ts` (one set-based UPDATE), and the batch
  `loadPlayerIdentities` query (`= any(...)`).
- Extend the EXISTING comparison test in
  `src/modules/statistics/repository/tests/postgres.test.ts` ("set-based rotation rebuild matches the
  per-replay path…" ~L653, and the cross-rotation-bounty test ~L764). Add coverage that specifically
  stresses fallback identity creation: multiple NEW name-only players (no steam id, no pre-existing
  canonical record) across replays in one rotation, and the same name appearing in two replays at
  different timestamps (must create exactly one fallback CP, matching the per-loop path).
</specifics>

<canonical_refs>
## Canonical References

- `src/modules/statistics/repository/repository.ts` — `ensureNameFallbackIdentities` (L549-599),
  `loadPlayerIdentities` (L506-547), `uniqueNameOccurrences` (L601-623), `loadAggregateReplayInputs`.
- `src/modules/statistics/repository/full-run.ts` — `assignRotationsForCurrentReplays` (set-based ref).
- `src/infra/db/migrations/0001_v1_domain_schema.sql` — `canonical_players(display_name)`,
  `player_nicknames(player_id, nickname, observed_from, observed_to, evidence)`,
  index `idx_player_nicknames_nickname on player_nicknames(lower(nickname))`.
- `src/modules/statistics/repository/tests/postgres.test.ts` — existing per-replay-vs-set-based parity
  tests to extend.
- Conventions: `solidstats-server-ts-conventions`; review `solidstats-server-ts-code-review`; tests
  `solidstats-server-ts-tests`.

## Hard requirements
- `pnpm verify` green; contract-diff untouched; legacy-public-export contract and single-path
  `ops:stats:recalculate` audit unchanged.
- Acceptance: full-corpus recalc (23.5k replays, 20 legacy rotations) finishes in minutes; aggregates
  byte-identical to the current path on a sample rotation (proven by the extended comparison test).
</canonical_refs>
