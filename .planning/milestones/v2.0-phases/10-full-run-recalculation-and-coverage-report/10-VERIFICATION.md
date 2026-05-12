# Phase 10 Verification: Full-Run Recalculation and Coverage Report

**Status:** passed
**Verified:** 2026-05-12
**Requirements:** OPS-07, OPS-08, OPS-09, OPS-10, OPS-11, OPS-12

## Result

Phase 10 is complete. `server-2` now has supported PostgreSQL-backed operator commands for dry-run full-run coverage and idempotent recalculation of all current parser results.

## Evidence

- `pnpm run ops:stats:coverage` prints dry-run lifecycle, freshness, stale, and conservative identity-gap evidence.
- `pnpm run ops:stats:recalculate` recalculates all current parser results through existing aggregate replacement paths.
- Recalculation reports include parser result count, recalculated count, skipped count, missing rotation count, missing timestamp count, missing identity count, changed aggregate rows, and failures.
- Per-result outputs include parser result id, replay id, source identifiers, replay timestamp, rotation id, status, reason code, failure message when applicable, and aggregate row counts when recalculated.
- `docs/full-run-recalculation.md` documents command usage, report fields, reason codes, lifecycle counts, freshness semantics, and boundaries.

## Verification

- `pnpm run verify` passed.

## Notes

- Docker Compose dependencies were already running locally for the integration-test portion of verification.
- Verification still emits the known local Node engine warning because the active shell uses Node v22.22.2 while the repo targets Node >=25 <26.
- Phase 10 identity-gap reporting is intentionally conservative; Phase 11 owns deeper rotation and no-SteamID readiness.
