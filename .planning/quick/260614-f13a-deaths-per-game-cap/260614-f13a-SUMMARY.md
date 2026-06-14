---
quick_id: 260614-f13a
slug: deaths-per-game-cap
status: complete
date: 2026-06-14
---

# Quick Task 260614-f13a — Summary

## What changed

Capped deaths at one per game per player in the statistics aggregation, to match
legacy "games-died-in" semantics (Solid Games are one-life). Server-2 aggregation
only — the Rust parser and its `d`/`td` artifact are untouched.

- `src/modules/statistics/service/service.ts` —
  `calculatePlayerAndSquadAggregates` now tallies each replay's death evidence into
  per-replay scratch maps (`replayPlayerDeaths`, `replaySquadDeaths`) carried on the
  event context, instead of writing per-event death counts straight into the
  cross-replay aggregate. After a replay's events are processed, the new
  `foldCappedDeaths` helper folds a capped contribution into the player/squad
  aggregates: `deaths.total += 1` iff the replay tally's `total > 0`, and
  `deaths.by_teamkills += 1` iff its `by_teamkills > 0`. Both are capped together so
  `by_teamkills` can never exceed `total`. The death-writing helpers
  (`applyVictimDeath`, `applyCounterEvent`, `applySquadEvent` victim branch,
  `applySquadCounterEvent`) now write into the scratch maps via a new `replayDeaths`
  accessor; the offensive kill/teamkill accumulation and the
  `counterDeathReferences` fallback suppression are unchanged.
- `src/modules/statistics/service/tests/aggregates.test.ts` — updated the two
  pre-existing expectations that change under the cap (compact-counter
  `deaths_total:3` now `total:1`; `deaths_by_teamkills:2` now `{total:1,
  by_teamkills:1}`), renamed that case to reflect the cap, and added five
  cap-specific tests: 3 kill events in one replay → `total:1`; 2 teamkill deaths →
  `{total:1, by_teamkills:1}`; died in 2 replays → `total:2`; a player who never
  died → `total:0`; a normal + teamkill death in one replay → `{total:1,
  by_teamkills:1}` (byTeamkills capped below total only because both are 1).

## Why this is correct (key insight)

`total` summed across the replays an entity appears in is now the count of replays
it died in — exactly legacy "games-died-in". Capping at the per-replay fold (not
per-event) is what suppresses ACE down-and-revive artifacts and duplicate kill rows
without touching the raw parser evidence. Verified against the parity corpus:
capping moves `sg` total deaths 295000 → 293744 vs legacy 297878 (−1.4%, within
coverage tolerance), and among games-exact players capped deaths match legacy 99.3%.

## Conventions applied

- **`solidstats-server-ts-conventions` §A** (layer responsibilities): the cap is
  business logic in the **service** layer (the aggregation owner) — no leak into the
  parser, repository SQL, schema, or API contract.
- **`solidstats-server-ts-tests`** — service logic is **unit** (per-layer map);
  reused the file's existing in-line `AggregateReplayInput` fixtures, hoisting one
  shared fixture builder (`twoDeathEventsReplay`) to module scope to satisfy
  `unicorn/consistent-function-scoping`.
- **`solidstats-shared-testing-standards`** — strong oracles (exact `toEqual` on the
  `deaths` object) and one behavior per `it`; both the inflating paths (counter
  magnitude and duplicate kill rows) and the cross-replay sum are covered.

## Validation

- `pnpm lint` — green (full repo).
- `pnpm typecheck` — green.
- `pnpm test` (unit) — 627 passed (77 files); `aggregates.test.ts` 9/9.
- Integration: `statistics/repository/tests/postgres.test.ts` 31/31 and
  `public-stats/tests/postgres.test.ts` 96/96 green when run isolated against the
  testcontainers Postgres. The combined `pnpm test:integration` run reported a
  `deadlock detected` on the shared truncate when both files run together — an
  env/harness concurrency artifact against a single shared DB, not caused by this
  change (each file passes alone).
- No OpenAPI / schema / parser-contract change.

## Acceptance

- [x] Per-replay death contribution capped at <=1 for both `total` and
      `by_teamkills`, consistently (byTeamkills never exceeds total).
- [x] Fallback path (`applyVictimDeath`) routed through the same cap; counter
      suppression via `counterDeathReferences` preserved.
- [x] Unit tests: 3 events in one replay → +1; teamkill death → byTeamkills +1;
      2 replays died-in → total 2; no death → 0.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` green.
- [x] No parser, schema, or API-contract change.
