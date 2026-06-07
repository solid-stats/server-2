---
phase: 17-replay-surface
plan: "02"
subsystem: public-stats
tags: [replay, routes, openapi, leak-guard, steam64-scrub, cursor-pagination]
dependency_graph:
  requires:
    - "17-01 (listReplays/getReplay/getReplayEvents, REPLAY_SORT/EVENT_SORT whitelists, ReplayDetail/ReplaySummary/ReplayEvent types)"
    - "16-slug-resolution-history-provenance (SlugOrUuidParameters, paginated(), page(), BadCursorError→400 guard)"
  provides:
    - "GET /stats/replays — paginated replay list with rotationId/fromDate/toDate filters"
    - "GET /stats/replays/:id — replay detail (slug-or-uuid, 404 for unknown)"
    - "GET /stats/replays/:id/events — event timeline (ascending default, 404 for unknown)"
    - "Steam64 leak-guard extended to cover all three replay routes (empty + real-pg seeded)"
    - "openapi/server-2.openapi.json regenerated with the three new JSON routes"
  affects:
    - "src/modules/public-stats/routes/ (schemas.ts, filters.ts, routes.ts)"
    - "src/test/integration/steamid-leak-guard.test.ts"
    - "openapi/server-2.openapi.json"
tech_stack:
  added: []
  patterns:
    - "ReplayEventsQuery schema overrides order default to 'asc' (distinct from PaginationQuery 'desc') — events paginate ascending to match (occurred_at ASC NULLS FIRST, id ASC) index"
    - "registerReplayRoutes extracted as a separate function (mirrors registerPlayerHistoryRoutes) to keep registerPublicStatsRoutes within max-lines limit"
    - "Real-pg leak-guard seeded at both detail vector (raw_snapshot.players[].sid) and events vector (parser_events.payload.{player,attacker,context.crew[]}.steam_id) — B-1 control proven non-vacuous"
key_files:
  created:
    - src/modules/public-stats/routes/tests/replays.test.ts
  modified:
    - src/modules/public-stats/routes/schemas.ts
    - src/modules/public-stats/routes/filters.ts
    - src/modules/public-stats/routes/filters.test.ts
    - src/modules/public-stats/routes/routes.ts
    - src/test/integration/steamid-leak-guard.test.ts
    - openapi/server-2.openapi.json
decisions:
  - "ReplayEventsQuery declares its own order field with default 'asc' rather than reusing PaginationQuery — PaginationQuery.order defaults to 'desc' and Fastify injects the default before the handler runs, so the ?? 'asc' override approach silently received 'desc'"
  - "Leak-guard replay seeding in a separate describe block (not bolted onto the existing real-pg profile sweep) — different data lifecycle, different pool lifecycle, cleaner isolation"
  - "Unique checksums '9'.repeat(64) / '8'.repeat(64) used for replay/parse_job to avoid collision with postgres.test.ts seeds that use 'a'.repeat(64)"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-07"
  tasks: 3
  files: 7
---

# Phase 17 Plan 02: Replay Surface Routes Summary

Three replay JSON routes exposed on the public-stats child scope: TypeBox schemas, filter/query wiring, route registration with inject tests, Steam64 leak-guard extension with real-pg seeded proof, and OpenAPI regeneration.

## Tasks Completed

| Task | Name | Commit | Key Output |
|------|------|--------|------------|
| 1 | Replay TypeBox schemas + replayListFilters wiring | 1ee90e6 | schemas.ts, filters.ts, filters.test.ts |
| 2 | registerReplayRoutes + route inject tests | cfc04bc | routes.ts, tests/replays.test.ts |
| 3 | Steam64 leak-guard extension + OpenAPI regen | 0e868c2 | steamid-leak-guard.test.ts, openapi/server-2.openapi.json |

## What Was Built

### TypeBox Schemas (schemas.ts)
- `ReplaySummaryResponse` (id, slug, rotationId nullable, replayTimestamp, sourceSystem, sourceReplayId, status)
- `ReplayListResponse = paginated(ReplaySummaryResponse)`
- `ReplayDetailResponse` (id, slug, rotation {id,slug,name}|null, replayTimestamp, map|null, sides[], participants[], provenance)
- `ReplayEventResponse` (id, eventType, occurredAt, actor {displayName,steamId}|null, payload Record)
- `ReplayEventsResponse = paginated(ReplayEventResponse)`
- `ReplayListQuery = Intersect([PaginationQuery, RotationQuery, {fromDate?, toDate?}])`
- `ReplayEventsQuery` — own schema with `order` defaulting to `"asc"` (not `"desc"`)
- All corresponding `Static<>` type exports

### Filter Wiring (filters.ts)
- `replayListFilters(query)` — conditional-spread of rotationId/fromDate/toDate (same pattern as playerListFilters)
- 4-combination unit tests in filters.test.ts (none, rotation-only, dates-only, all three)

### Route Registration (routes.ts)
- `registerReplayRoutes(app, options)` registered inside the `app.register((scope) => {...})` block in `registerPublicStatsRoutes` — inherits `rejectLegacyPaginationParameters` preValidation and `mapPublicStatsError` (BadCursorError→400)
- `GET /stats/replays` — list with `REPLAY_SORT`/`REPLAY_SORT_DEFAULT` (desc)
- `GET /stats/replays/:id` — detail, 404 with `{ message: "replay not found" }` on null
- `GET /stats/replays/:id/events` — events with `EVENT_SORT`/`EVENT_SORT_DEFAULT` (asc default)

### Inject Tests (tests/replays.test.ts)
- List: 200 default page, filter pass-through, page=1&cursor=x → 400, malformed cursor → 400, unknown sort → 400
- Detail: 200 hit, 404 miss, 404 on empty read model
- Events: 200 hit, 404 miss, 404 on empty read model, mixed page+cursor → 400, malformed cursor → 400, EVENT_SORT/asc default assertion

### Leak-Guard Extension (steamid-leak-guard.test.ts)
- `PUBLIC_DETAIL_ROUTES` extended with `/stats/replays/${SWEEP_REPLAY_ID}` and `/stats/replays/${SWEEP_REPLAY_ID}/events` (empty-DB sweep — verifies zero Steam64 in 404 error bodies)
- New `describe "steamId leak guard - real-pg replay sweep (T-17-08)"` with:
  - Seeds `replays` row (slug='leaky-replay-guard'), `parse_jobs`, `parser_results` (status=current) with `raw_snapshot.players[0].sid = LEAKED_STEAM64` (detail vector)
  - Seeds `parser_events` with `payload.player.steam_id`, `payload.attacker.steam_id`, and `payload.context.crew[2].steam_id` all set to `LEAKED_STEAM64` (B-1 events vector)
  - Asserts `expectNoSteam64(response.json())` and `expectNoSteam64(response.payload)` for both the detail route (200) and events route (200)
  - `afterAll` deletes the seeded replay (cascades to parser_results, parser_events)

### OpenAPI Regen
- `pnpm run openapi:export` run; `openapi/server-2.openapi.json` updated with three new `/stats/replays` paths
- `pnpm run openapi:check` passes (no stale schema)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ReplayEventsQuery needs its own order default ("asc" not "desc")**
- **Found during:** Task 2 route inject test — "uses EVENT_SORT whitelist (not REPLAY_SORT) and ascending order by default" failed
- **Issue:** `PaginationQuery` has `order` with `default: "desc"`. Fastify injects this default before the handler runs, so `request.query.order` is always `"desc"` when the user omits the parameter — the `?? "asc"` spread override approach did not work.
- **Fix:** Defined `ReplayEventsQuery` as its own Type.Object with `order` defaulting to `"asc"` instead of reusing `PaginationQuery` directly. This makes the events route's ascending default explicit in the schema layer.
- **Files modified:** `schemas.ts`, `routes.ts`
- **Commit:** cfc04bc

**2. [Rule 1 - Bug] Checksum collision with postgres.test.ts seeds**
- **Found during:** Task 3 integration test — duplicate key violation on `replays_checksum_key`
- **Issue:** The leak-guard replay seed used `"a".repeat(64)` as checksum, which collides with `postgres.test.ts` replay seeds that insert into the same DB with the same checksum value. Integration tests run against the same PostgreSQL instance.
- **Fix:** Changed the leak-guard replay checksum to `"9".repeat(64)` and parse_job checksum to `"8".repeat(64)` — unique values not used by any other test seed. Also changed `source_replay_id` and `object_key` to use `'leaky-replay-guard'` prefix for additional uniqueness.
- **Files modified:** `steamid-leak-guard.test.ts`
- **Commit:** 0e868c2

## Known Stubs

None. All three routes are fully implemented with read-model delegation. The `FakePublicStatsReadModel` builders (`replaySummary`, `replayDetail`, `replayEvent`) provide minimal representative stubs for route-layer inject tests only.

## Threat Flags

No new threat surface beyond what is documented in the plan's `<threat_model>`. T-17-06 through T-17-09 mitigations all implemented:
- T-17-06: `SlugOrUuidParameters` (`^[A-Za-z0-9-]+$`, maxLength 128) bounds `:id` on all three routes
- T-17-07: Routes registered inside child scope → inherit mixed page+cursor 400 guard + BadCursorError→400 handler; error body is a fixed string
- T-17-08: `scrubPayload` (B-1) deep-walks event jsonb payload; leak-guard seeded at BOTH raw_snapshot.players[].sid (detail vector) AND parser_events.payload.{player,attacker,context.crew[]}.steam_id (events vector); `expectNoSteam64` asserts zero leakage
- T-17-09: `pnpm run openapi:check` gate passes on regenerated contract

## Self-Check: PASSED

All 7 modified/created files exist on disk. All 3 commits verified in git log (1ee90e6, cfc04bc, 0e868c2). Unit tests: 483 passed. Integration tests: 152 passed (including 2 new replay leak-guard tests). Typecheck: clean. OpenAPI check: clean.
