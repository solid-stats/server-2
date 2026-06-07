---
phase: 16-slug-resolution-history-provenance
plan: 01
subsystem: public-stats
tags: [slug, history, provenance, pure-helpers, unit-tests]
dependency_graph:
  requires: []
  provides:
    - slugify/shortSuffix/looksLikeUuid (Plan 02 SQL mirrors CYRILLIC_TRANSLITERATION)
    - withGaps discriminated-union timeline builder (Plan 03 TypeBox mirror)
    - maxTimestamp provenance aggregator (Plans 03-05 mappers)
  affects:
    - src/modules/public-stats/routes/slug.ts
    - src/modules/public-stats/routes/history-gaps.ts
    - src/modules/public-stats/routes/provenance.ts
tech_stack:
  added: []
  patterns:
    - "Pure helper module (mask.ts analog): JSDoc choke-point, no side effects, co-located unit test"
    - "TDD RED/GREEN per task; 58+9+9 = 76 unit assertions"
    - "CYRILLIC_TRANSLITERATION as single ordered source of truth (TS↔SQL parity)"
key_files:
  created:
    - src/modules/public-stats/routes/slug.ts
    - src/modules/public-stats/routes/slug.test.ts
    - src/modules/public-stats/routes/history-gaps.ts
    - src/modules/public-stats/routes/history-gaps.test.ts
    - src/modules/public-stats/routes/provenance.ts
    - src/modules/public-stats/routes/provenance.test.ts
  modified: []
decisions:
  - "CYRILLIC_TRANSLITERATION ordered array is the single TS source of truth; multi-char sequences first (ж/ч/ш/щ/ю/я/х/ё), then single-char; Plan 02 mirrors byte-for-byte in SQL slug_base()"
  - "looksLikeUuid uses /iu UUID_RE to guard against ::uuid pg cast error (Pitfall 2) — returns true for UUID-shaped strings regardless of case"
  - "withGaps locked edge-policy: leading gap only when firstFrom !== null; trailing gap only when last window closed (to !== null); between-gap only when prevTo < nextFrom (strict)"
  - "maxTimestamp: null when no Date instances present, never now() — HIST-03/T-16-02 enforced by construction and grep gate"
  - "Test expectations for between-gap/adjacent/overlap tests include leading and trailing gaps because test windows have known from/to values — this is correct per the locked policy"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-07T03:41:00Z"
  tasks_completed: 2
  files_created: 6
---

# Phase 16 Plan 01: Pure Slug, History-Gaps, and Provenance Helpers Summary

Three pure, side-effect-free helpers in the public-stats module with full unit coverage: Cyrillic-aware slugify with a single ordered transliteration source, a discriminated-union gap builder with locked edge-policy, and a null-safe provenance aggregator that is forbidden from using now().

## Tasks Completed

| Task | Description | Commit | Tests |
|------|-------------|--------|-------|
| 1 | slug.ts — slugify, shortSuffix, looksLikeUuid + unit tests | `0c0d5ce` | 58 assertions (GREEN) |
| 2 | history-gaps.ts (withGaps) + provenance.ts (maxTimestamp) + unit tests | `2653fbc` | 9+9 assertions (GREEN) |

## What Was Built

### `slug.ts`
- `CYRILLIC_TRANSLITERATION`: ordered `readonly [string, string][]` — the single source of truth for Plan 02's SQL `slug_base()`. Multi-char sequences (ж→zh, ч→ch, ш→sh, щ→shch, ю→yu, я→ya, х→kh, ё→e) listed first so chained `replaceAll` processes them before single-char transliterations.
- `slugify(name)`: lowercase → multi-char cyrillic chain → single-char cyrillic chain → `[^a-z0-9]+` → `-` → trim dashes. Returns `""` for unslugifiable input.
- `shortSuffix(uuid)`: first 6 lowercase hex chars (dashes removed). Matches SQL `substr(replace(id::text,'-',''),1,6)`.
- `looksLikeUuid(value)`: `/iu` UUID regex. Case-insensitive, used to branch SQL WHERE clause and prevent `::uuid` cast errors (500→404).

### `history-gaps.ts`
- `UnknownGapEntry` interface exported for Plan 03 TypeBox mirror.
- `withGaps<T, KnownEntry>(windows, makeKnown)`: generic pure function. Locked edge-policy: (a) leading gap when `firstFrom !== null`; (b) between-gap when `prevTo < nextFrom` (strict); (c) trailing gap only when last window is closed (`to !== null`). Open last window = ongoing state, not a gap (Pitfall 4).
- `gapExists(prevTo, nextFrom)`: internal helper implementing the policy predicate.

### `provenance.ts`
- `maxTimestamp(values)`: filters `instanceof Date`, returns `null` when empty, otherwise `new Date(Math.max(...ms)).toISOString()`. No `now()` call anywhere in the file. HIST-03 invariant enforced by construction and `grep now()` acceptance gate.

## Verification

```
pnpm test -- "slug|history-gaps|provenance"
Test Files  61 passed (61)
     Tests  400 passed (400)

pnpm run typecheck  → clean (0 errors)
grep -n "now()" provenance.ts → JSDoc comment lines only, no executable call
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test expectations for between/adjacent/overlap cases included leading and trailing gaps**
- **Found during:** Task 2 GREEN phase — first test run after implementation
- **Issue:** The initial test expectations for `withGaps` only listed the between-gap and known entries, but the locked edge-policy also emits a leading gap (when `firstFrom !== null`) and a trailing gap (when `lastTo !== null`). The test windows had non-null `from`/`to` values, so the implementation correctly produced leading and trailing gaps that the tests didn't expect.
- **Fix:** Updated test expectations in `history-gaps.test.ts` to include the leading and trailing gaps per the locked edge-policy. The implementation was correct; the test oracles were incomplete.
- **Files modified:** `src/modules/public-stats/routes/history-gaps.test.ts`
- **Commit:** included in `2653fbc`

## Known Stubs

None — all exported functions are fully implemented with deterministic behavior. No placeholders, hardcoded empties, or TODO markers.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. These are pure in-memory transform functions with no I/O. Threat model from plan fully satisfied:
- T-16-01 (TS↔SQL divergence): mitigated by single `CYRILLIC_TRANSLITERATION` source.
- T-16-02 (now() leak): mitigated by construction + grep gate.
- T-16-SC (npm installs): not applicable — zero new packages.

## Self-Check: PASSED

Files created:
- `src/modules/public-stats/routes/slug.ts` — FOUND
- `src/modules/public-stats/routes/slug.test.ts` — FOUND
- `src/modules/public-stats/routes/history-gaps.ts` — FOUND
- `src/modules/public-stats/routes/history-gaps.test.ts` — FOUND
- `src/modules/public-stats/routes/provenance.ts` — FOUND
- `src/modules/public-stats/routes/provenance.test.ts` — FOUND

Commits:
- `0c0d5ce` — FOUND (feat(16-01): slug helpers)
- `2653fbc` — FOUND (feat(16-01): history-gaps + provenance)
