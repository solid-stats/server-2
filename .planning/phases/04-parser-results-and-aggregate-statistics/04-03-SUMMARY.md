# Plan 04-03 Summary: Commander-Side Aggregates

## Completed

- Added typed parser `side_facts` support for commander side evidence and outcome facts.
- Added deterministic commander-side aggregate calculation with separate known wins, known losses, and unknown outcome counters.
- Added repository recalculation that overwrites `commander_side_stats` for the affected rotation.
- Persisted commander aggregates from parser result snapshots while preserving anonymous side rows when commander identity evidence is missing.
- Covered fallback identity matching by source entity id, observed name, Steam ID, and canonical display name.
- Kept split-suite layout aligned with `unit-tests-philosophy`: `repository/repository.ts` with `repository/tests/*` and `service/service.ts` plus `service/commander.ts` with `service/tests/*`.

## Old Parser Regression Evidence

- Commander outcome tests carry forward the old parser distinction between known side wins/losses and legacy unknown outcomes.
- Evidence variants include missing outcome, missing winner side, unknown commander actor, and name-only commander evidence.
- Manual winner correction remains deferred to Phase 7; this plan only calculates from parser/known evidence.

## Verification

- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 12 files, 51 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.

## Notes

- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
