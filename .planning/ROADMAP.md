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

v3.0 is shipped. Start the next milestone:

`/gsd:new-milestone`

## Backlog

### Phase 999.1: Migrate server-2 build/dev tooling to Vite (vite+) (BACKLOG)

**Goal:** Move `server-2`'s build/dev tooling to Vite, aligning with the frontend (`web`, TanStack Start / Vite-based). Backend currently runs on `tsx`; the aim is a unified dev/build toolchain across repos. Not urgent — captured for future planning.
**Requirements:** TBD
**Plans:** not yet planned

Plans:

- [ ] TBD (promote with /gsd:review-backlog when ready)
