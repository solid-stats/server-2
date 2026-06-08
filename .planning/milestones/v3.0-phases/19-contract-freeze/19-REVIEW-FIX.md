---
phase: 19-contract-freeze
fixed_at: 2026-06-08T01:39:30Z
review_path: .planning/phases/19-contract-freeze/19-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-06-08T01:39:30Z
**Source review:** .planning/phases/19-contract-freeze/19-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (Warning-severity; `critical_warning` scope)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: oasdiff action pinned to a mutable git tag, not an immutable commit SHA

**Files modified:** `.github/workflows/cd.yml`, `README.md`
**Commit:** 5daf672
**Applied fix:** Repinned `oasdiff/oasdiff-action/breaking` from the mutable tag `@v0.0.56` to the immutable commit SHA `@5ffbc910f1d1742f0dd9bf846a7f86954353556b` (resolved via `git ls-remote refs/tags/v0.0.56`), keeping a trailing `# v0.0.56` comment for human readability. Also updated the README bump-policy line (IN-03) from "pinned to the exact tag `v0.0.56`" to "pinned to an immutable commit SHA `5ffbc910f1d1742f0dd9bf846a7f86954353556b` (tag `v0.0.56`)". cd.yml verified as well-formed YAML (python yaml.safe_load).

### WR-02: pagination sweep misses nested cursor lists — `/stats/leaderboards` never inspected

**Files modified:** `src/openapi/frozen-contract.test.ts`
**Commit:** cd3e864
**Applied fix:** Added `collectListSchemas(schema)` which collects the top-level response when it is a list envelope AND recurses exactly one level into direct child object schemas to collect nested cursor envelopes (the `bounty`/`playersByKills`/`squadsByKills` sub-envelopes of `/stats/leaderboards`, each exposing `hasMore`/`items`/`nextCursor`). Recursion is capped at one level so per-item domain stats (`stats.deaths.total`, nested deeper under each envelope's `items`) are NOT inspected. Rewrote `findPaginationOffenders` to walk every collected list schema, kept the strict `/stats/*`-only path filter (`/operations/*` untouched), and counted nested envelopes into `inspected` for the non-vacuity floor. Extended the real-artifact test with a coverage proof asserting the leaderboards top level is not a list and yields >= 3 nested sub-envelopes (IN-02-style floor). Extended the negative control (IN-01) with a planted `page` inside a nested leaderboards-shaped cursor sub-envelope, asserting both the top-level and nested offenders are caught (`inspected == 2`). Verified by `pnpm vitest run` (4/4), eslint (clean after hoisting the literal `3` into the named `LEADERBOARD_SUB_ENVELOPES` constant), and prettier.

### WR-03: artifact-wide Steam64 sweep fragile against numeric Steam64 values

**Files modified:** `src/openapi/frozen-contract.test.ts`
**Commit:** 4d999cc
**Applied fix:** Changed the Steam64 sweep from `JSON.stringify(JSON.parse(...))` to reading the RAW committed file text (`readFile(resolve("openapi/server-2.openapi.json"), "utf8")`) and running `/7656119\d{10}/u` over it. This avoids the float64 round-trip that could re-serialize a 17-digit numeric Steam64 to a different value and miss it, achieving parity with the runtime `steamid-leak-guard.test.ts` guard and removing the redundant parse+stringify. Verified by `pnpm vitest run` (4/4).

## Verification

- `pnpm test` (unit suite, integration excluded): 72 files / 554 tests passed.
- `pnpm run typecheck` (`tsc --noEmit`): passed, no errors.
- `pnpm vitest run src/openapi/frozen-contract.test.ts`: 4/4 passed.
- `eslint` + `prettier --check` on `src/openapi/frozen-contract.test.ts`: clean.
- cd.yml validated as well-formed YAML (`python3 yaml.safe_load`).
- Integration / coverage suites intentionally NOT run (no live DB), per task scope.

### Note on a pre-existing prettier finding (not fixed, out of scope)

`prettier --check .github/workflows/cd.yml` reports the `base:`/`revision:` values should use double quotes. This is **pre-existing** — those single-quoted lines existed before this phase's edit (confirmed against `HEAD~3`) and were not introduced or touched by the WR-01 SHA repin. Fixing unrelated quoting would expand scope beyond the finding, so it was left as-is.

---

_Fixed: 2026-06-08T01:39:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
