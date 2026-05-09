# Plan 04-02 Summary: Player And Squad Aggregates

## Completed

- Added deterministic player/squad aggregate calculation from normalized parser events and resolved player evidence.
- Added replay-to-rotation assignment for parser-result recalculation.
- Added repository recalculation that overwrites `player_stats` and `squad_stats` for the affected rotation.
- Preserved old parser death semantics: deaths are stored as `{ total, by_teamkills }`.
- Moved repository tests into `src/modules/statistics/repository/tests/` because `repository.ts` now has multiple test files.
- Moved service implementation to `src/modules/statistics/service/service.ts` and kept split-suite tests in `src/modules/statistics/service/tests/`.
- Kept the single parser artifact unit test colocated as `src/modules/statistics/parser-artifact.test.ts`.
- Kept the PostgreSQL-backed statistics test colocated under `repository/tests/postgres.test.ts`.
- Updated test scripts so colocated PostgreSQL tests run in `test:integration` and stay out of the unit coverage command.

## Old Parser Regression Evidence

- Reviewed `/home/afgan0r/Projects/SolidGames/replays-parser/src/!tests/unit-tests/3 - statistics`.
- Applied `calculateDeaths.test.ts` semantics directly to the new aggregate shape.
- Carried forward broader cases for later Phase 4 work: vehicle kills, squad member thresholds/history, rotation windows, commander outcomes, and bounty formula behavior.

## Verification

- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 10 files, 37 tests passed.
- Integration tests: 4 files, 15 tests passed.
- Coverage: 100% statements, branches, functions, and lines.

## Notes

- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
