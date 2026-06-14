---
phase: quick-260614-fw2
plan: 01
subsystem: statistics/repository
status: complete
tags: [perf, set-based, canonical-identity, recalculation]
requires:
  - F7 set-based rotation recalc (master 2930f10 / PR #9)
provides:
  - Set-based ensureNameFallbackIdentities (O(1) DB round-trips for inner identity resolution)
affects:
  - per-rotation recalc (recalculate*ForRotation)
  - single-replay audit path (recalculate*ForParserResult)
tech-stack:
  added: []
  patterns:
    - "unnest($1::text[], $2::timestamptz[]) with ordinality for set-based occurrence resolve"
    - "insert ... select * from unnest(...) returning id for multi-row inserts"
key-files:
  created: []
  modified:
    - src/modules/statistics/repository/repository.ts
    - src/modules/statistics/repository/tests/postgres.test.ts
    - src/modules/statistics/repository/tests/utilities.ts
decisions:
  - "Compare aggregates keyed by canonical display_name (not raw player_id uuid) in the parity test, because fallback canonical players are recreated with fresh uuids on the set-based run."
metrics:
  duration: "~11 min"
  completed: "2026-06-14"
  tasks: 3
  files: 3
---

# Quick Task 260614-fw2: Set-based canonical player identity resolution Summary

Rewrote `ensureNameFallbackIdentities()` to resolve all rotation players' fallback
canonical identities in at most three DB statements (one batch resolve + two multi-row
inserts) instead of one SELECT-plus-conditional-2-INSERT per `(name, timestamp)`
occurrence — eliminating the ~9ms-per-occurrence bottleneck (the second perf bug after F7).

## What changed

### Task 1 — set-based `ensureNameFallbackIdentities` (`repository.ts`, commit 6ae1b1b)
- **Step 1 (batch resolve):** one `select occ.idx from unnest($1::text[], $2::timestamptz[]) with ordinality as occ(name, ts, idx) where exists (...)` against the PRE-INSERT snapshot under the EXACT original predicate (`lower(display_name) = lower(name)` OR active-nickname-window match at the occurrence timestamp). Collects matched 1-based ordinality values into a Set; mapped back to 0-based via `idx - 1`.
- **Step 2 (ordered in-memory replay):** iterates occurrences in `uniqueNameOccurrences` order maintaining a `createdLowerNames` Set. Skip if matched pre-insert; skip if `lower(name)` already scheduled this run (replicates the original loop's display_name match against a just-created fallback, which is timestamp-independent); otherwise schedule. No DB mutation during this pass.
- **Step 3 (two multi-row inserts):** `insert into canonical_players (display_name) select * from unnest($1::text[]) returning id` (ids align with `toCreate` by position), then `insert into player_nicknames (player_id, nickname, observed_from, evidence) select * from unnest($1::uuid[], $2::text[], $3::timestamptz[], $4::jsonb[])`. Same evidence JSON `{ source: "parser_artifact_name_fallback" }`, `observed_from` = occurrence timestamp, `observed_to` default null. Count-mismatch throws the existing `"canonical player fallback insert did not return id"` error.
- Signature, name, file, and call site (`loadPlayerIdentities` awaits it) unchanged — drop-in for both `*ForRotation` and `*ForParserResult`. `loadPlayerIdentities`, `uniqueNameOccurrences`, audit semantics, legacy-public-export, and `ops:stats:recalculate` report shape untouched.

### Task 2 — fallback-stress parity test (`postgres.test.ts`, commit 84d51c7)
- New real-pg `it(...)`: a single rotation with two brand-new name-only players ("Ghost" in both replays at two different timestamps; "Wraith" once) plus one steam-id player, with kill/teamkill events.
- Runs the per-replay path, snapshots aggregates + fallback rows, then deletes the fallback-created identities and resets aggregates/rotations, runs the set-based path, and asserts byte-identical aggregates AND identical fallback `canonical_players`/`player_nicknames` rows. Asserts "Ghost" collapses to exactly one fallback canonical player. Non-vacuous guards included.
- Added `namedAggregateSnapshot()` (aggregates keyed by `display_name`) and `fallbackIdentitySnapshot()` (normalized fallback rows ordered by `display_name, observed_from`).

### Task 3 — verification + unit mock fix (`utilities.ts`, commit 851d5bd)
- The `ScriptedClient` unit mock asserted the OLD per-occurrence query shapes; the Task 1 rewrite changed the SQL, so the mock was updated to route the new set-based queries (`select occ.idx ...` resolve → matched ordinality indices; multi-row canonical insert → one id per requested name; nickname insert → no rows). `missingInsertedPlayerId` now exercises the new count-mismatch guard. Extracted a `fallbackIdentityRows` helper to keep `rowsFor` under the `max-statements` lint cap.

## Verification

| Gate | Result |
|------|--------|
| `pnpm run format` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run typecheck` | PASS |
| `pnpm test` (unit) | PASS — 569/569 |
| `pnpm run openapi:check` | PASS |
| `pnpm run ops:boundary:check` | PASS |
| `pnpm run ops:backup:check` | PASS |
| `git diff openapi/` | empty (contract untouched) |
| `pnpm run test:integration` | 164/165 — only failure is the pre-existing `adapters.test.ts` RabbitMQ smoke test (`ECONNREFUSED 127.0.0.1:5673`); my new `postgres.test.ts` fallback parity test PASSES against real Postgres |
| `pnpm run test:coverage` | 733/734 — same single RabbitMQ-only failure; no coverage-threshold failure |

## Environment note (follow-up the user must run)

Contrary to the task's stated assumption, **Postgres WAS reachable** in this environment
(port 15432 up), so the real-pg parity proof in `postgres.test.ts` actually ran and passed —
the byte-identical equivalence (aggregates + fallback rows, including same-name-two-timestamps
single-fallback) is verified, not just type-checked.

**RabbitMQ was NOT reachable** (port 5673 down). The only failing test across the whole suite
is `src/test/integration/adapters.test.ts` — a dependency-connectivity smoke test that pings
PostgreSQL + RabbitMQ + S3; it fails solely on RabbitMQ `ECONNREFUSED`, unrelated to this
change. Because of it, `pnpm verify` cannot exit 0 in this environment.

**Action for the user:** on a machine with RabbitMQ up (`docker compose up`), run `pnpm verify`
to get a fully green pipeline. No code change is expected to be needed — every gate except the
RabbitMQ connectivity smoke test already passes here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unit mock (`ScriptedClient`) broke after the Task 1 SQL rewrite**
- **Found during:** Task 3 (`pnpm test`)
- **Issue:** `bounty.test.ts`, `commander.test.ts`, and `index.test.ts` (18 tests) failed because `utilities.ts` matched the OLD per-occurrence query text (`select cp.id from canonical_players`) which no longer exists; the mock returned empty rows and the new count-mismatch guard threw.
- **Fix:** Updated the mock to route the new set-based queries and return matched ordinality indices / one id per requested display_name; extracted `fallbackIdentityRows` to stay under `max-statements`.
- **Files modified:** `src/modules/statistics/repository/tests/utilities.ts`
- **Commit:** 851d5bd

**2. [Rule 1 - Bug] Parity test keyed aggregates by non-deterministic fallback uuid**
- **Found during:** Task 2 (first real-pg run)
- **Issue:** `aggregateSnapshot()` orders/keys by raw `player_id` uuid. Fallback canonical players get fresh uuids on the set-based run (they are deleted and recreated), so the uuid-keyed snapshot diffed on identity even though per-player values were identical.
- **Fix:** Added `namedAggregateSnapshot()` keyed by `display_name` (the stable cross-run key) and dropped the uuid-bearing `inputs` jsonb from the bounty comparison; fallback-row snapshot already excludes id/created_at per the CONTEXT proof.
- **Files modified:** `src/modules/statistics/repository/tests/postgres.test.ts`
- **Commit:** 84d51c7

## Post-execution: code review + full verify (orchestrator)

**Code review (`solidstats-server-ts-code-review`, REVIEW.md): REQUEST CHANGES — 1×🟠 fixed.**
- 🟠 The fallback insert linked `canonical_players` RETURNING rows to the input list by positional
  zip. Postgres does not guarantee `INSERT ... RETURNING` row order, so a reorder could attach a
  nickname to the wrong canonical player. **Fixed (commit fa7c54b):** the canonical insert now
  `returning id, display_name`, and nicknames link via a `display_name -> id` Map (names are unique
  by `lower(name)` per the `createdLowerNames` guard). The redundant count-mismatch guard was removed;
  the `missingInsertedPlayerId` rollback test now exercises the Map-miss throw (kept green, 100% cov).
- 🟡 typed-error nit: subsumed — the single remaining throw reuses the existing message and the
  existing rollback test; no new error type introduced (out of scope for this perf task).

**Verification (VERIFICATION.md): human_needed → resolved.** Infra (Postgres/RabbitMQ/MinIO) was
brought up by the user; full `pnpm verify` now exits 0 — format, lint, typecheck, unit (569),
integration + real-pg parity (`postgres.test.ts`), openapi:check (contract diff empty),
ops:backup/boundary, and coverage **100%** (statements/branches/functions/lines, 734/734 tests). The
earlier `adapters.test.ts` connectivity failures (5673 RabbitMQ, 9000 S3) were pre-existing infra-only
and are now green.

## Known Stubs

None.

## Self-Check: PASSED
- src/modules/statistics/repository/repository.ts — FOUND (modified)
- src/modules/statistics/repository/tests/postgres.test.ts — FOUND (modified)
- src/modules/statistics/repository/tests/utilities.ts — FOUND (modified)
- Commit 6ae1b1b — FOUND
- Commit 84d51c7 — FOUND
- Commit 851d5bd — FOUND
- Commit fa7c54b (review fix) — FOUND
- `pnpm verify` exit 0, coverage 100% — VERIFIED
