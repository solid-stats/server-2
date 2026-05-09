# Plan 05-01 Summary: Public Stats Overview

## Completed

- Added `GET /stats/overview` as the first anonymous public statistics route.
- Added TypeBox request/response schemas so Fastify route schemas remain the OpenAPI source of truth.
- Added shared `PaginationQuery`, `paginated`, and `page` helpers for upcoming player/squad list endpoints.
- Wired public stats routes into the app factory with an injectable read model and default empty implementation.
- Updated README runtime surfaces and regenerated `openapi/server-2.openapi.json`.

## API Shape

- `GET /stats/overview`
- Optional query: `rotationId`
- Response includes `filters.rotationId` plus aggregate totals for players, squads, replays, parsed replays, player/squad stat rows, commander-side rows, and bounty players.

## Verification

- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 16 files, 72 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.
- OpenAPI export includes `/stats/overview`.

## Notes

- This plan intentionally keeps route handlers read-only and free of aggregate recalculation.
- Actual DB-backed public read models can be added behind the same route contract in later Phase 5 plans.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
