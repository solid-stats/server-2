---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Backend Parity and Full-Run Readiness
status: in_progress
last_updated: "2026-05-12T22:19:03+07:00"
last_activity: 2026-05-12 -- Completed Phase 11 rotation and no-SteamID identity readiness
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-12)

**Core value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.
**Current focus:** Phase 12 - Legacy Public Export Contract

## Current Position

Phase: 12 - Legacy Public Export Contract
Plan: —
Status: Phase 11 complete; ready to discuss or plan Phase 12
Last activity: 2026-05-12 -- Completed Phase 11 with rotation coverage reporting, no-SteamID identity readiness classification, operator documentation, and passing full verification

## Performance Metrics

**Velocity:**

- Total plans completed: 45
- Average duration: N/A
- Total execution time: N/A

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4/4 | - | - |
| 2 | 4/4 | - | - |
| 3 | 5/5 | - | - |
| 4 | 5/5 | - | - |
| 5 | 4/4 | - | - |
| 6 | 3/3 | - | - |
| 7 | 5/5 | - | - |
| 8 | 5/5 | - | - |
| 08.1 | 4/4 | - | - |
| 09 | 2/2 | - | - |
| 10 | 2/2 | - | - |
| 11 | 2/2 | - | - |

**Recent Trend:**

- Last 5 plans: Phase 09 plan 09-02, Phase 10 plans 10-01 through 10-02, and Phase 11 plans 11-01 through 11-02
- Trend: v1.0 is archived; v2.0 execution is underway with Phases 09, 10, and 11 complete and Phase 12 next

## Accumulated Context

### Roadmap Evolution

- v1.0 shipped with Phases 1-8 plus inserted closure Phase 08.1.
- Phase 08.1 closed v1 runtime integration gaps found by the milestone audit.
- ROADMAP.md now keeps a compact milestone summary; full v1.0 details live in `.planning/milestones/v1.0-ROADMAP.md`.
- v1.0 requirements are archived in `.planning/milestones/v1.0-REQUIREMENTS.md`.
- v2.0 Backend Parity and Full-Run Readiness starts at Phase 09 and contains Phases 09-13.
- v2.0 requirements are defined in `.planning/REQUIREMENTS.md` and all 34 requirements are mapped to roadmap phases.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting next work:

- v1.0 backend contract is the source of truth for adjacent app integration.
- Parser artifacts are loaded from S3-compatible storage and persisted as snapshots before normalized event recalculation.
- Public stats production reads use PostgreSQL aggregate-backed data.
- Production auth, sessions, requests, moderation, audit patches, workflow actions, and reference validation use PostgreSQL-backed adapters.
- Approved stats correction audit patches apply parser-result/parser-event input patches before aggregate recalculation.
- Approved request workflow actions apply legacy winner fixes, Steam links, player merges, and player splits through a production workflow applier before recording history.
- v2.0 starts with `server-2` parity tools before `replays-fetcher`, `infrastructure`, or `web` milestones.
- Parser compact counters are the intended replay-level evidence for public death counters; kill rows remain necessary for relationships, weapons, vehicles, and bounty inputs.
- Phase 09 preserves parser compact counters as `player_counter` events, uses compact death counters for aggregate deaths when present, keeps kill rows for relationship/weapon/vehicle/bounty evidence, and documents the contract in `docs/parser-counter-semantics.md`.
- Phase 10 adds `pnpm run ops:stats:coverage` and `pnpm run ops:stats:recalculate` as supported PostgreSQL-backed operator surfaces for current parser result coverage, stale detection, skips/failures, and idempotent aggregate backfill. Details live in `docs/full-run-recalculation.md`.
- Phase 11 adds `pnpm run ops:stats:readiness` as a read-only PostgreSQL-backed operator surface for replay rotation coverage, no-SteamID identity classification, unresolved observed names, and nickname-history conflicts. Details live in `docs/rotation-identity-readiness.md`.
- Diff output remains `review_required`; production cutover approval is out of scope for this milestone.

### Pending Todos

- Continue Phase 12 with `$gsd-discuss-phase 12` or `$gsd-plan-phase 12`.
- Keep adjacent app boundaries aligned: `replays-fetcher` owns full-corpus ingest resilience, `infrastructure` owns controlled runtime orchestration and legacy snapshot capture, `replay-parser-2` changes only for concrete contract blockers, and `web` waits for stable backend parity evidence.

### Blockers/Concerns

- Local verification emits Node engine warnings because the active shell is Node v22.22.2 while the repo targets Node >=25 <26.
- GSD subagents are not installed in this Codex runtime, so v2.0 requirements and roadmap were generated inline from the supplied brief and existing evidence.
- Legacy snapshot SSH access was provided as session context and should not be committed as host/key values in planning docs or source.
- Adjacent app contract handoff still needs to be consumed during their own integration cycles.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260510-hc5 | Remove staging ingress from server-2 CD | 2026-05-10 | dbe5025 | [260510-hc5-remove-staging-ingress-from-server-2-cd](./quick/260510-hc5-remove-staging-ingress-from-server-2-cd/) |

## Deferred Items

Items acknowledged and carried forward from milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-10T10:56:00+07:00
Stopped at: v1.0 milestone completed and archived
Resume file: .planning/milestones/v1.0-MILESTONE-AUDIT.md

## Operator Next Steps

- Continue Phase 12 with `$gsd-discuss-phase 12` or `$gsd-plan-phase 12`.
