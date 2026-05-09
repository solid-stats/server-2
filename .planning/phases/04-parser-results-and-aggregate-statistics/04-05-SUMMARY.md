# Plan 04-05 Summary: Recalculation Orchestration

## Completed

- Added `ParserResultRecalculationService` as the single Phase 4 orchestration entry point.
- The orchestration path accepts `parserResultId + ParserArtifact`, replaces normalized parser events, and recalculates player/squad stats, commander-side stats, and bounty points.
- Kept parser completion and future moderation patch flows aligned around the same recalculation contract.
- Split orchestration into `src/modules/statistics/service/recalculation.ts` so `service/service.ts` stays focused and within lint limits.
- Added tests proving recalculation persists normalized events before aggregate recalculation and reruns through replacement instead of accumulating normalized rows.

## Verification

- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 15 files, 68 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.

## Notes

- The orchestration service does not add Fastify routes or OpenAPI surfaces; Phase 5 will expose public aggregate APIs.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
