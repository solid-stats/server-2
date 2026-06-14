---
quick_id: 260615-f13b
slug: deaths-undercount
status: complete
date: 2026-06-15
branch: fix/f13a-deaths-debug
---

# Quick Task 260615-f13b — Summary

## Confirmed runtime root cause (instrumented on real staging data)

The recalc reads the death **counter** signal from the `parser_events` table,
which is **stale relative to `raw_snapshot`**. The bulk full-run
(`full-run-recalculation.ts`) never re-persists `parser_events` — only the
single-replay audit path (`recalculateParserResult` → `persistParserArtifact` →
`replaceParserEvents`) does. So for ~90% of current sg replays (1850 / 2059 with
artifact `d` players) `parser_events` has **0 `player_counter` rows**, while
`raw_snapshot` carries the compact counters. The death counter path
(`applyCounterEvent`) therefore finds nothing.

Player resolution AND games are built from `raw_snapshot`, so the game is
counted; only the death — when it has no independent victim kill-row (null-killer
/ suicide / environmental / bleed-out `d>0` with no attacker) — is lost. This is
the platform-wide ~11024 death-game undercount.

**Instrumentation** (`instrument.ts`, real exported rows, real
`buildPlayerIdentityIndex` / `bestPlayerIdentityIndexed` / `playerIdentityMatchPriority`
/ `calculatePlayerAndSquadAggregates`): across 16 of Zero's d>0 replays, Zero
**resolved in all 16** — so the F12-timestamp / `isNicknameActive` hypothesis is
**REFUTED**; he matches via the time-ungated `display_name` priority-1 branch even
for pre-2026-05-10 replays. Pre-fix only 6/16 deaths credited (3 counter, 3
victim), **10 DROPPED**; post-fix **16/16, 0 dropped**.

Concrete dropped replay: **9eb1a2ad-60b8-4692-8520-47d8362c207c (2021-05-14)**,
current prid `3662f461-e6e1-460f-a985-9902e17c6f9e`. raw_snapshot Zero =
`{d:1, nkd:1, eid:203}`; `parser_events` = 140 kill / 18 destroyed_vehicle /
6 teamkill / 1 diagnostic, **0 player_counter**; no kill row with
`victim_entity_id=203`. Logged decision: `deathCredited=0, branch=DROPPED`.

The 4 prior code-reading hypotheses failed because the divergence is
runtime-only: the event-table state cannot be inferred from `raw_snapshot` by
reading code — it required querying both and comparing.

## The fix (minimal, service + repository)

Read the per-player death counter from the authoritative `raw_snapshot` (same
source already used for resolution and games), not the stale events table.

- `service.ts` — `AggregatePlayerEvidence` gains optional `counterDeaths?:
  DeathStats`. New `tallyArtifactCounterDeaths` folds it into the per-replay
  scratch maps (player + squad) alongside the existing event paths. Exported
  `artifactCounterDeaths(d, td)` builds the `DeathStats` with the SAME semantics
  as the event-based `counterDeaths` (`total = max(d, td)`, `by_teamkills = td`);
  `counterDeaths` now delegates to it (DRY).
- `repository.ts` — `resolvedPlayers` attaches `counterDeaths =
  artifactCounterDeaths(player.d, player.td)` onto each resolved evidence row.

### Invariants preserved
- One-life cap: ≤1 `total` and ≤1 `by_teamkills` per replay (`foldCappedDeaths`,
  unchanged). Additive with the event paths — any overlap collapses to 1.
- `by_teamkills ≤ total` (the `max` cap).
- Games unaffected (player/replay set already from `raw_snapshot`).
- Parser / OCAP contract, schema, and API untouched.

## Tests (red → green)
- `service/tests/aggregates.test.ts` — 4 new unit tests: artifact counter credits
  a death with no event and no victim row; teamkill variant (`by_teamkills ≤
  total`); no double-count when artifact counter + victim row both present;
  N-distinct-replays via artifact counter alone. 3 fail without the fix
  (verified), all pass with it.
- `repository/tests/postgres.test.ts` — 1 new integration test: raw_snapshot
  `d:1, nkd:1`, parser_events with NO counter and NO victim row → death credited
  (`total:1`) through the real DB recalc.

## Gates
- `pnpm lint` — green. `pnpm typecheck` — green. `pnpm format` — green.
- `pnpm test` (unit) — 661 passed (was 657 + 4 new); `aggregates.test.ts` 18/18.
- Coverage: `service.ts` is **100%** (stmts/branches/functions/lines) from the
  service-module unit suite. The full `pnpm test:coverage` gate runs the
  integration files (testcontainers PostgreSQL/RabbitMQ/S3); **Docker is
  unavailable in this environment**, so the repo-wide 100% gate could not be
  exercised. The `repository.ts` change (`resolvedPlayers` → `counterDeaths`) is
  covered by the new `postgres.test.ts` integration test (runs under Docker in
  CI). Per `solidstats-server-ts-tests` coverage-suppression guidance for the
  Docker-unavailable case, the unit-coverable changed file is confirmed 100%.
- No OpenAPI / schema / parser-contract change (Phase-1 API gate N/A).

## Config
- `eslint.config.js` — added `.planning/**` to ignores (the instrumentation
  script and fixtures are GSD artifacts, not application source / outside the
  tsconfig project), consistent with the existing `.agents/**` / `.claude/**`
  ignores.

## Artifacts
- `instrument.ts` + `replays.json` / `identities-zero.json` / `fixture-replays.csv`
  — the reproduction and real exported fixtures.
- `findings.sql` — the read-only staging diagnostics.

## Acceptance
- [x] Root cause confirmed by RUNNING (instrument logs the dropped replay's exact decision).
- [x] F12-timestamp / nickname-active hypothesis explicitly refuted with logged evidence.
- [x] Fix reads death from authoritative raw_snapshot; games unaffected.
- [x] One-life cap + `by_teamkills ≤ total` preserved.
- [x] Regression tests (unit red→green + integration) added.
- [x] lint / typecheck / format / unit tests green; `service.ts` 100%.
- [x] No parser, schema, or API-contract change.
