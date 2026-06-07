---
phase: 19-contract-freeze
plan: 01
subsystem: api
tags: [openapi, contract-versioning, vitest, steam64-leak-guard, cursor-pagination]

# Dependency graph
requires:
  - phase: 14-18 (public API surface)
    provides: cursor-paginated /stats/* lists, Steam64 masking, /operations/* offset pagination
provides:
  - "OpenAPI contract pinned to info.version 1.0.0 (single source of truth in register-openapi.ts)"
  - "Regenerated committed openapi/server-2.openapi.json artifact at 1.0.0 (version-only diff)"
  - "DB-free static frozen-contract test locking version, no-Steam64, and scoped cursor-only pagination metadata"
affects: [19-02 (CI contract-diff gate diffs against this 1.0.0 baseline)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static frozen-contract test: pure JSON walk over the committed artifact, no app boot / no DB, runs in the fast pnpm test suite"
    - "Scoped pagination-metadata assertion: /stats/* GET 200 list responses only, top-level properties only (excludes /operations/* offset pagination and nested domain stats.deaths.total)"

key-files:
  created:
    - src/openapi/frozen-contract.test.ts
  modified:
    - src/openapi/register-openapi.ts
    - openapi/server-2.openapi.json

key-decisions:
  - "Kept package.json version at 0.1.0 (private) — contract version lives ONLY in register-openapi.ts to maintain a single source of truth (RESEARCH A1)"
  - "Pagination assertion scoped to /stats/* top-level metadata only, with a non-vacuous guard (inspected > 0) plus a reasoned negative-control test, avoiding false-fails on /operations/* and nested domain total (RESEARCH Pitfall 1)"

patterns-established:
  - "Frozen-contract invariants as a fast DB-free unit test layered on top of the existing real-pg leak guard (defense-in-depth)"
  - "Mirror STEAM64_PATTERN (/7656119\\d{10}/u, no g flag) from the runtime leak guard for static artifact sweeps"

requirements-completed: [FREEZE-01, FREEZE-02, FREEZE-04]

# Metrics
duration: ~13min
completed: 2026-06-08
---

# Phase 19 Plan 01: Contract Freeze (version bump + frozen-contract test) Summary

**OpenAPI contract pinned to 1.0.0 at its single source of truth with a regenerated committed artifact, plus a DB-free static frozen-contract test locking version, zero full Steam64, and cursor-only pagination metadata on public /stats/\* lists.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-08T01:01:00Z (approx)
- **Completed:** 2026-06-08T01:14:00Z (approx)
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Bumped `info.version` `0.1.0` → `1.0.0` in `register-openapi.ts` and regenerated the committed `openapi/server-2.openapi.json` — the diff is confined to the single version string (no path/schema/param shape change), and `openapi:verify` (byte-equality drift gate) and `openapi:check` (drift + web type generation) both pass.
- Added `src/openapi/frozen-contract.test.ts`: a pure-JSON-walk Vitest suite (4 tests) that runs in the fast `pnpm test` suite with no docker services and no app boot.
- The pagination assertion is correctly scoped (public `/stats/*` GET 200 list responses, top-level properties only) so it passes on the current correct artifact while remaining provably non-vacuous (asserts `inspected > 0` and includes a reasoned negative-control test proving an injected top-level `page` WOULD be reported).
- Established `1.0.0` as the stable baseline that Plan 19-02's CI `contract-diff` gate will diff against (RESEARCH Pitfall 4 ordering satisfied).

## Task Commits

Each task was committed atomically:

1. **Task 1: Bump contract version to 1.0.0 and regenerate the committed artifact** - `e8145c9` (feat)
2. **Task 2: Add the DB-free static frozen-contract test** - `68775d3` (test)

_Note: Task 2 is a static guard test; the artifact it locks was already correct after Task 1, so the test passed on first green (RED would require planting a regression, which the in-test negative control covers by reasoning instead of committing a planted leak)._

## Files Created/Modified
- `src/openapi/register-openapi.ts` - Changed `info.version` literal `0.1.0` → `1.0.0` (single source of truth); `openapi: "3.0.3"` and `title: "server-2"` unchanged.
- `openapi/server-2.openapi.json` - Regenerated via `pnpm run openapi:export`; only the `info.version` string changed.
- `src/openapi/frozen-contract.test.ts` - DB-free static test: (c) version == 1.0.0, (b) zero `/7656119\d{10}/u` matches anywhere, (a) scoped cursor-only pagination metadata on public `/stats/*` lists + a non-vacuous negative-control test.

## Decisions Made
- **`package.json` version left at `0.1.0`** (per RESEARCH A1 / CONTEXT): the contract version is owned solely by `register-openapi.ts`; `web` consumes the artifact, not `package.json`. Keeping a single source of truth prevents drift.
- **Pagination scoping** restricted to `/stats/*` top-level metadata, never recursing into item schemas and never inspecting `/operations/*`. A naive whole-artifact scan would false-fail on `/operations/*` (legit offset pagination: `page`/`pageSize`/`total`) and on the nested domain stat `stats.deaths.total`.
- **Non-vacuous design:** added `inspected > 0` assertion and a synthetic-spec negative-control test, since a scoped walk that matches nothing would pass trivially.

## Deviations from Plan

None - plan executed exactly as written. Acceptance criteria, verification commands (`grep` version, `openapi:verify`, `openapi:check`, `pnpm test`, `lint`, `format`) all pass.

## Issues Encountered
- ESLint flagged the initially-mirrored `eslint-disable` header (`id-length`/`no-magic-numbers`) as an *unused directive*, plus `unicorn/prevent-abbreviations` (`props` → `properties`) and `curly` (braces required on single-line `if`). Resolved by removing the unnecessary disable header, renaming `props` → `properties`, and adding braces to all guard `if`s. The leak-guard's disable header was a precedent, not a requirement; the new file is clean without it. Final `eslint` and `prettier --check` both exit 0 on the file.
- Local Node is v22 vs the project's target Node 25 — emits engine warnings only; all scripts/tests run correctly (CI is authoritative on Node 25).

## Known Stubs
None — no stubs, placeholders, or hardcoded empty values introduced. The test reads the real committed artifact and asserts live invariants.

## User Setup Required
None - no external service configuration required. (Branch-protection / required-status-check wiring for the CI gate is handled in Plan 19-02's checkpoint, not here.)

## Next Phase Readiness
- The `1.0.0` baseline artifact is committed and stable — Plan 19-02's `contract-diff` (oasdiff) CI gate can diff against it with an empty/version-only base diff (no false ERR findings).
- FREEZE-01, FREEZE-02 (artifact path stable + web type generation green), and the test half of FREEZE-03 (scoped pagination + Steam64 invariants) are satisfied. FREEZE-04 (PG integration freeze gate) is confirmed already-met by the existing `cd.yml verify` job — Plan 19-02 verifies-and-keeps it.
- Remaining for 19-02: the oasdiff CI `contract-diff` job, README bump-policy section, FREEZE-04 confirmation, and the branch-protection checkpoint.

---
*Phase: 19-contract-freeze*
*Completed: 2026-06-08*

## Self-Check: PASSED
- All created/modified files present on disk (register-openapi.ts, openapi/server-2.openapi.json, frozen-contract.test.ts, 19-01-SUMMARY.md).
- All task commits present in git history (e8145c9, 68775d3).
