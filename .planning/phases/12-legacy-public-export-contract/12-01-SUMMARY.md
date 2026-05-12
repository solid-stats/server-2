# Phase 12 Plan 01 Summary: Legacy Public Export Command

## Result

Plan 12-01 is complete.

## Delivered

- Added `LegacyPublicStatsExportService` and `legacy-public-export.v1` TypeScript contract types.
- Added deterministic export metadata, stable sorting, KD, vehicle coefficient, total score, and weekly score helpers.
- Added `PgLegacyPublicStatsExportRepository` as a read-only PostgreSQL export read model for:
  - player global statistics;
  - squad statistics;
  - rotation-scoped statistics;
  - `other_players` relationship surfaces;
  - `weapons` surfaces;
  - `weeks` surfaces.
- Added `pnpm run ops:stats:legacy-export` through `src/operations/export-legacy-public-stats.ts`.
- Added deterministic CLI arguments:
  - `--corpus-scope <name>`
  - `--generated-at <iso>`

## Verification

- `pnpm vitest run src/modules/statistics/export/tests/legacy-public-export.test.ts src/modules/statistics/repository/tests/legacy-export.test.ts src/operations/export-legacy-public-stats.test.ts`
- `pnpm run format`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run openapi:check`
- Direct local command smoke test through `./node_modules/.bin/tsx src/operations/export-legacy-public-stats.ts --corpus-scope local-check --generated-at 2026-05-12T00:00:00.000Z`

## Notes

- Public Fastify routes and the committed OpenAPI artifact were not changed.
- The local shell still emits the known Node engine warning through `pnpm` because it is running Node v22.22.2 while the repository targets Node >=25 <26. Running the operation entrypoint directly through `tsx` produced valid JSON without package-manager warning lines.
