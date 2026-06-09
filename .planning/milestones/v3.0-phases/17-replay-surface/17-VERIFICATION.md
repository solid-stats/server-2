---
phase: 17-replay-surface
verified: 2026-06-07T15:12:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
gaps: []
---

# Phase 17: Replay Surface Verification Report

**Phase Goal:** `web`'s default replay pages are fully served: list, detail, paginated event timeline, and an SEO sitemap. Constraints: additive pattern reuse on `public-stats`, ZERO new runtime deps, NO cross-app contract changes, NO full Steam64 (`7656119\d{10}`) ever reaching `web`.
**Verified:** 2026-06-07T15:12:00Z
**Status:** passed
**Re-verification:** No — initial verification (prior `17-VERIFICATION.md` was an empty file)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | API consumer can list replays filtered by rotation + date range with cursor pagination (map filter DEFERRED) | ✓ VERIFIED | `repository.ts:853-882` `listReplays` selects from `replays`, `buildReplayWhere` (1281-1306) binds `rotation_id`/`fromDate`/`toDate` as `$n` params; `keysetSeek(REPLAY_SORT,...)` over `(replay_timestamp DESC NULLS LAST, id DESC)` via `REPLAY_SORT.date` (sort.ts:106-115, `nullable:true`). Route `GET /stats/replays` wired (routes.ts:478-492). Map filter intentionally absent; deferral documented in ROADMAP SC#1 + 17-CONTEXT. |
| 2 | API consumer can fetch replay detail (map best-effort nullable, rotation, date, per-side summary, participants, provenance) with NO full SteamID | ✓ VERIFIED | `getReplay` (repository.ts:884-903) joins `parser_results status='current'`, slug-or-uuid via `looksLikeUuid`, 404 returned in route (routes.ts:504-508). `mapReplayDetail` (replay-mapper.ts:173-217) builds `{id,slug,rotation,replayTimestamp,map,sides,participants,provenance}`; `map` via `extractMapName` candidate-key scan; every `players[].sid` masked via `maskSteamId` (290-306); provenance via `maxTimestamp` over returned rows. Schema `ReplayDetailResponse` (schemas.ts:119-131) matches contract exactly. |
| 3 | API consumer can page event timeline with hard max page size + stable cursor over legacy NULL rows | ✓ VERIFIED | `getReplayEvents` (repository.ts:905-965) clamps `effectiveLimit = min(limit, EVENT_PAGE_MAX=200)` (sort.ts:141), resolves replay via slug-or-uuid → `parser_result_id` (status='current'), keyset over `EVENT_SORT.time` `(occurred_at ASC NULLS FIRST, id ASC)` (sort.ts:118-125 `nullable:true`); returns null→404 (routes.ts:532-533). Migration `0007_replay_event_keyset.sql` adds `idx_parser_events_result_occurred (parser_result_id, occurred_at, id)`. Events query defaults `order:"asc"` (schemas.ts:67-78). |
| 4 | Sitemap index + paged child sitemaps (≤50k URLs each) enumerate all replay IDs, application/xml, absent from OpenAPI | ✓ VERIFIED | `GET /sitemap.xml` index + `GET /sitemap-replays-:n.xml` children (sitemap-routes.ts:40-76), `schema.hide:true` → absent from OpenAPI; `application/xml` content-type; `:n` validated (integer ≥0) else 400. `urlsetXml`/`sitemapIndexXml` builders (sitemap.ts) with `escapeXml`; `SITEMAP_PAGE_SIZE=50_000`. `countReplaySitemapPages`/`listReplaySitemapPage` (repository.ts:977-1003) exclude null slugs in SQL (`where slug is not null`). Registered as separate top-level plugin (app.ts:112-115). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `repository.ts` | listReplays/getReplay/getReplayEvents + sitemap enumerators | ✓ VERIFIED | All 5 methods substantive, parameterized SQL, real keyset reuse |
| `replay-mapper.ts` | detail/event mappers + Steam64 scrub | ✓ VERIFIED | `scrubPayload` deep-walks (drops steam-key fields, masks Steam64 values at any depth/array index); `scrubActor`, `mapReplayDetail`, `mapReplayEvent`, `extractMapName` |
| `routes/sitemap.ts` | pure XML builders | ✓ VERIFIED | `escapeXml`, `urlsetXml`, `sitemapIndexXml`, `SITEMAP_PAGE_SIZE` |
| `routes/sitemap-routes.ts` | application/xml plugin | ✓ VERIFIED | index + child routes, hidden from OpenAPI, :n validation |
| `routes/routes.ts` | 3 JSON replay routes | ✓ VERIFIED | `registerReplayRoutes` (list/detail/events), 404 on detail+events |
| `routes/schemas.ts` | TypeBox shapes | ✓ VERIFIED | ReplayListQuery/EventsQuery/Detail/Side/Participant responses match contract |
| `routes/models.ts` | read-model interface | ✓ VERIFIED | 5 methods + 6 replay types declared |
| `routes/empty-read-model.ts` | boot-without-DB stub | ✓ VERIFIED | All 5 methods stubbed |
| `routes/tests/fixtures.ts` | test double | ✓ VERIFIED | All 5 methods present |
| `migrations/0007_replay_event_keyset.sql` | events keyset index | ✓ VERIFIED | Idempotent `create index if not exists` on `(parser_result_id, occurred_at, id)` |
| `openapi/server-2.openapi.json` | replay paths present, sitemap absent | ✓ VERIFIED | 3 `/stats/replays*` paths; 0 sitemap entries; 0 Steam64 strings |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `routes.ts` registerReplayRoutes | `repository` listReplays/getReplay/getReplayEvents | `options.readModel.*` | ✓ WIRED | All three routes call read-model methods; registered inside public-stats scope (routes.ts:96) |
| `app.ts` | `sitemap-routes` | `registerReplaySitemapRoutes` | ✓ WIRED | Separate top-level plugin, PUBLIC_BASE_URL passed |
| `repository` getReplayEvents | `parser_results status='current'` join | SQL | ✓ WIRED | Resolves parser_result_id before event keyset query |
| `mapReplayEvent` | `maskSteamId` | `scrubPayload`/`scrubActor` | ✓ WIRED | Payload never returned raw; deep-walk scrub |

### Read-Model Triplet Sync

| Method | models.ts | empty-read-model.ts | fixtures.ts | Status |
| --- | --- | --- | --- | --- |
| listReplays | ✓ (107) | ✓ (57) | ✓ (258) | IN SYNC |
| getReplay | ✓ (111) | ✓ (59) | ✓ (269) | IN SYNC |
| getReplayEvents | ✓ (116) | ✓ (60) | ✓ (273) | IN SYNC |
| countReplaySitemapPages | ✓ (125) | ✓ (63) | ✓ (288) | IN SYNC |
| listReplaySitemapPage | ✓ (131) | ✓ (64) | ✓ (292) | IN SYNC |

### Steam64 Leak-Guard (B-1 events payload vector)

| Vector | Seeded At | Asserted | Status |
| --- | --- | --- | --- |
| Detail | `raw_snapshot.players[].sid` = `76561198012347890` | `/stats/replays/:id` → 200, `expectNoSteam64(body+payload)` | ✓ GENUINE |
| Events | `parser_events.payload.player.steam_id`, `.attacker.steam_id`, `.context.crew[2].steam_id` | `/stats/replays/:id/events` → 200, `expectNoSteam64(body+payload)` | ✓ GENUINE — events payload truly exercised, NOT only raw_snapshot |
| Guard self-test | planted Steam64 in object + raw string | negative self-tests `.toThrow()` | ✓ NON-VACUOUS |

The leak-guard (`src/test/integration/steamid-leak-guard.test.ts:320-459`) seeds a real Steam64 at three nested `parser_events.payload` paths (object key, array element, deep nesting) and asserts the events response body/payload contain zero matches — the `scrubPayload` deep-walk is the choke point. The guard helper is proven non-vacuous by its own negative self-tests. Sitemap routes also swept defensively.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Replay mapper + sitemap builders + route inject tests | `vitest run replay-mapper sitemap replays sitemap-routes` | 4 files / 78 tests passed | ✓ PASS |
| OpenAPI contains replay paths | `grep /stats/replays openapi/server-2.openapi.json` | `/stats/replays`, `/{id}`, `/{id}/events` | ✓ PASS |
| OpenAPI excludes sitemap | `grep -c sitemap openapi/...json` | 0 | ✓ PASS |
| OpenAPI carries no Steam64 | `grep -cE 7656119[0-9]{10}` | 0 | ✓ PASS |
| Events hard max ≤200 | `EVENT_PAGE_MAX` + schema `maximum:100` | repo clamps to 200; schema caps stricter at 100 | ✓ PASS (nothing exceeds 200) |

Full `pnpm run verify` (664 tests, 100% coverage) requires Postgres/RabbitMQ/S3 containers and was not re-run in-process; the replay-surface subset (78 tests, no DB) was spot-checked green, and the OpenAPI artifact was inspected directly.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| REPLAY-01 | 17-01/02 | List replays filtered + cursor-paginated (map filter deferred) | ✓ SATISFIED | listReplays + route + keyset; map filter deferral in ROADMAP/CONTEXT |
| REPLAY-02 | 17-01/02 | Replay detail (map nullable, rotation, date, sides, participants, provenance) | ✓ SATISFIED | getReplay + mapReplayDetail + ReplayDetailResponse |
| REPLAY-03 | 17-01/02 | Paginated event timeline | ✓ SATISFIED | getReplayEvents + migration 0007 + EVENT_SORT NULLS FIRST |
| REPLAY-04 | 17-03 | SEO sitemap | ✓ SATISFIED | sitemap index + children, application/xml, OpenAPI-absent |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TBD/FIXME/XXX/placeholder markers in any phase-17 source file | — | — |

### Constraint Compliance

| Constraint | Status | Evidence |
| --- | --- | --- |
| ZERO new runtime deps | ✓ MET | No new dependency imports; reuses Phase 14 keyset, masking, provenance, slug helpers; XML hand-serialized |
| NO cross-app contract change | ✓ MET | No new parser-contract fields; reads existing `raw_snapshot`/`parser_events`; map intentionally not added to schema |
| NO full Steam64 to `web` | ✓ MET | Detail + events leak-guard genuine; OpenAPI carries 0 Steam64; `maskSteamId` choke point enforced |
| Additive on public-stats | ✓ MET | All work added to existing `public-stats` module + one new migration |

### Minor Notes (non-blocking)

- **REQUIREMENTS.md REPLAY-01 wording (Info):** Line 32 still reads "filters (rotation, date, map)" and is marked `[x]` Complete with no inline deferral note. The map-filter deferral IS correctly documented in ROADMAP Success Criterion #1 and 17-CONTEXT `<deferred>`. The roadmap contract (the authoritative success criteria) explicitly defers the map filter, so this is a doc-wording inconsistency, not a goal gap. Consider annotating line 32 to match the ROADMAP deferral note.

### Gaps Summary

No gaps. All four ROADMAP success criteria are observably satisfied by substantive, wired, data-flowing code. The read-model triplet is in sync, the Steam64 leak-guard genuinely exercises the `parser_events.payload` events vector (not only `raw_snapshot`), migration 0007 backs the events keyset, the sitemap is absent from OpenAPI while replay routes are present, and all phase constraints (zero deps, no cross-app contract change, no Steam64 leak, additive) hold.

---

_Verified: 2026-06-07T15:12:00Z_
_Verifier: Claude (gsd-verifier)_
