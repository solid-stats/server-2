# Plan 05-03 Summary: Squad Public Stats APIs

## Completed

- Added `GET /stats/squads` with pagination, search, and optional `rotationId` filtering.
- Added `GET /stats/squads/:id` profile route with optional `rotationId` filtering and 404 response.
- Extended the public stats read model contract with squad list/profile methods.
- Split the public stats route module into `routes/routes.ts`, `routes/schemas.ts`, and scenario tests under `routes/tests/*` to follow the decomposed test layout.
- Updated generated OpenAPI and README runtime surfaces.

## API Shape

- `GET /stats/squads?page=&pageSize=&search=&rotationId=`
- `GET /stats/squads/:id?rotationId=`

Squad responses include identity, selected rotation, aggregate stats, player count, and replay count. Profile responses also include squad players.

## Verification

- `pnpm exec eslint src/app.ts src/modules/public-stats/routes/routes.ts src/modules/public-stats/routes/schemas.ts src/modules/public-stats/routes/tests/*.ts` passed on 2026-05-09.
- `pnpm exec tsc --noEmit` passed on 2026-05-09.
- `pnpm exec vitest run src/modules/public-stats/routes/tests --coverage.enabled false` passed on 2026-05-09.
- `pnpm run openapi:check` passed on 2026-05-09.
- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 18 files, 83 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.
- OpenAPI export includes `/stats/squads` and `/stats/squads/{id}`.

## Notes

- The route contract is ready for DB-backed read model implementation behind the same interface.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
