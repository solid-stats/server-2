---
phase: 17-replay-surface
plan: "01"
subsystem: public-stats
tags: [replay, keyset-pagination, steam64-scrub, parser-events, read-model]
dependency_graph:
  requires:
    - "16-slug-resolution-history-provenance (slug-or-uuid, maskSteamId, maxTimestamp, keyset primitives)"
  provides:
    - "listReplays / getReplay / getReplayEvents (consumed by 17-02 routes)"
    - "REPLAY_SORT / EVENT_SORT whitelists (consumed by 17-02 page() helper)"
    - "migration 0007 — parser_events keyset index"
  affects:
    - "src/modules/public-stats/ (repository, models, mapper, sort, fixtures)"
tech_stack:
  added: []
  patterns:
    - "timestamptz castType in SortDescriptor/KeysetDescriptor (new variant for timestamp columns)"
    - "scrubPayload deep-walk pattern (B-1 control for event jsonb)"
    - "ReplayDetailRow mapper — raw_snapshot -> typed shape with maskSteamId choke point"
key_files:
  created:
    - src/infra/db/migrations/0007_replay_event_keyset.sql
    - src/modules/public-stats/replay-mapper.ts
    - src/modules/public-stats/replay-mapper.test.ts
  modified:
    - src/modules/public-stats/routes/models.ts
    - src/modules/public-stats/routes/empty-read-model.ts
    - src/modules/public-stats/routes/tests/fixtures.ts
    - src/modules/public-stats/routes/pagination/sort.ts
    - src/modules/public-stats/routes/pagination/sort.test.ts
    - src/modules/public-stats/routes/pagination/keyset.ts
    - src/modules/public-stats/repository.ts
    - src/modules/public-stats/tests/postgres.test.ts
decisions:
  - "castType: 'timestamptz' added to SortCastType and KeysetDescriptor — timestamp columns need ::timestamptz cast in keyset predicate; 'text' produces an operator-does-not-exist error (auto-fixed Rule 1)"
  - "rotation in ReplayDetail uses slug ?? '' fallback — migration 0006 backfills slug but test seeds may omit it; empty string is safe and avoids a null rotation object when name is present"
  - "getReplayEvents resolves via parser_results (status=current) not parser_events.replay_id — column does not exist; join path: events.parser_result_id -> parser_results -> replays"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-07"
  tasks: 3
  files: 10
---

# Phase 17 Plan 01: Replay Surface Data Layer Summary

Data layer for the replay surface: migration 0007 (parser_events keyset index), read-model contract triplet (models.ts + empty-read-model.ts + fixtures.ts), replay-mapper.ts (extractMapName, mapReplayDetail, mapReplayEvent, scrubPayload B-1 control, scrubActor), REPLAY_SORT/EVENT_SORT whitelists + EVENT_PAGE_MAX/EVENT_PAGE_DEFAULT in sort.ts, and three repository methods (listReplays, getReplay, getReplayEvents) with real-pg integration tests.

## Tasks Completed

| Task | Name | Commit | Key Output |
|------|------|--------|------------|
| 1 | Migration 0007 — parser_events keyset index | fe4461f | 0007_replay_event_keyset.sql |
| 2 (RED) | Failing tests for replay-mapper + sort whitelists | 8c7c58f | replay-mapper.test.ts, sort.test.ts additions |
| 2 (GREEN) | Read-model contract + raw_snapshot detail mapper | 0af83c5 | replay-mapper.ts, models.ts, fixtures.ts, sort.ts |
| 3 | Repository methods + real-pg integration tests | 1120baf | repository.ts, postgres.test.ts |

## What Was Built

### Migration 0007
- `idx_parser_events_result_occurred` on `parser_events (parser_result_id, occurred_at, id)`
- Backs the events join lookup and `(occurred_at ASC NULLS FIRST, id ASC)` keyset order
- Idempotent (`create index if not exists`), sha256-checksummed

### replay-mapper.ts
- `extractMapName`: 6-key scan (mission/missionName/world/worldName/map/mapName)
- `scrubPayload` (B-1 control): deep recursive walk over objects AND arrays; drops any key matching `/steam_?id|sid|steam64/i`; masks any string value matching `/7656119\d{10}/` via `maskSteamId`
- `scrubActor`: derives masked actor ref from `payload.player`/`payload.observed_player_ref`, steam id routed through `maskSteamId`
- `mapReplayDetail`: groups players by side, reads FieldPresence winner_side, computes provenance via maxTimestamp, masks all `sid` values
- `mapReplayEvent`: builds payload via `scrubPayload`, actor via `scrubActor`, never returns raw payload

### models.ts (new types)
- `ReplayListFilters`, `ReplaySummary`, `ReplayDetail`, `ReplaySideSummary`, `ReplayParticipant`, `ReplayEventActor`, `ReplayEvent`
- Three new interface methods: `listReplays`, `getReplay`, `getReplayEvents`

### sort.ts
- `REPLAY_SORT = { date: { expr: "replays.replay_timestamp", nullable: true, castType: "timestamptz" } }`
- `EVENT_SORT = { time: { expr: "events.occurred_at", nullable: true, castType: "timestamptz" } }`
- `EVENT_PAGE_MAX = 200`, `EVENT_PAGE_DEFAULT = 50`

### Repository Methods
- `listReplays`: WHERE-seek (composeBountyWhere), buildReplayWhere for rotationId/fromDate/toDate, keysetResult
- `getReplay`: slug-or-uuid branch (looksLikeUuid), left join rotations + parser_results (status='current'), mapReplayDetail
- `getReplayEvents`: resolve current parser_result_id (slug-or-uuid), hard clamp to EVENT_PAGE_MAX, EVENT_SORT keyset, mapReplayEvent

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] castType: "text" fails for timestamp columns**
- **Found during:** Task 3 integration test run (first attempt)
- **Issue:** `castType: "text"` in REPLAY_SORT and EVENT_SORT caused PostgreSQL error `operator does not exist: timestamp with time zone < text` in the keyset predicate. `buildKeysetPredicate` emits `$n::text` for text keys; comparing a `timestamptz` column to `::text` is invalid.
- **Fix:** Added `"timestamptz"` as a third valid `SortCastType` variant in `sort.ts` and `keyset.ts`. Updated REPLAY_SORT.date and EVENT_SORT.time to use `castType: "timestamptz"`. Updated sort.test.ts assertions accordingly.
- **Files modified:** `sort.ts`, `keyset.ts`, `sort.test.ts`
- **Commit:** 1120baf

**2. [Rule 1 - Bug] rotation.slug null when rotation exists but slug not backfilled in test seed**
- **Found during:** Task 3 integration test — `getReplay` returned `rotation: null` despite the rotation existing
- **Issue:** `mapReplayDetail` required all three of `rotation_id`, `rotation_name`, `rotation_slug` to be non-null to build the rotation object. Test seeds insert rotations without slug (backfill is idempotent on prod but not done in test seeds). `rotation_slug` was `null`, making the whole rotation null.
- **Fix:** Changed the rotation condition to only require `rotation_id` and `rotation_name`; use `rotation_slug ?? ""` as a safe fallback for the slug field.
- **Files modified:** `replay-mapper.ts`
- **Commit:** 1120baf

## Known Stubs

None. All three methods are fully implemented with real-pg backing. The `FakePublicStatsReadModel` builders (`replaySummary`, `replayDetail`, `replayEvent`) return minimal representative stubs for route-layer unit tests (17-02).

## Threat Flags

No new threat surface beyond what is documented in the plan's `<threat_model>`. All T-17-* mitigations are implemented:
- T-17-01: All filter/cursor values bind as `$n`
- T-17-02: slug-or-uuid branch — slug never cast to `::uuid`
- T-17-03: All participant `sid` and event actor steam ids pass through `maskSteamId`; B-1 `scrubPayload` deep-walks every event payload
- T-17-04: Hard 200-row limit enforced in `getReplayEvents` regardless of caller
- T-17-05: `parser_results.status = 'current'` pinned in both `getReplay` and `getReplayEvents`

## TDD Gate Compliance

- RED gate commit: `8c7c58f` (test(17-01): failing tests)
- GREEN gate commit: `0af83c5` (feat(17-01): implementation)
- Both gates present. TDD sequence correct.

## Self-Check: PASSED

All 10 modified/created files exist on disk. All 4 commits verified in git log (`fe4461f`, `8c7c58f`, `0af83c5`, `1120baf`). Integration tests: 148 passed. Unit tests: 463 passed. Typecheck: clean.
