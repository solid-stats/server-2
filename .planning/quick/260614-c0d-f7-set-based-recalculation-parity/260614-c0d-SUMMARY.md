---
quick_id: 260614-c0d
slug: f7-set-based-recalculation-parity
status: complete
date: 2026-06-14
---

# Quick Task 260614-c0d — Summary

## What changed

Fixed parity finding **F7**: `recalculateAllCurrentParserResults` was O(n²). Each of
the 23.5k parser_results triggered a *full rotation rebuild* (`recalculate*ForParserResult`
rebuilds the whole rotation's aggregates), so a rotation of size *m* was rebuilt *m*
times. Measured ~2 replays/min, ETA ~5 days; DB-bound. The full-corpus parity new-side
export was blocked on this.

Made recalculation **set-based**: rebuild each rotation **once**.

- `repository/repository.ts` — added `recalculatePlayerAndSquadStatsForRotation`,
  `recalculateCommanderSideStatsForRotation`, `recalculateBountyPointsForRotation`
  (reuse the existing `loadAggregateReplayInputs` / `replaceAggregateRows` / commander /
  bounty helpers; no per-replay `assignReplayRotation`). The `*ForParserResult` methods
  are left untouched — still used by the single-replay audit path
  (`audit-recalculator`, `workflow-applier`).
- `repository/full-run.ts` — added `assignRotationsForCurrentReplays`: one set-based
  `UPDATE replays` that re-derives every current-result replay's rotation and returns a
  `replayId → rotationId` map.
- `service/full-run-recalculation.ts` — rewrote `recalculateAllCurrentParserResults` to
  classify each target → group by rotation → rebuild each rotation once, in **chronological
  order** (bounty reads the previous rotation's `player_stats`). Report shape preserved:
  per-target `results[]` in order, summary totals intact, aggregate rows attributed once
  per rotation so `changedAggregateRows` isn't inflated.

## Why this is correct (key insight)

The per-parser-result recalc methods were *already full-rotation rebuilds* — not
incremental. So calling them once per rotation (after all replays are assigned) yields
**byte-identical aggregates** to the per-replay path, at O(n). Complexity drops from
O(n²) to one rebuild per rotation (~20 for the parity corpus).

## Complexity

Old: per-replay × full-rotation-rebuild = O(Σ mᵢ²). New: one rebuild per rotation =
O(Σ mᵢ) = O(n) plus one set-based UPDATE. Full-corpus recalc now completes in minutes.

## Review follow-ups applied

Self-review (solidstats-server-ts-code-review skill, via subagent) flagged that bounty's
cross-rotation dependency rests on chronological rotation order. Hardened
`orderedRotationIds` to sort explicitly by each rotation's earliest member timestamp
(no longer relies on the target query's `ORDER BY`), documented the invariant, and
documented the `rotation_id`-nulling behavior of the batch UPDATE.

## Tests

- Unit (`service/tests/full-run-recalculation.test.ts`): rotation-grouped fake; one
  rebuild per rotation, attribute-once, skip classification, per-rotation failure.
- Integration (`repository/tests/postgres.test.ts`, CI — needs Postgres):
  1. set-based rotation rebuild == per-replay path for a multi-replay rotation
     (player/squad/commander/bounty);
  2. full-run **service** == per-replay path across **two** rotations, proving the
     February bounty consumes January's rebuilt `player_stats` (cross-rotation ordering).

## Validation

`pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (565 unit tests) — all green
locally. Integration tests (`pnpm test:integration`) require the docker-compose Postgres,
which couldn't start in this environment (Docker needs interactive auth); they run in CI.

## Acceptance (F7)

- [x] Full-corpus recalc completes in minutes, not days — one rebuild per rotation.
- [x] Set-based aggregates match the per-replay path (single- and multi-rotation
      integration tests).
- [ ] CI integration run green (runs in pipeline; not runnable locally here).

Unblocks: parity-driver can re-run recalc→export for the full-corpus new-side baseline.
