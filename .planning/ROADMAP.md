# Roadmap: server-2

## Overview

`server-2` has shipped the v1.0 backend MVP, the v2.0 Backend Parity and Full-Run Readiness milestone, and the v3.0 Public API v1 milestone. v3.0 completed the public read API surface the `web` frontend needs and froze the OpenAPI contract at a stable `1.0.0` artifact, protected by CI gates (byte-equality drift + oasdiff breaking-change classification + the PostgreSQL integration freeze gate).

## Milestones

- [x] **v1.0 MVP** - Phases 1-8 plus closure Phase 08.1 shipped 2026-05-10. Full archive: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [x] **v2.0 Backend Parity and Full-Run Readiness** - Phases 09-13 shipped 2026-05-12. Full archive: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md); audit: [milestones/v2.0-MILESTONE-AUDIT.md](milestones/v2.0-MILESTONE-AUDIT.md)
- [x] **v3.0 Public API v1 — complete & freeze contract for web** - Phases 14-19 shipped 2026-06-08. Full archive: [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md); audit: [milestones/v3.0-MILESTONE-AUDIT.md](milestones/v3.0-MILESTONE-AUDIT.md)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>v1.0 MVP (Phases 1-8 plus 08.1) - shipped 2026-05-10</summary>

- [x] Phase 1: API Foundation and Runtime Infrastructure
- [x] Phase 2: Domain Schema and Identity Foundation
- [x] Phase 3: Ingest Promotion and Parser Job Lifecycle
- [x] Phase 4: Parser Results and Aggregate Statistics
- [x] Phase 5: Public Statistics API
- [x] Phase 6: Authentication and Role Management
- [x] Phase 7: Requests, Moderation, and Audited Corrections
- [x] Phase 8: Operations and Production Readiness
- [x] Phase 08.1: Close v1 Runtime Integration Gaps

</details>

<details>
<summary>v2.0 Backend Parity and Full-Run Readiness (Phases 09-13) - shipped 2026-05-12</summary>

- [x] Phase 09: Parser Counter Ingestion and Aggregate Semantics (2/2 plans)
- [x] Phase 10: Full-Run Recalculation and Coverage Report (2/2 plans)
- [x] Phase 11: Rotation and No-SteamID Identity Readiness (2/2 plans)
- [x] Phase 12: Legacy Public Export Contract (2/2 plans)
- [x] Phase 13: Diff Harness Contract and Boundary Guards (2/2 plans)

</details>

<details>
<summary>v3.0 Public API v1 — complete & freeze contract for web (Phases 14-19) - shipped 2026-06-08</summary>

- [x] Phase 14: Pagination & Masking Core (3/3 plans) — completed 2026-06-05
- [x] Phase 14.1: Migrate agent skills to solid-stats/skills (INSERTED) (1/1 plan) — completed 2026-06-06
- [x] Phase 15: Profile Parity Stats (3/3 plans) — completed 2026-06-07
- [x] Phase 16: Slug Resolution, History & Provenance (6/6 plans) — completed 2026-06-07
- [x] Phase 17: Replay Surface (3/3 plans) — completed 2026-06-07
- [x] Phase 18: API Ergonomics, Admin & Winner-Fix (5/5 plans) — completed 2026-06-08
- [x] Phase 19: Contract Freeze (2/2 plans) — completed 2026-06-08

</details>

## Next

Parity milestone — Phase 1 added. Next:

`/gsd-plan-phase 1`

## Phases — Parity (active)

### Phase 1: Game-Type-Aware Statistics (Parity)

**Goal:** Persist a canonical game_type (sg/mace/sm) and compute aggregates per game type — sg per-rotation + all-time, mace/sm all-time only — through the recalc → legacy-export / parity-sql path so the new-side per-type export matches legacy `sg_stats`. Parity-first: the public stats HTTP API / OpenAPI-web contract and replays-fetcher stay unchanged.
**Requirements:** Port the legacy `sg-replay-parser` rules — prefix classify (sg/mace/sm, exclude anything starting with `sgs`) + includeReplays overrides; sm replays before `2023-01-01` excluded; mace replays with `<10` players skipped; filterPlayersByTotalPlayedGames (≥20, or 15% when games <125, as an `isShow` flag); excludeReplays (16 links); a game_type migration + a new all-time aggregation path. Spec: `plans/product/PARITY-BASELINE-FINDINGS.md` (F8).
**Depends on:** none (v3.0 shipped; parity perf fixes F7 + quick-260614-fw2 already on master)
**Plans:** 5 plans

Plans:

- [ ] 01-01-PLAN.md — Migration 0008: canonical replays.game_type + game_type dimension + nullable rotation_id + NULLS NOT DISTINCT uniqueness + is_show (D1/D2/D3) [wave 1]
- [ ] 01-02-PLAN.md — Include/exclude config module + pure legacy classifier + set-based classifyGameTypesForCurrentReplays + rotation-parity guard (D2/D4) [wave 2]
- [ ] 01-03-PLAN.md — Game-type-aware recalc: per-type + all-time aggregation, is_show persist, audit/report shape preserved (D1/D3) [wave 3]
- [ ] 01-04-PLAN.md — Per-type/all-time legacy-export + parity-sql emission with is_show split, OpenAPI contract empty [wave 4]
- [ ] 01-05-PLAN.md — Extend real-pg parity harness: per-type + all-time + is_show parity proof (F8) [wave 5]

## Backlog

### Phase 999.1: Migrate server-2 build/dev tooling to Vite (vite+) (BACKLOG)

**Goal:** Move `server-2`'s build/dev tooling to Vite, aligning with the frontend (`web`, TanStack Start / Vite-based). Backend currently runs on `tsx`; the aim is a unified dev/build toolchain across repos. Not urgent — captured for future planning.
**Requirements:** TBD
**Plans:** not yet planned

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)

