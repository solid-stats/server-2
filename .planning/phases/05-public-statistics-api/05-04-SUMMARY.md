# Plan 05-04 Summary: Public Aggregate Index APIs

## Completed

- Added `GET /stats/rotations`.
- Added `GET /stats/commander-sides?rotationId=`.
- Added `GET /stats/bounty?page=&pageSize=&rotationId=`.
- Added `GET /stats/leaderboards?rotationId=&limit=`.
- Split public stats route contracts into `models.ts`, `filters.ts`, `schemas.ts`, and focused route registration helpers.
- Updated generated OpenAPI and README runtime surfaces.

## API Shape

- `GET /stats/rotations`
- `GET /stats/commander-sides?rotationId=`
- `GET /stats/bounty?page=&pageSize=&rotationId=`
- `GET /stats/leaderboards?rotationId=&limit=`

Commander responses expose side, optional commander player, known wins, known losses, and unknown outcomes. Bounty responses expose public player references and points. Leaderboards aggregate player kills, squad kills, and bounty leaders behind the read model contract.

## Verification

- `pnpm exec eslint src/app.ts src/modules/public-stats/routes/*.ts src/modules/public-stats/routes/tests/*.ts` passed on 2026-05-09.
- `pnpm exec tsc --noEmit` passed on 2026-05-09.
- `pnpm exec vitest run src/modules/public-stats/routes/tests --coverage.enabled false` passed on 2026-05-09.
- `pnpm run openapi:check` passed on 2026-05-09.
- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 19 files, 89 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.
- OpenAPI export includes `/stats/rotations`, `/stats/commander-sides`, `/stats/bounty`, and `/stats/leaderboards`.

## Notes

- The public stats HTTP contract is complete for Phase 5 and remains backed by an injectable read model.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
