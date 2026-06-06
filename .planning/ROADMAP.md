# Roadmap: server-2

## Overview

`server-2` has shipped the v1.0 backend MVP and the v2.0 Backend Parity and Full-Run Readiness milestone. The v3.0 milestone completes the public read API surface the `web` frontend needs and freezes the OpenAPI contract so `web` can generate types against a stable `1.0.0` artifact. The journey front-loads two shared foundations (cursor keyset pagination + server-side sort, and server-side SteamID masking), then promotes already-computed parity stats onto public profiles, adds slug resolution / history / provenance, builds the full replay surface (the long pole), layers in admin ergonomics and the verify-only winner-fix, and closes with the contract freeze gate.

## Milestones

- [x] **v1.0 MVP** - Phases 1-8 plus closure Phase 08.1 shipped 2026-05-10. Full archive: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [x] **v2.0 Backend Parity and Full-Run Readiness** - Phases 09-13 shipped 2026-05-12. Full archive: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md); audit: [milestones/v2.0-MILESTONE-AUDIT.md](milestones/v2.0-MILESTONE-AUDIT.md)
- [ ] **v3.0 Public API v1 — complete & freeze contract for web** - Phases 14-19 (planned)

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

### v3.0 Public API v1 — complete & freeze contract for web (Phases 14-19)

**Milestone Goal:** Complete the public read API surface for `web` and freeze the OpenAPI contract at a stable `1.0.0` tag.

- [x] **Phase 14: Pagination & Masking Core** - Shared cursor keyset pagination + server-side sort helper and server-side SteamID masking, retrofitted onto existing list endpoints (completed 2026-06-05)
- [x] **Phase 14.1: Migrate agent skills to solid-stats/skills** (INSERTED) - Adopt the shared SolidStats backend skill set and remove superseded legacy skills (completed 2026-06-06)
- [ ] **Phase 15: Profile Parity Stats** - Per-player/per-squad weapons, vehicles, pvp relationships, weekly buckets, and KD/score/games surfaced on public profiles from shared parity SQL
- [ ] **Phase 16: Slug Resolution, History & Provenance** - Slug→id resolution, nickname/membership history timelines, and last-updated provenance metadata on stat responses
- [ ] **Phase 17: Replay Surface** - Replay list, detail, paginated event timeline, and replay-ID sitemap for SEO
- [ ] **Phase 18: API Ergonomics, Admin & Winner-Fix** - Bounty formula breakdown, commander-side unknown/side/rotation filters, admin rotation CRUD, and verify-and-freeze of the moderator winner-fix
- [ ] **Phase 19: Contract Freeze** - Version bump to `1.0.0`, published artifact, breaking-change diff gate, and PostgreSQL integration tests wired into CI

## Phase Details

### Phase 14: Pagination & Masking Core
**Goal**: Every list endpoint paginates with one opaque-cursor + server-side-sort contract, and full SteamIDs can never leave the server
**Depends on**: Phase 13 (v2.0 backend parity surfaces)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. An API consumer can page any migrated list endpoint (players, squads, bounty, leaderboards) with an opaque cursor instead of `page`/`pageSize`, and the `total`/`page`/`pageSize` fields no longer appear on any list response.
  2. Sorting any list endpoint by a supported field returns deterministic, stable ordering across page boundaries, including rows that share a sort value and rows with NULL sort keys (every sort tuple ends in a unique `id` tie-breaker).
  3. No public response body, cursor token, log line, or error payload contains a full Steam64 id (a `7656119\d{10}` regex finds zero matches); where SteamID identity is surfaced at all it is a masked/omitted form decided in planning.
  4. A request that mixes `page` and `cursor` is rejected rather than silently resolved.
**Plans**: 3 plans
- [x] 14-01-PLAN.md — Pagination primitives: cursor codec, sort whitelist, keyset predicate builder (Wave 1)
- [x] 14-02-PLAN.md — SteamID masking at the mapper choke point + pino redaction + zero-Steam64 leak guard (Wave 1)
- [x] 14-03-PLAN.md — Migrate players/squads/bounty/leaderboards to the cursor contract, keyset SQL, mixed-param 400, OpenAPI contract check (Wave 2)

### Phase 14.1: Migrate agent skills to solid-stats/skills (INSERTED)
**Goal**: `server-2`'s agent skill set is migrated to the shared `solid-stats/skills` repo — the SolidStats backend skills are installed and every superseded legacy skill is removed, with AGENTS.md, `skills-lock.json`, and `.planning/config.json` left mutually consistent
**Depends on**: Phase 14
**Requirements**: N/A — developer tooling / GSD workflow (no product requirement IDs)
**Success Criteria** (what must be TRUE):
  1. The five SolidStats backend skills (`solidstats-process-review-standards`, `solidstats-process-testing-standards`, `solidstats-backend-ts-conventions`, `solidstats-backend-ts-code-review`, `solidstats-backend-ts-tests`) are installed under `.claude/skills/` and recorded in `skills-lock.json`, sourced from `solid-stats/skills`.
  2. The superseded legacy skills (`api-design-principles`, `fastify-best-practices`, `nodejs-backend-patterns`, `javascript-testing-patterns`, `estesis-process-review-standards`, `estesis-frontend-react-unit-tests`, `estesis-backend-vc-swagger-spec-write`, `estesis-backend-vc-swagger-spec-review`) are removed from both `.claude/skills/` and `skills-lock.json`; the external `openapi-to-typescript` reference is retained.
  3. The AGENTS.md "Project Skills" table lists only the retained/new skills with correct "when to invoke" triggers, and `.planning/config.json` `agent_skills` matches that set exactly.
  4. A fresh `npx skills update -p` resolves cleanly with no dangling, duplicate, or unresolved entries.
**Plans**: 1 plan
- [x] 14.1-01-PLAN.md — Установка 5 solidstats-* backend/process skills, удаление 8 legacy skills, синхронизация AGENTS.md/skills-lock.json/config.json (Wave 1)

### Phase 15: Profile Parity Stats
**Goal**: Public player and squad profiles expose the already-computed parity surfaces with numbers byte-identical to the legacy export
**Depends on**: Phase 14
**Requirements**: PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05, PARITY-06
**Success Criteria** (what must be TRUE):
  1. An API consumer can fetch per-player weapon, vehicle, and pvp-relationship (killed/killers/teamkilled/teamkillers) statistics whose values match the legacy-export formulas.
  2. An API consumer can fetch per-player weekly stat buckets and read KD ratio, score, and total games on the player profile.
  3. Squad profiles expose the equivalent parity surfaces.
  4. Parity reads run as per-entity-scoped queries over a single shared `parity-sql` source (no full-corpus `parser_events` seq scan) and the CLI legacy export output stays byte-identical after the SQL extraction.
**Plans**: 3 plans
- [ ] 15-01-PLAN.md — Extract shared parity-sql (scoped/unscoped builders) + parity-formulas module; preserve byte-identical CLI export (Wave 1)
- [ ] 15-02-PLAN.md — Player parity sub-resource routes (weapons/vehicles/relationships/weekly) + KD/score/games on profile + Steam64 leak guard (Wave 2)
- [ ] 15-03-PLAN.md — Squad parity: KD/score/games byte-identical + member-aggregated weapons/relationships/weekly surfaces (Wave 3)

### Phase 16: Slug Resolution, History & Provenance
**Goal**: Public resources are addressable by slug and carry their history timelines and freshness metadata
**Depends on**: Phase 15
**Requirements**: API-01, HIST-01, HIST-02, HIST-03
**Success Criteria** (what must be TRUE):
  1. An API consumer can resolve a player, squad, or rotation by slug (not only UUID), backed by an indexed `slug` column added in the new migration shared with the replay surface.
  2. An API consumer can fetch a player's nickname/alias history with timestamps and player/squad membership history with dates, including explicit unknown gaps.
  3. Public stat responses carry a provenance / last-updated envelope populated from the actual rows returned.
**Plans**: TBD

### Phase 17: Replay Surface
**Goal**: `web`'s default replay pages are fully served: list, detail, paginated event timeline, and an SEO sitemap
**Depends on**: Phase 16 (slug migration), Phase 14 (cursor), Phase 15 (masking + identity CTE)
**Requirements**: REPLAY-01, REPLAY-02, REPLAY-03, REPLAY-04
**Success Criteria** (what must be TRUE):
  1. An API consumer can list replays filtered by rotation, date, and map with cursor pagination.
  2. An API consumer can fetch replay detail (map, rotation, date, per-side summary, participants, provenance) with no full SteamID anywhere in participants.
  3. An API consumer can page a replay's event timeline with a hard max page size and a stable cursor that handles legacy NULL `replay_timestamp` rows.
  4. A sitemap index plus paged child sitemaps (≤50k URLs each) enumerates all replay IDs for SEO indexing.
**Plans**: TBD

### Phase 18: API Ergonomics, Admin & Winner-Fix
**Goal**: Trust-and-admin surfaces are complete: explainable bounty, filterable commander-side outcomes, admin rotation CRUD, and a frozen moderator winner-fix
**Depends on**: Phase 16
**Requirements**: API-02, API-03, API-04, HIST-04
**Success Criteria** (what must be TRUE):
  1. Bounty and leaderboard responses include the formula component breakdown (victim effectiveness, squad effectiveness, rotation context).
  2. Commander-side stats expose an explicit, queryable `unknown` outcome and are filterable by rotation and side.
  3. An admin can create, update, and delete rotations via the API; non-admins are rejected.
  4. A moderator can set the commander-side winner for legacy-unknown games via the existing `legacy_winner_fix` workflow endpoint, which is verified and role-guarded (verify-and-freeze, not rebuilt).
**Plans**: TBD

### Phase 19: Contract Freeze
**Goal**: The OpenAPI contract is frozen at a stable `1.0.0` and protected by CI gates so `web` can generate types safely
**Depends on**: Phase 14, Phase 15, Phase 16, Phase 17, Phase 18 (all read routes landed)
**Requirements**: FREEZE-01, FREEZE-02, FREEZE-03, FREEZE-04
**Success Criteria** (what must be TRUE):
  1. The OpenAPI contract version is bumped from `0.1.0` to a stable `1.0.0` and a published artifact path is available for `web`'s `openapi-typescript` generation.
  2. CI classifies OpenAPI diffs against the committed baseline: additive/backward-compatible changes pass (minor bump) while breaking changes fail unless the same change intentionally bumps the major and updates the baseline snapshot.
  3. PostgreSQL integration tests run in CI as a freeze gate, verifying real serialized responses (including the no-full-SteamID guard) rather than only the static schema.
  4. No frozen list response carries `page`/`pageSize`/`total`, and no full Steam64 id appears anywhere in the `1.0.0` artifact.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16 → 17 → 18 → 19

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 14. Pagination & Masking Core | v3.0 | 3/3 | Complete   | 2026-06-05 |
| 15. Profile Parity Stats | v3.0 | 0/3 | Planned | - |
| 16. Slug Resolution, History & Provenance | v3.0 | 0/TBD | Not started | - |
| 17. Replay Surface | v3.0 | 0/TBD | Not started | - |
| 18. API Ergonomics, Admin & Winner-Fix | v3.0 | 0/TBD | Not started | - |
| 19. Contract Freeze | v3.0 | 0/TBD | Not started | - |

## Next

Plan the first phase of v3.0:

`/gsd:plan-phase 14`

## Backlog

### Phase 999.1: Migrate server-2 build/dev tooling to Vite (vite+) (BACKLOG)

**Goal:** Move `server-2`'s build/dev tooling to Vite, aligning with the frontend (`web`, TanStack Start / Vite-based). Backend currently runs on `tsx`; the aim is a unified dev/build toolchain across repos. Not urgent — captured for future planning.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)
