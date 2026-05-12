# Roadmap: server-2

## Overview

`server-2` v2.0 focuses on Backend Parity and Full-Run Readiness. The milestone makes the backend explain, recalculate, export, and compare trusted public statistics before downstream `web` implementation starts.

The v2.0 milestone is the first step in the cross-app sequence:

1. `server-2` defines parity semantics, reports, exports, and diff contracts.
2. `replays-fetcher` makes full-corpus ingest resumable and observable.
3. `infrastructure` runs the controlled full corpus, captures legacy snapshots, and stores evidence.
4. `web` builds on stable backend data and generated API types.

## Milestones

- [x] **v1.0 MVP** - Phases 1-8 plus closure Phase 08.1 shipped 2026-05-10. Full archive: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [ ] **v2.0 Backend Parity and Full-Run Readiness** - Phases 09-13. Goal: prove `server-2` public statistics match trusted legacy `sg_stats` outputs closely enough to unblock `web` planning and implementation.

## Proposed Roadmap

**5 phases** | **34 requirements mapped** | **0 unmapped**

| Phase | Name | Goal | Requirements | Success Criteria |
|-------|------|------|--------------|------------------|
| 09 | Parser Counter Ingestion and Aggregate Semantics | Consume parser compact counters as authoritative replay-level counter evidence for public stats. | STAT-10, STAT-11, STAT-12, STAT-13, STAT-14, STAT-15 | 4 |
| 10 | Full-Run Recalculation and Coverage Report | Let operators prove what was recalculated, skipped, stale, or failed. | OPS-07, OPS-08, OPS-09, OPS-10, OPS-11, OPS-12 | 4 |
| 11 | Rotation and No-SteamID Identity Readiness | Prevent parsed replay data from silently dropping out because rotation or identity evidence is missing. | DATA-07, DATA-08, DATA-09, DATA-10, DATA-11, DATA-12, DATA-13 | 4 |
| 12 | Legacy Public Export Contract | Export deterministic `server-2` public-stat surfaces that can be compared to legacy output. | PUB-07, PUB-08, PUB-09, PUB-10, PUB-11, PUB-12, PUB-13, API-05 | 4 |
| 13 | Diff Harness Contract and Boundary Guards | Define the strict old-vs-new comparison contract and keep runtime orchestration out of the app repo. | DIFF-01, DIFF-02, DIFF-03, DIFF-04, DIFF-05, DIFF-06, OPS-13 | 4 |

## Phase Details

### Phase 09: Parser Counter Ingestion and Aggregate Semantics

**Goal:** `server-2` consumes parser compact player counters as authoritative replay-level counter input for public stats while preserving kill-row evidence for relationships, weapons, vehicles, and bounty.

**Requirements:** STAT-10, STAT-11, STAT-12, STAT-13, STAT-14, STAT-15

**Success criteria:**

1. Parser artifact mapping persists compact counter evidence `d`, `td`, `tk`, `su`, `nkd`, `ud`, `vk`, and `kfv` without losing existing kill-row context.
2. Aggregate calculation uses parser death counters for public death totals and keeps kill rows for attacker/victim relationships and weapon/vehicle details.
3. Tests cover enemy death, teamkill death, suicide, null-killer death, unknown death, vehicle kill, kills-from-vehicle, kill rows, and bounty exclusions.
4. Backend docs explain counter semantics and identify parser-contract blockers that would require `replay-parser-2` support.

### Phase 10: Full-Run Recalculation and Coverage Report

**Goal:** An operator can prove what parser results were recalculated and what was skipped, stale, or failed without relying on one-off SQL.

**Requirements:** OPS-07, OPS-08, OPS-09, OPS-10, OPS-11, OPS-12

**Success criteria:**

1. A supported command can idempotently recalculate all current parser results on sample, partial staging, and future full-corpus inputs.
2. The report includes parser result count, recalculated count, skipped count, missing rotation count, missing timestamp count, missing identity count, changed aggregate rows, and failures.
3. The status surface separates staged, promoted, parsed, parser-result-current, recalculated, skipped, and stale states.
4. Skips and failures include replay identifiers, reason codes, and enough context for an operator to fix inputs or retry.

### Phase 11: Rotation and No-SteamID Identity Readiness

**Goal:** Public stats do not silently drop parsed replay data because rotations or no-SteamID identity evidence is missing.

**Requirements:** DATA-07, DATA-08, DATA-09, DATA-10, DATA-11, DATA-12, DATA-13

**Success criteria:**

1. Readiness checks prove every replay timestamp maps to exactly one rotation or a documented excluded range.
2. Missing-rotation replays and unresolved observed nicknames are listed in operator-readable output.
3. No-SteamID players resolve through nickname history or provisional observed-name identity according to auditable rules.
4. Nickname history import/export, validity windows, conflict reporting, and future SteamID migration behavior are documented or supported where needed for parity.

### Phase 12: Legacy Public Export Contract

**Goal:** `server-2` can export deterministic legacy-comparable public statistics for the old-vs-new diff gate and downstream `web` planning.

**Requirements:** PUB-07, PUB-08, PUB-09, PUB-10, PUB-11, PUB-12, PUB-13, API-05

**Success criteria:**

1. Operators can export player global stats, squad stats, rotation-scoped stats, and legacy detail surfaces including `other_players`, `weapons`, and `weeks`.
2. Exported fields include kills, kills from vehicle, vehicle kills, teamkills, deaths, KD, score, total played games, relationships, weapons, weekly buckets, and visible player/squad identity.
3. Export output is deterministic and includes source database, command version, input corpus scope, generated time, and contract metadata.
4. Any API/OpenAPI shape changes needed for parity status or future `web` consumption update the committed OpenAPI artifact and compatibility docs in the same change.

### Phase 13: Diff Harness Contract and Boundary Guards

**Goal:** `server-2` defines the new-stat export side of a reproducible old-vs-new comparison while preserving app/infrastructure ownership boundaries.

**Requirements:** DIFF-01, DIFF-02, DIFF-03, DIFF-04, DIFF-05, DIFF-06, OPS-13

**Success criteria:**

1. The diff contract defines new export shape, strict failures, input metadata, summary counts, known differences, and `review_required` output.
2. The only default known public-data difference class is documented `deaths.byTeamkills` duplicate-slot/respawn behavior.
3. The contract supports sample, partial staging corpus, and final full-corpus comparisons.
4. CI prevents app workflows from reintroducing staging SSH, `kubectl`, Kubernetes Secret mutation, or rollout orchestration.

## Progress

| Milestone | Phases | Requirements | Status | Shipped |
|-----------|--------|--------------|--------|---------|
| v1.0 MVP | 9 | 68/68 | Shipped | 2026-05-10 |
| v2.0 Backend Parity and Full-Run Readiness | 5 | 6/34 | In progress | - |

## Next

Continue with Phase 10:

`$gsd-discuss-phase 10`

Also available:

`$gsd-plan-phase 10`
