# Phase 09 Verification: Parser Counter Ingestion and Aggregate Semantics

**Status:** passed
**Verified:** 2026-05-12
**Requirements:** STAT-10, STAT-11, STAT-12, STAT-13, STAT-14, STAT-15

## Result

Phase 09 is complete. `server-2` now preserves parser compact player counters, uses compact death counters as replay-level aggregate death evidence, keeps kill rows for relationships, weapons, vehicles, and bounty input, and documents the backend counter contract.

## Evidence

- Parser artifact mapping emits `player_counter` events with compact counter payloads.
- Aggregate calculation applies counter deaths when present and falls back to kill-row victim deaths only when counter death evidence is absent for the entity.
- Stored `player_counter` events are reconstructed for recalculation.
- Bounty candidate generation ignores counter events and still uses kill/teamkill relationship rows only.
- `docs/parser-counter-semantics.md` documents STAT-10 through STAT-15 semantics and parser-contract escalation criteria.

## Verification

- `pnpm run verify` passed.

## Notes

- Docker Compose dependencies were started locally for the integration-test portion of verification.
- Verification still emits the known local Node engine warning because the active shell uses Node v22.22.2 while the repo targets Node >=25 <26.
