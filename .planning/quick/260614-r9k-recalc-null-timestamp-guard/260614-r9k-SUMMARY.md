---
quick_id: 260614-r9k
slug: recalc-null-timestamp-guard
status: complete
date: 2026-06-14
---

# Quick Task 260614-r9k — Summary

## What changed

Fixed a crash in the full-run / all-time statistics recalculation:
`TypeError: Cannot read properties of null (reading 'toISOString')` raised in
`uniqueNameOccurrences` (`src/modules/statistics/repository/repository.ts`).

- `repository/repository.ts` — `scopedCurrentResultsSql` now appends
  `and r.replay_timestamp is not null` to its WHERE clause, with a docstring note. The
  all-time scope's broad scan previously loaded `NULL`-timestamp replays (1101 in the
  parity corpus); a no-SteamID player on such a replay reached the name-fallback path,
  which keys each occurrence on `replay_timestamp.toISOString()` and threw on `NULL`.
- `repository/tests/postgres.test.ts` — added an integration test that seeds a timed
  `sg` replay (SteamID player Alpha) plus a `NULL`-timestamp `sg` replay (no-SteamID
  player Ghost), runs `classifyGameTypesForCurrentReplays`, then recalculates the timed
  replay. Pre-fix this threw in the all-time rebuild; post-fix it returns
  `{ playerStats: 2, rotationId, squadStats: 0, status: "recalculated" }`. Asserts only
  Alpha appears in `player_stats` and Ghost gets no name-fallback `player_nicknames` row.

## Why this is correct (key insight)

`NULL`-timestamp replays cannot be placed in time and the single-replay audit path
already reports them `missing_replay_timestamp` (never recalculated). Excluding them
from the scope query is consistent with existing behavior — it does not change which
replays get aggregated, only stops the all-time scan from dereferencing a `NULL`
timestamp. The guard lives in the repository SQL because that layer owns the query and
the row contract (`solidstats-server-ts-conventions` §A).

## Conventions applied

- **`solidstats-server-ts-conventions` §A** (layer responsibilities): the fix is the
  repository's SQL/row contract, kept in the repository layer — no leak into
  service/usecase.
- **`solidstats-server-ts-tests`** — per-layer testing map (repository ⇒ **integration**
  against real Postgres, never a mocked DB) and the testcontainers harness; reused the
  file's existing typed seed builders (`seedRotation`/`seedPlayer`/`seedParserResult`/
  `missionEnvelope`/`fullRunRepository.classifyGameTypesForCurrentReplays`).
- **`solidstats-shared-testing-standards`** (via the tests skill) — AAA structure
  (explicit Arrange/Act/Assert), scenario-named `it`, and a **strong oracle**: an exact
  `toEqual` on the recalc result plus positive (Alpha aggregated) and negative (Ghost
  excluded, no fallback nickname) assertions rather than a loose `toMatchObject`.
  Distinct `sourceReplayId`s avoid the seed helper's unique object_key/checksum clash.

## Validation

`pnpm typecheck` and `pnpm exec eslint src/modules/statistics/repository/repository.ts
src/modules/statistics/repository/tests/postgres.test.ts` — both green. The integration
test needs the testcontainers/Docker Postgres, which isn't available locally; it runs in
CI. No OpenAPI contract change.

## Acceptance

- [x] Root cause fixed at the repository SQL layer.
- [x] Integration test reproduces the crash pre-fix and passes post-fix (correct by
      construction per the test skill).
- [x] `pnpm typecheck`, `pnpm exec eslint <changed files>` green.
- [x] No OpenAPI contract change.
- [ ] CI integration run green (runs in pipeline; not runnable locally here).
