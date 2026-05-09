# Plan 07-04 Summary: Audit Patches and Recalculation

## Completed

- Added `POST /moderation/requests/:id/audit-patches` for approved stats correction requests.
- Added `GET /moderation/requests/:id/audit-patches` for moderation audit patch history.
- Added audit patch repository and recalculation hook interfaces.
- Added default no-op recalculation adapter and in-memory audit patch persistence.
- Added route tests proving patch creation triggers recalculation and rejects invalid request states.
- Updated generated OpenAPI and README documentation.

## Verification

- `pnpm exec vitest run src/modules/requests/routes --coverage.enabled false` passed on 2026-05-10.
- `pnpm run openapi:check` passed on 2026-05-10.

## Notes

- The current recalculation hook is injectable; a PostgreSQL-backed implementation can wire directly to the Phase 4 recalculation service without changing the route contract.
- Identity merge/split/linking execution and manual legacy winner fixes remain 07-05.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
