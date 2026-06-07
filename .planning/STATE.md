---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Public API v1 — complete & freeze contract for web
status: verifying
stopped_at: Completed 17-03-PLAN.md
last_updated: "2026-06-07T18:24:37.803Z"
last_activity: 2026-06-07 -- Phase 19 execution started
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 23
  completed_plans: 23
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-31)

**Core value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.
**Current focus:** Phase 19 — contract-freeze

## Current Position

Phase: 19 (contract-freeze) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-06-07 -- Phase 19 execution started

Progress: Phase 17 [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 54 (across v1.0 + v2.0)
- Average duration: N/A
- Total execution time: N/A

**By Phase (v3.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14 | 3/3 | ~94m | ~31m |
| 15 | 0/TBD | - | - |
| 16 | 0/TBD | - | - |
| 17 | 0/TBD | - | - |
| 18 | 5 | - | - |
| 19 | 0/TBD | - | - |

**Recent Trend:**

- Last 5 plans: Phase 11 plan 11-02, Phase 12 plans 12-01..02, Phase 13 plans 13-01..02 (v2.0, shipped)
- Trend: v1.0 and v2.0 archived; v3.0 roadmap defined, planning begins at Phase 14

| Phase 14.1 P01 | 15min | 3 tasks | 3 files |
| Phase 16-slug-resolution-history-provenance P04 | 20m | 2 tasks | 1 files |
| Phase 16 P06 | 1116 | 2 tasks | 8 files |
| Phase 17-replay-surface P01 | ~25m | 3 tasks | 10 files |
| Phase 17-replay-surface P02 | ~20m | 3 tasks | 7 files |
| Phase 17-replay-surface P03 | 45 | 3 tasks | 14 files |
| Phase 18 P01 | 8min | 2 tasks | 5 files |
| Phase 18 P18-03 | 6min | 2 tasks | 3 files |
| Phase 18 P18-02 | 6min | 2 tasks | 7 files |
| Phase 18 P04 | 12min | 2 tasks | 8 files |
| Phase 18 P18-05 | 12min | 2 tasks | 3 files |
| Phase 19 P19-01 | 13min | 2 tasks | 3 files |
| Phase 19 P19-02 | 5min | 2 tasks | 2 files |

## Accumulated Context

### Roadmap Evolution

- v1.0 shipped with Phases 1-8 plus inserted closure Phase 08.1.
- v2.0 Backend Parity and Full-Run Readiness shipped with Phases 09-13.
- v3.0 Public API v1 defined with Phases 14-19; 27/27 requirements mapped, no orphans.
- v3.0 ordering follows research D0→A→C→B→G grouping: pagination/masking core first, then parity, then slug/history/provenance, then the replay long pole, then admin ergonomics + winner-fix, then the closing contract freeze.
- Phase 14.1 inserted after Phase 14: Migrate agent skills to solid-stats/skills (install solidstats-* backend skills, remove legacy) (URGENT)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- Cursor pagination + server-side sort replaces `page`/`pageSize`/`total` on all list endpoints (clean break; `web` is a new consumer).
- SteamID masking is server-side only and enforced at the row→payload mapper boundary; full Steam64 ids must never reach `web` (live leak today must close before freeze).
- Parity stats reuse a shared extracted `parity-sql` source with per-entity-scoped queries — never the bulk legacy-export SQL in hot paths; derived numbers stay byte-identical to the CLI export.
- The replay surface includes the only schema change: a `slug` column migration shared with API-01 slug resolution.
- The moderator commander-side winner fix already exists as the `legacy_winner_fix` workflow — verify and freeze it, do not rebuild.
- Contract freeze adds a breaking-change diff gate (beyond the byte-diff drift check) and promotes PostgreSQL integration tests into CI; freeze depends on all read routes landing first.
- Add zero new runtime dependencies; all capabilities are pattern additions on the shipped stack.
- [Phase ?]: Phase 14.1: skills-lock.json приведён вручную — npx skills remove не чистит lock, только каталоги
- [Phase ?]: Phase 14.1: порядок операций install -> prune lock -> remove dirs, иначе update -p воскрешает каталоги из stale lock-записей
- [Phase ?]: c8 ignore for valid_from null guards — NOT NULL per schema
- [Phase ?]: slugify dead guard removed — all CYRILLIC_TRANSLITERATION cyr values non-empty
- [17-01]: timestamptz castType added to SortCastType/KeysetDescriptor — timestamp columns need ::timestamptz cast in keyset predicate; 'text' causes operator-does-not-exist on timestamptz comparison
- [17-01]: rotation.slug fallback to empty string in mapReplayDetail — test seeds may not include slug backfill; empty string is safe when rotation_name is present
- [17-02]: ReplayEventsQuery declares its own order field defaulting to "asc" — PaginationQuery.order defaults to "desc" and Fastify injects the default before handlers run; ?? 'asc' override receives the already-injected "desc"
- [17-02]: Real-pg leak-guard seeded with two distinct leak vectors: raw_snapshot.players[].sid (detail) AND parser_events.payload.{player,attacker,context.crew[]}.steam_id (events B-1 control)
- [Phase ?]: Sitemap routes registered as sibling top-level plugin to avoid cursor guard and OpenAPI registration
- [Phase ?]: 18-01: bounty breakdown derived from stored inputs at mapBounty (no recompute); inputs.version widened to keep version!==1 guard live
- [Phase ?]: 18-02: CommanderSideQuery = Intersect of RotationQuery and optional side; shared RotationQuery not mutated so rotationFilters keeps its narrow contract
- [Phase ?]: 18-02: side predicate composed via rotationWhere.sqlWith (commander.side = next placeholder ::text), index = values.length+1, value appended to bound array — param-bound, never interpolated
- [Phase ?]: 18-02: unknownOutcomes verify-only (already row to response, required in regenerated contract); SQL composition tested via pool-stub sql/values capture, not pure-mapper
- [Phase ?]: 18-04: admin rotation routes tested with in-memory repo double (route-layer signal->status mapping); Pg impl + DB constraints covered by 18-03 unit tests + real-pg profile
- [Phase ?]: 18-05: legacy_winner_fix verified-and-frozen with ZERO source diff; not rebuilt
- [Phase ?]: 18-05: Steam64 leak-guard write-route sweep is DB-free (in-memory repos + fake Steam callback), asserting expectNoSteam64 over /admin/rotations POST/PUT/DELETE + winner-fix bodies
- [Phase 19]: Contract version owned solely by register-openapi.ts (1.0.0); package.json stays 0.1.0 for a single contract-version source of truth
- [Phase 19]: Frozen-contract pagination assertion scoped to public /stats/* top-level metadata (excludes /operations/* offset pagination and nested domain total); kept non-vacuous via inspected>0 + a negative-control test
- [Phase ?]: [19-02]: oasdiff contract-diff is a SEPARATE required CI job (not inline verify step); exact tag v0.0.56, fail-on ERR, git-revision base + fetch-depth:0 + PR-only guard
- [Phase ?]: [19-02]: FREEZE-04 verify-and-keep — existing Verify job (pnpm run verify -> test:integration real-pg leak guard) is the PG integration freeze gate, confirmed with zero edits

### Pending Todos

- Resolve before/within planning: masked-last-4 vs drop the SteamID field entirely; replay-event ordering key (sequence vs `occurred_at`+id) and legacy NULL `replay_timestamp` handling; whether any `web` UI needs an approximate total endpoint; choice of breaking-change diff tool (oasdiff vs `@redocly/cli`).

### Blockers/Concerns

- ~~SteamID leak is LIVE today via `PlayerProfileResponse.steamIds`~~ — RESOLVED in 14-02 (masked at mapper) and re-verified in 14-03 (real-pg + error-path leak guard, zero `7656119\d{10}` over bodies/tokens/exported OpenAPI).
- Local verification emits Node engine warnings (active shell Node v22.x vs repo target Node >=25 <26).
- Legacy snapshot SSH access is session context only; never commit host/key values into planning docs or source.
- Research flags Phases 14, 17, and 19 as likely needing `/gsd:plan-phase --research-phase` (keyset NULL/tuple subtleties, replay ordering/sitemap sizing, freeze tooling).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260510-hc5 | Remove staging ingress from server-2 CD | 2026-05-10 | dbe5025 | [260510-hc5-remove-staging-ingress-from-server-2-cd](./quick/260510-hc5-remove-staging-ingress-from-server-2-cd/) |

## Deferred Items

Items acknowledged and carried forward from milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| debug_session | no-steamid-name-stats | unknown | v2.0 close |
| quick_task | 260510-hc5-remove-staging-ingress-from-server-2-cd | missing | v2.0 close |

## Session Continuity

Last session: 2026-06-07T18:23:53.035Z
Stopped at: Completed 17-03-PLAN.md
Resume file: None
