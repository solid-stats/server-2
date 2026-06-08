---
phase: 16-slug-resolution-history-provenance
verified: 2026-06-07T11:53:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 16/16
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 16: Slug Resolution, History & Provenance — Verification Report

**Phase Goal:** Public resources addressable by slug (not only UUID), carrying history timelines and freshness/provenance metadata. Requirements: API-01, HIST-01, HIST-02, HIST-03.
**Status:** passed
**Re-verification:** Yes — independent goal-backward re-check (prior commit dfbdb66 claimed 16/16).

## Goal Achievement — Per-Requirement Verdicts

| Req | Must-have | Verdict | Evidence |
|-----|-----------|---------|----------|
| API-01 | `slugify` pure helper: ASCII-fold, Cyrillic translit (ordered), collapse/trim, id-fallback to caller | PASS | `slug.ts:100-107` (slugify), `:119` shortSuffix, `:131` looksLikeUuid; `slug.test.ts` green |
| API-01 | Migration 0006 adds `slug` to canonical_players/squads/rotations/replays + partial-unique + btree indexes + deterministic in-SQL backfill matching TS | PASS | `0006_slug_addressing.sql:12-15,32-61,71-133,137-161`; `postgres.test.ts:1341` SQL `slug_base()` == TS `slugify()` per-fixture; `:1357` partial-unique rejects dup, allows nulls |
| API-01 | Slug-or-UUID resolution on player/squad/rotation detail; unknown→404 not 500; no `::uuid` cast on slug | PASS | `repository.ts:345,407,808` branch on `looksLikeUuid` (`$1::uuid` vs `$1::text`); `postgres.test.ts:1440,1448,1485,1492` resolve-by-slug + unknown returns null (no throw) |
| API-01 | `slug` on summary/profile/rotation responses; new `GET /stats/rotations/:id` | PASS | `schemas.ts:153,186,242` slug fields + RotationDetailResponse; `routes.ts:162-177` new route; OpenAPI committed (`/stats/rotations/{id}`, 20 slug refs) |
| HIST-01 | name-history ordered asc, open window `to=null`, `sourceReplayId` nullable; explicit unknown-gap | PASS | `repository.ts:838-867` (order asc nulls first, withGaps); `postgres.test.ts:1558,1585` asc + gap + open `to=null`; `history-gaps.ts:69-93` |
| HIST-02 | player + squad membership history; counterparts `{id,slug,name/displayName}` only — no Steam64 | PASS | `repository.ts:870-952`; counterpart schemas `schemas.ts:247-256` (no steam field); `postgres.test.ts:1635,1666` assert no Steam64 |
| HIST-03 | provenance = max over returned rows, null when none, never now(); singular responses only | PASS | `provenance.ts:32-44` (filters Date, null on empty, no wall-clock); wired at all singular mappers (`repository.ts:431,535,866,906,950`); lists keep cursor envelope; `postgres.test.ts:1595` provenance < testStart |
| SEC | Steam64 leak-guard extended to new history + rotation-detail; zero `7656119\d{10}` | PASS | `steamid-leak-guard.test.ts:41-48` route array + `:256-269` real-pg sweep over name-history/membership-history/rotation-detail; all green |
| Contract | legacy byte-identical parity green; `openapi:check` green | PASS | `parity-formulas.test.ts` + `parity-sql.test.ts` in integration run; `openapi:check` exit 0 |

**Score:** 16/16 must-haves verified.

### Test Execution (read-only, run by verifier)

| Suite | Command | Result |
|-------|---------|--------|
| Unit | `pnpm test` | 63 files, 408 tests passed |
| Integration (real-pg :15432) | `pnpm run test:integration` | 8 files, 126 tests passed |
| OpenAPI | `pnpm run openapi:check` | verify-openapi + regen succeeded, exit 0 |

### Anti-Patterns / Notes

- `now()`/`Date.now()` matches in `provenance.ts` are comment-only acceptance-gate references; implementation uses `new Date(Math.max(...rows))` — no wall-clock. No violation.
- Literal `76561198...` strings exist only in `mask.test.ts`/`cursor.test.ts` fixtures proving masking; never in response surfaces (real-pg leak sweep confirms zero body leakage).
- History sub-resource routes accept `SlugOrUuidParameters` but resolve via `playerExists/squadExists` (`id = $1::uuid`). Per locked CONTEXT decision (16-CONTEXT lines 60-61) sub-resources are reached via the already-resolved parent id; slug-on-parent-detail is the API-01 contract and is fully covered. Not a gap — matches the locked design.

### Human Verification Required

None — all behaviors covered by pure-unit + real-pg integration via `app.inject`.

### Gaps Summary

No gaps. Phase goal achieved: slug addressability, history timelines with explicit unknown gaps, and row-derived provenance are implemented, wired through the mapper choke-point, and verified by passing unit + real-pg integration suites with a green OpenAPI contract and extended Steam64 leak-guard.

---

_Verified: 2026-06-07T11:53:00Z_
_Verifier: Claude (gsd-verifier)_
