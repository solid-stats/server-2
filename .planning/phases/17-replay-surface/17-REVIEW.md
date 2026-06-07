---
phase: 17-replay-surface
reviewed: 2026-06-07T00:00:00Z
depth: deep
files_reviewed: 14
files_reviewed_list:
  - src/modules/public-stats/replay-mapper.ts
  - src/modules/public-stats/routes/sitemap.ts
  - src/modules/public-stats/routes/sitemap-routes.ts
  - src/modules/public-stats/repository.ts
  - src/modules/public-stats/routes/routes.ts
  - src/modules/public-stats/routes/schemas.ts
  - src/modules/public-stats/routes/filters.ts
  - src/modules/public-stats/routes/models.ts
  - src/modules/public-stats/routes/empty-read-model.ts
  - src/modules/public-stats/routes/pagination/sort.ts
  - src/modules/public-stats/routes/pagination/keyset.ts
  - src/modules/public-stats/routes/pagination/mask.ts
  - src/infra/db/migrations/0007_replay_event_keyset.sql
  - src/app.ts
findings:
  blocker: 1
  high: 1
  medium: 2
  low: 2
  total: 6
status: issues_found
---

# Phase 17: Replay Surface — Code Review Report

**Reviewed:** 2026-06-07
**Depth:** deep (cross-file: mapper → repository → schema → leak-guard test)
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The Phase 17 replay surface is well-structured: SQL is consistently parameterized, the slug-or-uuid branching correctly avoids the `::uuid` cast on slug inputs (no 500 path found), XML output is uniformly escaped, the `:n` param is validated, the event limit is clamped, provenance is row-derived (never `now()`), and the read-model triplet (models.ts / empty-read-model.ts / fixtures.ts) is in sync.

However, the central B-1 security control — `scrubPayload` — has a **provable bypass**: it masks Steam64 values only when they are JavaScript **strings**. A Steam64 stored as a **JSON number** in `parser_events.payload` passes through untouched and serializes into the response body as a full 17-digit id matching `/7656119\d{10}/`. The existing leak-guard test only seeds string-typed Steam64 values, so this vector is untested and the suite is green despite the hole. Two related string-typed leak paths (`scrubActor.displayName`, `mapReplayEvent.eventType`) are returned without going through the mask choke point.

The hard invariant ("NO full Steam64 may EVER reach a response body") is therefore not actually upheld. That makes BL-01 a release blocker.

## Blocker Issues

### BL-01: scrubPayload does not mask numeric Steam64 values — B-1 invariant bypass

**File:** `src/modules/public-stats/replay-mapper.ts:74-86` (`scrubValue`)
**Issue:** `scrubValue` masks a Steam64 only on the `typeof value === "string"` branch. Numbers (and bigint-ish JSON numbers) fall through to the final `return value;` untouched. PostgreSQL `jsonb` preserves numeric types, so a payload such as `{"owner": 76561198012347890}` or `{"uid": 76561198012347890}` (any key NOT matching `STEAM_KEY_PATTERN`) is copied verbatim into the scrubbed payload. Fastify then serializes the event under `payload: Type.Record(Type.String(), Type.Unknown())`, emitting:

```json
{"payload":{"owner":76561198012347890}}
```

The serialized form `76561198012347890` matches `/7656119\d{10}/` — a full Steam64 in the response body. This defeats the documented B-1 control ("no full Steam64 may appear anywhere in the mapped event payload").

Verified empirically: `JSON.stringify({uid: 76561198012347890})` → `{"uid":76561198012347890}`, and `/7656119\d{10}/u.test(...)` → `true`. (JS float rounding changes only the last digit; the result is still a 17-digit `7656119…` match.)

The leak-guard test (`steamid-leak-guard.test.ts:390-401`) only plants **string** Steam64 values (`steam_id: LEAKED_STEAM64` where `LEAKED_STEAM64 = "765..."`), so this numeric vector is never exercised and the suite passes vacuously for it.

**Fix:** Extend the choke point to detect Steam64 in numeric values as well, masking via `maskSteamId`:

```ts
function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return STEAM64_PATTERN.test(value) ? maskSteamId(value) : value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    // jsonb numbers can carry a Steam64; serialize and re-check.
    const asText = String(value);
    return STEAM64_PATTERN.test(asText) ? maskSteamId(asText) : value;
  }
  if (Array.isArray(value)) {
    return value.map((element) => scrubValue(element));
  }
  if (value !== null && typeof value === "object") {
    return scrubObject(value);
  }
  return value;
}
```

Add a regression test seeding a **numeric** Steam64 under a non-steam-named key (e.g. `payload.context.owner = 76561198012347890`) to `steamid-leak-guard.test.ts` so the suite would fail on this hole.

## High Issues

### HI-01: scrubActor.displayName and mapReplayEvent.eventType bypass the mask choke point

**File:** `src/modules/public-stats/replay-mapper.ts:127` (`scrubActor` displayName) and `:323-328` (`mapReplayEvent` eventType)
**Issue:** Two string fields are returned to the response without passing through `maskSteamId` or `STEAM64_PATTERN`:

- `scrubActor` (line 127): `displayName = typeof block["name"] === "string" ? block["name"] : null` — the player display name is returned raw. A display name containing a 17-digit Steam64 substring (player-controlled, in-game text) would surface in `actor.displayName`.
- `mapReplayEvent` (line 324): `rawPayloadEventType = row.payload["event_type"]` is read from the **raw** payload before scrubbing and returned as `eventType` if it is a string. `event_type` does not match `STEAM_KEY_PATTERN`, so a Steam64-bearing value here is neither dropped nor masked.

Unlike BL-01 these require a Steam64 to appear in a display name / event-type string, which is less likely than the numeric payload case, hence High rather than Blocker — but both are response-body fields outside the choke point, so they violate the same invariant in principle.

**Fix:** Route both through the same Steam64 guard used in `scrubValue`. For example a shared helper:

```ts
function maskIfSteam64(value: string): string {
  return STEAM64_PATTERN.test(value) ? maskSteamId(value) : value;
}
```

Apply to `displayName` in `scrubActor` and to the resolved `eventType` in `mapReplayEvent`. Add a leak-guard case planting a Steam64 in `payload.player.name` and in `payload.event_type`.

## Medium Issues

### ME-01: Sitemap :n accepts exponential / non-decimal numeric strings, yielding an unbounded OFFSET

**File:** `src/modules/public-stats/routes/sitemap-routes.ts:61-70`
**Issue:** Validation is `!Number.isInteger(parsed) || parsed < 0 || Number.isNaN(parsed)` where `parsed = Number(raw)`. `Number()` is permissive: `Number("999999999999999999999")` → `1e21`, which `Number.isInteger` reports as `true`; `Number("1e3")` → `1000`. A request for `/sitemap-replays-999999999999999999999.xml` passes validation and reaches `listReplaySitemapPage(1e21)`, computing `offset = 1e21 * 50000`. PostgreSQL will reject/round an absurd offset and at best returns an empty page, but the input contract ("`:n` is 0-based … non-numeric or negative → 400") is not enforced for these forms, and a giant offset is wasteful intent the validation was meant to bar.

**Fix:** Require a canonical non-negative decimal integer string and bound it:

```ts
const raw = request.params.n;
if (!/^\d+$/u.test(raw)) {
  return reply.code(BAD_REQUEST).send({ message: "Invalid sitemap page number" });
}
const parsed = Number(raw);
if (!Number.isSafeInteger(parsed)) {
  return reply.code(BAD_REQUEST).send({ message: "Invalid sitemap page number" });
}
```

The `^\d+$` test also rejects `+5`, `1e3`, `0x10`, and whitespace-padded values that `Number()` silently accepts.

### ME-02: Event limit hard-max (200) is unreachable through the route — clamp and schema disagree

**File:** `src/modules/public-stats/routes/schemas.ts:69-71` vs `src/modules/public-stats/repository.ts:910-914` / `src/modules/public-stats/routes/pagination/sort.ts:141`
**Issue:** `ReplayEventsQuery.limit` is schema-bounded to `maximum: 100`, so the HTTP route can never deliver a limit above 100 to `getReplayEvents`. The repository then clamps to `EVENT_PAGE_MAX = 200`. The documented "hard max 200 enforced in the repository" is therefore never the binding constraint over HTTP — the real ceiling is 100. This is not a correctness bug (the response is still bounded), but the two limits are inconsistent and the 200 clamp is only reachable from a direct repository call (the test at `postgres.test.ts:2228` does exactly that). A future reader may assume 200 is the served ceiling.

**Fix:** Pick one number. Either raise the schema `maximum` to 200 to match the documented hard max, or lower `EVENT_PAGE_MAX`/the comment to 100 to match what is actually served. Document why the repository clamp exists (defense-in-depth for non-HTTP callers) so the redundancy is intentional and clear.

## Low Issues

### LO-01: maskSteamId silently truncates short inputs without validation

**File:** `src/modules/public-stats/routes/pagination/mask.ts:10-12`
**Issue:** `maskSteamId` returns `...${steamId.slice(-4)}`. For inputs shorter than the steam pattern (e.g. a 3-char string) it produces `...abc`, and the function is documented to "never throw." This is fine for the safety goal, but because BL-01/HI-01 will start routing arbitrary strings/numbers through this function, note that `maskSteamId` does not itself verify the input was a Steam64 — it blindly keeps the last 4 chars. That is acceptable for masking but means a value like a long opaque token also gets last-4-exposed. No action required beyond awareness; keep the `STEAM64_PATTERN.test` gate at the call sites (as `scrubValue` does) rather than relying on `maskSteamId` to decide.

**Fix:** No change required; documenting the contract boundary. If desired, add a guard comment that callers must gate on `STEAM64_PATTERN` before masking non-id strings.

### LO-02: Heavy reliance on `/* v8 ignore */` around reachable-looking branches

**File:** `src/modules/public-stats/replay-mapper.ts` (lines 89, 126, 254, 274, 292-302) and `src/modules/public-stats/repository.ts` (lines 911, 917, 1260, 1272, 1284, 1302)
**Issue:** Numerous branches are excluded from coverage with `/* v8 ignore */` and justified as "tests always pass X" or "never occurs." Several of these are genuinely defensive (fine), but a few mask real input variability — e.g. `replay-mapper.ts:274` (`player.s ?? "unknown"`) and the `?? 0` fallbacks at `:292-302` describe production-possible nulls (a player row missing `s`/`k`/`d`/`tk`) yet are coverage-ignored because the fixtures always populate them. The behavior is correct, but the ignores hide the fact that null-bearing rows are never tested through the mapper.

**Fix:** Add one mapper unit test feeding a player row with missing `s`, `k`, `d`, `tk` to exercise the `?? 0` / `?? "unknown"` fallbacks, then drop those specific ignores. Keep the truly-unreachable ones (`COUNT(*)` single-row, etc.).

---

## Notes on items explicitly checked and found sound

- **SQL injection:** All dynamic values bind as `$n` (replay filters at `repository.ts:1281-1306`, sitemap at `:997-1003`, events at `:921-954`). No request value is interpolated into SQL text. Sort expressions are server-fixed whitelist `expr` strings, never raw `?sort=`.
- **slug-or-uuid:** `getReplay`, `getReplayEvents`, `getRotation`, `getPlayer`, `getSquad`, `resolvePlayerId`, `resolveSquadId` all branch on `looksLikeUuid` and bind a slug as `$1::text` (never `::uuid`). A missing slug yields 404, not a 500 cast error. The events slug branch uses a NULL-safe subquery (`pr.replay_id = (select … where r.slug = $1)`).
- **XML injection:** `escapeXml` is applied to every dynamic `<loc>` value inside `replayUrlEntry` and `childSitemapEntry`; slugs are additionally schema-restricted to `^[A-Za-z0-9-]+$`.
- **provenance:** `mapReplayDetail` computes `lastUpdatedAt` via `maxTimestamp([pr_created_at, replay_timestamp, created_at])` from returned rows; `maxTimestamp` contains no `now()`/`new Date()`-no-arg.
- **read-model triplet:** `models.ts` interface, `empty-read-model.ts` stub, and `tests/fixtures.ts` double all declare the five new replay/sitemap methods consistently.
- **cursor safety:** `decodeCursor` + `assertCursorValueType` fail closed to 400 with fixed reason strings; the malformed-cursor leak test confirms no Steam64 echoes in the error body.

---

_Reviewed: 2026-06-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
