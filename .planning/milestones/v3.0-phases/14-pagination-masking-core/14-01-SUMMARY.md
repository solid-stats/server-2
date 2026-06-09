---
phase: 14
plan: 01
subsystem: public-stats pagination
tags: [pagination, keyset, cursor, sort, security]
requires: []
provides:
  - "cursor codec (encodeCursor/decodeCursor over base64url JSON + structural validation)"
  - "BadCursorError (400 mapping in Plan 14-03)"
  - "per-endpoint sort whitelists (PLAYER_SORT/SQUAD_SORT/BOUNTY_SORT) + resolveSort"
  - "buildKeysetPredicate (expanded-OR HAVING/WHERE seek + NULLS-aware ORDER BY)"
affects:
  - "Plan 14-03 (wires these primitives through page()/paginationValues()/pageResult())"
tech-stack:
  added: []
  patterns:
    - "Node built-in Buffer base64url codec (zero new deps)"
    - "expanded-OR keyset predicate over aggregate sort key with explicit NULL branches"
    - "fixed server-chosen SQL exprs mapped from a whitelist (no raw request value in SQL)"
key-files:
  created:
    - src/modules/public-stats/routes/pagination/errors.ts
    - src/modules/public-stats/routes/pagination/cursor.ts
    - src/modules/public-stats/routes/pagination/cursor.test.ts
    - src/modules/public-stats/routes/pagination/sort.ts
    - src/modules/public-stats/routes/pagination/sort.test.ts
    - src/modules/public-stats/routes/pagination/keyset.ts
    - src/modules/public-stats/routes/pagination/keyset.test.ts
  modified: []
decisions:
  - "Sort whitelist kept at the filter layer (free String in TypeBox); per-endpoint literal-union tightening deferred to the Phase 19 freeze."
  - "buildKeysetPredicate takes an options object ({ after, idColumn, startParameterIndex }) to satisfy max-params=3; signature shape adjusted from the plan's positional form."
  - "SortDescriptor carries a numeric flag (drives the ::int cast in the keyset predicate) so 14-03 can pass descriptors straight through to buildKeysetPredicate."
metrics:
  duration: ~12m
  completed: 2026-05-31
---

# Phase 14 Plan 01: Pagination Primitives (Cursor Codec, Sort Whitelist, Keyset Builder) Summary

Pure, DB-free pagination primitives — base64url cursor codec with full structural validation, per-endpoint sort whitelists with fixed SQL expressions, and an expanded-OR keyset predicate builder over a nullable/mixed-direction aggregate sort key — all table-driven unit-tested, with `BadCursorError` for 400 mapping. Zero new runtime dependencies.

## What Shipped

| Task | Deliverable | Commit |
| ---- | ----------- | ------ |
| 1 | `errors.ts` (`BadCursorError`) + `cursor.ts` (`encodeCursor`/`decodeCursor`) + reject-matrix tests | `90c416a` |
| 2 | `sort.ts` (`PLAYER_SORT`/`SQUAD_SORT`/`BOUNTY_SORT` + `resolveSort`) + tests | `d10cf2c` |
| 3 | `keyset.ts` (`buildKeysetPredicate`) + string-shape tests; `sort.ts` numeric-flag link | `223467b` |

## Verification

- `pnpm exec vitest run src/modules/public-stats/routes/pagination` → **38 passed** (3 suites).
- `pnpm run typecheck` (strict NodeNext TS) → clean.
- `pnpm exec eslint src/modules/public-stats/routes/pagination/` → clean (`js.configs.all` + strictTypeChecked + unicorn).
- `git diff` on `package.json` across all three commits → empty (zero new deps confirmed).
- `cursor.ts` imports only `./errors.js` — no third-party import (Buffer is global).
- `kills` expr byte-identical to `repository.ts:458` (`coalesce(sum((stats.stats->>'kills')::integer), 0)`).

## Key Contracts for Plan 14-03

### Cursor codec
- `encodeCursor(payload: CursorPayload): string` — base64url of `{ sort, order, values[], id }`.
- `decodeCursor(token, allowedSorts: readonly string[], expectedArity: number): CursorPayload` — throws `BadCursorError` (fixed reason string, no input echo) on every failure branch; never returns a partial payload. Pass the endpoint whitelist keys as `allowedSorts` and the sort-tuple length (1) as `expectedArity`. The decoded `sort`/`order` must additionally be cross-checked against the request's `sort`/`order` by the caller (Pitfall 3) — not done here.

### Sort whitelists
- `PLAYER_SORT`, `SQUAD_SORT`, `BOUNTY_SORT`: frozen `field -> { expr, numeric, nullable }`.
- Defaults: `PLAYER_SORT_DEFAULT = "kills"`, `SQUAD_SORT_DEFAULT = "kills"`, `BOUNTY_SORT_DEFAULT = "points"`.
- `resolveSort(whitelist, requested?, defaultField): { field, expr, numeric, nullable }` — throws `BadCursorError("unknown sort field")` for a non-whitelisted value.
- **Nullable sort fields:** NONE today. All current fields are non-nullable (stat sums are `coalesce(..., 0)`; `name`/`points` are NOT NULL columns). The keyset NULL branches are dead for them but implemented and exercised via a synthetic nullable descriptor in tests, ready for a future nullable field (e.g. `last_seen`).

### Keyset builder — param-index contract
- `buildKeysetPredicate(descriptor, order, options): { havingSql, orderBySql, values }`.
  - `descriptor`: `{ expr, numeric, nullable }` (a `resolveSort` result is structurally compatible).
  - `options`: `{ after: { value, id } | undefined, idColumn, startParameterIndex }`.
- **First page** (`after === undefined`): `havingSql === null`, `values === []`, `orderBySql` only.
- **Seek:** value binds to `$startParameterIndex` (cast `::int` when `numeric`), id binds to `$startParameterIndex + 1`; `values === [after.value, after.id]` in that order. So the caller must append exactly two params after its existing filter params and set `startParameterIndex = existingParamCount + 1`.
- `havingSql` is a 4-branch expanded-OR fragment — **never** a row-value `(a,b) > ($1,$2)` comparison. The caller decides placement: `HAVING` for aggregate sort keys (players/squads kills/teamkills), `WHERE` is valid for stored-column sorts (bounty points) — but never put the aggregate in `WHERE` (Pitfall 1).
- `orderBySql` is `${expr} DESC NULLS LAST, ${idColumn} ASC` (desc) or `${expr} ASC NULLS FIRST, ${idColumn} ASC` (asc).

## Decisions Made

- **Sort-whitelist masking (filter-level vs literal-union):** kept at the filter layer (`sort` is a free `String` in the TypeBox schema, validated by `resolveSort`). Per-endpoint `Type.Union` literal tightening for richer OpenAPI is **deferred to the Phase 19 freeze** (RESEARCH Open Question 1).
- **`buildKeysetPredicate` signature:** the plan specified a 5-positional form; collapsed the trailing three positional params into a single `options` object to satisfy the repo's `max-params: 3` lint rule. Functionally identical; documented here so 14-03 calls the options form.
- **`numeric` flag added to `SortDescriptor`:** needed for the `::int` cast decision in the keyset predicate; keeps the sort whitelist as the single source of truth for keyset wiring (key_link sort.ts → keyset.ts).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `buildKeysetPredicate` exceeded `max-params` (5 > 3)**
- **Found during:** Task 3 lint.
- **Issue:** The plan's positional signature `(descriptor, order, after, idColumn, startParamIndex)` failed ESLint `max-params: 3`.
- **Fix:** Grouped `after`/`idColumn`/`startParameterIndex` into a `KeysetOptions` object; renamed `startParamIndex` → `startParameterIndex` (unicorn/prevent-abbreviations).
- **Files modified:** `keyset.ts`, `keyset.test.ts`.
- **Commit:** `223467b`.

**2. [Rule 3 - Blocking] `noPropertyAccessFromIndexSignature` blocked dot access in `decodeCursor`**
- **Found during:** Task 1 typecheck.
- **Issue:** Accessing `candidate.id` etc. on a `Record<string, unknown>` is a TS4111 error under the repo's strict tsconfig.
- **Fix:** Destructured `{ id, order, sort, values }` from the record (also satisfies `prefer-destructuring`).
- **Files modified:** `cursor.ts`.
- **Commit:** `90c416a`.

## Out-of-Scope Observation

`14-VALIDATION.md` had a pre-existing uncommitted working-tree change (validation sign-off flipped to approved/`nyquist_compliant: true`) that predates this execution. Per AGENTS.md ("do not revert completed work to clean the tree"), it was left untouched and NOT staged into any commit of this plan.

## Known Stubs

None — all primitives are fully implemented and behavior-tested. (Route/repository wiring is intentionally out of scope; delivered by Plan 14-03 per the phase plan.)

## Threat Flags

None — no new security surface beyond the threat model already enumerated in the plan (decode validation T-14-01, whitelist→SQL T-14-02, error-message non-disclosure T-14-03), all implemented and tested.

## Self-Check: PASSED

- Files: `errors.ts`, `cursor.ts`, `cursor.test.ts`, `sort.ts`, `sort.test.ts`, `keyset.ts`, `keyset.test.ts` — all present.
- Commits `90c416a`, `d10cf2c`, `223467b` — all in `git log`.
- 38 unit tests green; typecheck + lint clean; zero new deps.
