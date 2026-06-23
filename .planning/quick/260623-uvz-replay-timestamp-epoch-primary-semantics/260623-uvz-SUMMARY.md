---
phase: 260623-uvz-replay-timestamp-epoch-primary-semantics
quick_id: 260623-uvz
plan: 01
subsystem: ingest
status: complete
tags: [ingest, replay-timestamp, migration, epoch-primary, cross-app]
requires:
  - replays-fetcher epoch-primary replay_timestamp semantics (quick-260623-qj5)
provides:
  - epoch-primary resolveReplayTimestamp (ingest derivation flip)
  - converged epoch window [1_420_070_400, 2_051_222_400]
  - migration 0013 correcting backfill (non-NULL overwrite)
affects:
  - replays.replay_timestamp (historical rows corrected in place)
tech-stack:
  added: []
  patterns:
    - "epoch-primary precedence: derive(sourceReplayId) ?? stagedTimestamp"
    - "correcting (not NULL-gated) backfill migration"
key-files:
  created:
    - src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql
  modified:
    - src/modules/ingest/replay-timestamp.ts
    - src/modules/ingest/replay-timestamp.test.ts
    - src/modules/ingest/service.test.ts
    - src/modules/ingest/repository/tests/postgres.test.ts
decisions:
  - "Epoch in source_replay_id is PRIMARY; staged replayTimestamp is the fallback used only when the id has no in-range epoch."
  - "Converged the epoch window to the fetcher's authoritative [1420070400, 2051222400] inclusive; 1000000000 is now rejected, 2000000000 stays in range."
  - "0013 overwrites ALL in-range-epoch rows (not NULL-gated); no re-null revert is offered because the old value was wrong by design."
metrics:
  duration: ~10m
  completed: 2026-06-23
  tasks: 2
  files: 5
---

# Phase 260623-uvz Plan 01: Replay timestamp epoch-primary semantics Summary

Mirrored the replays-fetcher epoch-primary `replay_timestamp` change in server-2: flipped the ingest derivation so an in-range Unix epoch in `source_replay_id` is the primary timestamp (overriding a present staged value), converged the epoch bounds to the fetcher's `[1_420_070_400, 2_051_222_400]` window, and shipped a correcting backfill migration (0013) that overwrites already-promoted rows holding the old wrong-timezone value. No schema change.

## What changed per file

- **`src/modules/ingest/replay-timestamp.ts`** — `resolveReplayTimestamp` flipped from staged-primary (`replayTimestamp ?? derive(...)`) to epoch-primary (`derive(...) ?? replayTimestamp`). Bounds converged from `[1_000_000_000, 2_000_000_000]` to `[1_420_070_400, 2_051_222_400]`. The exact-10-trailing-digits anchor (`/(?:^|\D)(?<epoch>\d{10})$/u`) is unchanged — the range is the authority. Header/invariant comment rewritten to describe epoch-primary precedence and cite migration **0013** (was 0011); NaN-guard reasoning re-verified for the new max (`2.05e12` ms, far inside `±8.64e15`).
- **`src/modules/ingest/replay-timestamp.test.ts`** — re-derived every boundary against the new window: `1420070400`/`2051222400` accepted inclusively, `1420070399`/`2051222401` rejected, `1000000000` now rejected (below new lower), `2000000000` still accepted. Anchor reject cases (8/9/11+/13/19-digit, zero-padded-20, digits-not-at-end) kept. `resolveReplayTimestamp` precedence rewritten: the old "keeps the primary" became its opposite (epoch overrides a present staged value); added fallback cases (`derived:`/non-numeric/out-of-range keep the staged value) via `it.each`.
- **`src/modules/ingest/service.test.ts`** — `#L86` "keeps a present staging timestamp" flipped to "overrides a present staging timestamp with the in-range source_replay_id epoch" — proves the override at the service boundary. The null-staged derivation test (`#L65`) left unchanged (still true under epoch-primary). No change to `service.ts`.
- **`src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql`** (new) — correcting backfill: `update replays set replay_timestamp = to_timestamp(epoch), updated_at = now()` for all rows whose `source_replay_id` matches `(\D|^)\d{10}$` and is `between 1420070400 and 2051222400`. NOT gated on `replay_timestamp is null` — overwrites non-null wrong values. Idempotent; same extraction substring as 0011. Header documents root cause, correcting-not-filling intent, the bounds-tightening divergence from 0011, idempotency, and a forward-only DOWN note (no re-null revert offered). 0011 untouched (checksum-pinned).
- **`src/modules/ingest/repository/tests/postgres.test.ts`** — new integration test mirroring the 0011 test: seeds an in-range-epoch row with a non-null WRONG timestamp (`2099-01-01`), plus non-numeric, out-of-range (`sg-zone-1000000000`), and `derived:no-epoch` rows with a kept value; reads and executes the REAL 0013 file via `readFile`/`fileURLToPath`; asserts the wrong row is overwritten to `2021-06-19T19:08:04.000Z` and the other three are unchanged.

## Commands run

| Command | Task | Result |
|---------|------|--------|
| `pnpm run typecheck` | 1 & 2 | PASS |
| `pnpm run lint` | 1 & 2 | PASS |
| `pnpm test` (unit) | 1 | PASS — 687 tests, 80 files |
| `pnpm run test:integration` | 2 | PASS — 192 tests, 9 files |

Docker deps (postgres/rabbitmq/minio) were brought up via `docker compose up -d` for the integration run.

## Boundary re-derivation (the load-bearing flip)

| epoch | old window [1e9, 2e9] | new window [1420070400, 2051222400] |
|-------|----------------------|--------------------------------------|
| 1000000000 | accepted | **rejected** (below lower) |
| 1420070400 | accepted | accepted (lower, inclusive) → `2015-01-01T00:00:00.000Z` |
| 1624129684 | accepted | accepted → `2021-06-19T19:08:04.000Z` |
| 2000000000 | accepted | accepted (still in range) → `2033-05-18T03:33:20.000Z` |
| 2051222400 | rejected (>2e9) | accepted (upper, inclusive) → `2035-01-01T00:00:00.000Z` |
| 2051222401 | rejected | rejected (above upper) |

## Deviations from Plan

None — plan executed exactly as written. `service.ts` was confirmed unchanged (the helper flip propagates through `withResolvedReplayTimestamp`).

## Out of scope (confirmed N/A, per plan)

- Read-path / timezone-offset removal — `src/modules/statistics` + `src/modules/public-stats` have no offset arithmetic; nothing to remove.
- `web` double-offset — separate repo, separate hand-off item.
- Staging-table backfill — the ingest precedence flip makes pending staging rows promote with the corrected epoch-derived value.

## Self-Check: PASSED

All 5 key files present; both task commits (`5db88d6`, `5faefa9`) found in git log.
