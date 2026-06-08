---
phase: 18-api-ergonomics-admin-winner-fix
reviewed: 2026-06-08T00:00:00Z
depth: deep
files_reviewed: 20
files_reviewed_list:
  - src/app.ts
  - src/server.ts
  - src/modules/admin/routes/memory.ts
  - src/modules/admin/routes/models.ts
  - src/modules/admin/routes/rotation-repository.ts
  - src/modules/admin/routes/rotations.ts
  - src/modules/admin/routes/tests/rotation-repository.test.ts
  - src/modules/admin/routes/tests/rotations.test.ts
  - src/modules/admin/routes/tests/rotations-validation.test.ts
  - src/modules/admin/routes/tests/utilities.ts
  - src/modules/public-stats/repository.ts
  - src/modules/public-stats/repository.test.ts
  - src/modules/public-stats/routes/filters.ts
  - src/modules/public-stats/routes/models.ts
  - src/modules/public-stats/routes/routes.ts
  - src/modules/public-stats/routes/schemas.ts
  - src/modules/public-stats/routes/tests/fixtures.ts
  - src/modules/requests/routes/workflow-applier.test.ts
  - src/modules/requests/routes/workflows/tests/index.test.ts
  - src/test/integration/steamid-leak-guard.test.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** deep
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 18 ships four surfaces: API-02 (bounty breakdown derived from stored `bounty_points.inputs`), API-03 (optional commander-side `?side=` filter), API-04 (admin rotation CRUD), and HIST-04 verify-and-freeze tests for the `legacy_winner_fix` workflow.

The targeted security concerns called out for this review are largely sound: the API-03 `side` predicate is correctly bound as `$n::text` (no interpolation, AND-composed, ordering preserved); the admin rotation repository binds every value as `$n`, server-derives the slug via `slug_base()`, and runs each write inside a begin/commit/rollback transaction; the admin write routes are `requireRole(..., "admin")`-guarded and the winner-fix route is `requireAnyRole(["admin","moderator"])`-guarded with the role guard frozen by a test; and `foldBountyBreakdown` emits only numbers/counts (no victim ids, no Steam64).

However, the bounty breakdown fold has a real null-safety defect against the **untrusted jsonb** it explicitly documents itself as parsing: it iterates `inputs.events` without proving it is an array, which crashes the public `/stats/bounty` and `/stats/leaderboards` routes for any malformed/legacy version-1 row. There are also several gaps where untrusted jsonb numeric fields and the moderator-supplied `winnerSide` reach output/persistence without validation, plus OpenAPI response-completeness gaps on the new routes.

## API contract

- ⚠️ `POST/PUT /admin/rotations` and `PUT/DELETE /admin/rotations/:id` declare 401/403/404/409/422 but NOT 400. Fastify emits **400** for schema (body/params, including malformed `:id` UUID) validation failures, and the admin routes register no error handler to remap it. The generated OpenAPI contract therefore omits a status code these endpoints actually return → `web`'s generated client has no type for the 400 body. See WR-03.
- ⚠️ `GET /stats/commander-sides` adds the `side` query field (additive, backward-compatible) — OK, but see WR-04 on the unbounded/unenumerated value.
- ✅ Bounty `breakdown` field is additive and nullable in both `BountySummaryResponse` and `LeaderboardsResponse`; no breaking change to existing fields.

## Critical Issues

### CR-01: `foldBountyBreakdown` iterates `inputs.events` without an array guard — crashes the public bounty/leaderboard routes on malformed jsonb

**File:** `src/modules/public-stats/repository.ts:1714-1741` (specifically the `for (const event of inputs.events)` at line 1723)
**Issue:**
`foldBountyBreakdown` guards only `inputs?.version !== 1`. The function's own preceding comment (lines 177-187) states the column is **untrusted jsonb that may hold legacy/old-version rows**, and `BountyRow.inputs` is typed `BountyInputsRow | null`. The `BountyInputsRow.events: BountyPointEventEvidence[]` type is a *compile-time* assertion over a runtime value read straight from the DB — it does not constrain what is actually stored. A row with `inputs = {"version": 1}` (no `events`), or `{"version": 1, "events": null}`, or `{"version": 1, "events": {}}` passes the `version === 1` gate and then reaches `for (const event of inputs.events)`, throwing `TypeError: inputs.events is not iterable` (or `... is not a function`).

This is not caught anywhere: `listBounty`/`getLeaderboards` have no try/catch, and the public-stats child-scope error handler (`mapPublicStatsError`, routes.ts:133) only maps `BadCursorError` and re-throws everything else → unhandled rejection → **500** on `GET /stats/bounty` and `GET /stats/leaderboards`. A single legacy/partial version-1 bounty row takes down two public endpoints. The `version !== 1` guard the comment relies on to be "live, not statically dead" does not protect a version-1 row whose `events` is missing or non-array.

The unit tests (`repository.test.ts`) only feed well-formed version-1 inputs and `version: 2`/`null`, so the defect is uncovered.

**Fix:** Validate the shape of the untrusted jsonb before folding, returning `null` (the documented legacy fallback) for anything that is not a version-1 row with an array `events`:
```typescript
function foldBountyBreakdown(
  inputs: BountyRow["inputs"],
): BountySummary["breakdown"] {
  if (inputs?.version !== 1 || !Array.isArray(inputs.events)) {
    return null;
  }
  // ... unchanged
}
```
(Also guard the per-event factors — see WR-01 — and `base_score` — see WR-02.)

## Warnings

### WR-01: counted-kill factors from jsonb are summed without numeric validation

**File:** `src/modules/public-stats/repository.ts:1727-1731`
**Issue:** Inside the fold, an event passes the `"player_factor" in event` test and then `victimEffectiveness += event.player_factor` / `squadEffectiveness += event.squad_factor` run unconditionally. For untrusted jsonb, `player_factor`/`squad_factor` could be a string, `null`, or missing while a sibling `player_factor` key is present (the `in` check proves the key exists, not that it is a finite number). A string yields `NaN`/string concatenation; the subsequent `Math.round(NaN * 100) / 100 = NaN` then fails `Type.Number()` serialization assertions or emits `null`/`NaN` to the client. Same untrusted-jsonb reasoning as CR-01.
**Fix:** Coerce-and-validate per event:
```typescript
if ("player_factor" in event &&
    typeof event.player_factor === "number" &&
    typeof event.squad_factor === "number") {
  countedKills += 1;
  victimEffectiveness += event.player_factor;
  squadEffectiveness += event.squad_factor;
}
```

### WR-02: `base_score` from jsonb is multiplied without numeric validation

**File:** `src/modules/public-stats/repository.ts:1734` (`baseScore: inputs.base_score * countedKills`)
**Issue:** `inputs.base_score` is read from the same untrusted jsonb and typed `number` only at compile time. A non-numeric stored value produces `NaN` for `baseScore`, which violates the `BountySummaryResponse.breakdown.baseScore: Type.Number()` schema at serialization. Defensive parsing must cover every numeric field the fold trusts, not just `events`.
**Fix:** Guard `typeof inputs.base_score === "number"` in the version-1 gate (fold to `null` otherwise), consistent with CR-01.

### WR-03: new admin rotation routes omit the 400 response schema they actually return

**File:** `src/modules/admin/routes/rotations.ts:62-68, 92-99, 124-131`
**Issue:** All three admin routes validate body/params via TypeBox (`RotationBody`, `RotationIdParameters` with `format: "uuid"`). A malformed `:id` or body field causes Fastify's default validation error → **HTTP 400** with a Fastify error envelope, but no `400` entry exists in any of the three `response` maps. The generated OpenAPI (and therefore `web`'s typed client) is missing a status code these endpoints emit, and the 400 body shape is the un-schematized Fastify default rather than the `ErrorResponse` used elsewhere. Contract incompleteness on a public route.
**Fix:** Add `400: ErrorResponse` to each route's `response` map (and, if a consistent body is desired, a `setErrorHandler`/schema-error formatter that returns `{ message }`), mirroring how the public-stats scope maps its errors.

### WR-04: `legacy_winner_fix` persists an unvalidated `winnerSide` string into parser_results

**File:** `src/modules/requests/routes/workflow-applier.ts:94-122`; route body schema `src/modules/requests/routes/workflows/workflows.ts:30-33`
**Issue:** The workflow body is `payload: Type.Record(Type.String(), Type.Unknown())` — fully unconstrained. `applyLegacyWinnerFix` pulls `winnerSide = requiredString(input.payload, "winnerSide")` (only checks "non-empty string") and writes it verbatim into `raw_snapshot.side_facts.outcome.winner_side`. There is no whitelist of valid sides (e.g. `west`/`east`/`independent`/`civilian`) and no cross-check that the side exists in the replay's `side_facts`. A moderator (or anything able to reach this approved request) can stamp an arbitrary winner string, and the downstream commander-side recalculation (`recalculateCommanderSideStatsForParserResult`) then derives stats from a value that may not correspond to any real side. Although the actor is role-gated, an authorization gate is not a substitute for input validation on a value that mutates derived public statistics; this is the exact "domain rules belong in the service, not just the schema" convention. This is the highest-trust write surface this phase adds and the verify-and-freeze tests only assert the value is passed through, not that it is validated.
**Fix:** Validate `winnerSide` against the allowed side enum in `applyLegacyWinnerFix` (throw a typed error → 422) before issuing the update, or constrain it at the route schema with a literal union; ideally also assert the side is present among the replay's existing sides within the same transaction.

### WR-05: `legacy_winner_fix` reports success even when zero parser_results rows match

**File:** `src/modules/requests/routes/workflow-applier.ts:104-122`
**Issue:** The `update parser_results ... where replay_id = $1 and status = 'current'` returns `parserResultIds` from matched rows. If the `replayId` does not resolve to a current parser_result (typo, wrong replay, already-superseded result), `result.rows` is empty, `recalculationStatuses.length === 0`, and `applyWorkflowAction` returns `{ status: "legacy_winner_applied" }` — a success status for a no-op. The moderator (and the audit/workflow record persisted by the route) believe a winner fix was applied when nothing changed. No "not found / no current result" signal is surfaced.
**Fix:** When `result.rows.length === 0`, throw a typed not-found error (route maps to 404/422) instead of returning the applied status, so a misaddressed fix is not silently recorded as successful.

## Info

### IN-01: `mapCommanderPlayer` coerces a non-null-guaranteed display_name with `String(...)`

**File:** `src/modules/public-stats/repository.ts:1686-1693`
**Issue:** `mapCommanderPlayer` returns early when `row.player_id === null`, then does `displayName: String(row.display_name)`. `display_name` is typed `string | null` on `CommanderSideRow`. Because the row comes from `left join canonical_players players on players.id = commander.player_id`, a non-null `player_id` implies a matched canonical row whose `display_name` is NOT NULL, so this is currently safe — but the `String(null)` → `"null"` coercion would silently emit the literal string `"null"` if that invariant ever changes. Prefer an explicit guard over a stringifying coercion.
**Fix:** `displayName: row.display_name ?? ""` (or assert/throw on the impossible-null case) rather than `String(row.display_name)`.

### IN-02: duplicated rounding constant/helper semantics across modules

**File:** `src/modules/public-stats/repository.ts:1743-1747`
**Issue:** `BREAKDOWN_FACTOR_SCALE = 100` and `roundBreakdownFactor` re-implement the formula module's `ROUND_SCALE = 100` rounding (referenced in the comment at line 1736). Keeping a second copy of the rounding scale risks drift from the source-of-truth bounty formula module. Consider importing the shared scale/round helper from `parity-formulas`/`bounty` rather than redefining it.
**Fix:** Reuse the existing rounding utility/scale from the statistics module instead of a local copy.

### IN-03: `side` filter value is unbounded and unenumerated

**File:** `src/modules/public-stats/routes/schemas.ts:58-63`; `src/modules/public-stats/routes/models.ts:147-151`
**Issue:** `CommanderSideQuery.side` is `Type.String({ minLength: 1 })` with no `maxLength` and no literal union. It is safely parameterized (no injection), but an arbitrarily long string is bound and shipped to the DB, and the OpenAPI contract advertises `side` as a free string rather than the small known side set. A `maxLength` bound (the convention requires bounded string fields) and/or a literal-union enum would tighten the contract and the generated client.
**Fix:** Add `maxLength` (and ideally a `Type.Union` of the known side literals) to the `side` schema.

### IN-04: winner-fix and admin write tests freeze pass-through, not validation

**File:** `src/modules/requests/routes/workflow-applier.test.ts:51-82`; `src/modules/requests/routes/workflows/tests/index.test.ts:20-67`
**Issue:** The HIST-04 verify-and-freeze tests assert the role guard (good) and that the moderator-supplied `winnerSide` is passed through to the jsonb update verbatim. None assert rejection of an invalid `winnerSide` or a no-match replay (WR-04, WR-05), so those defects are not test-covered. Not a test bug per se, but the freeze locks in the unvalidated-pass-through behavior as "expected." Add negative cases once WR-04/WR-05 are addressed so the contract freezes the validation, not its absence.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
