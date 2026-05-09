# Plan 06-02 Summary: Bootstrap Admin and Roles

## Completed

- Added `BOOTSTRAP_ADMIN_STEAM_ID` configuration.
- Bootstrap Steam users are recognized with the `admin` role after login.
- Added `GET /admin/users` for role-management user listing.
- Added `PUT /admin/users/:id/roles` for replacing a user's roles.
- Kept role routes OpenAPI-visible and covered by Fastify inject tests.

## API Shape

- `GET /admin/users`
- `PUT /admin/users/:id/roles`

Role values are currently `admin` and `moderator`. Authorization enforcement for these admin-shaped routes remains the next plan, 06-03.

## Verification

- `pnpm exec vitest run src/modules/auth/routes --coverage.enabled false` passed on 2026-05-09.
- `pnpm run openapi:check` passed on 2026-05-09.
- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 23 files, 105 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.
- OpenAPI export includes `/admin/users` and `/admin/users/{id}/roles`.

## Notes

- The in-memory role implementation is a testable seam; PostgreSQL-backed persistence can replace it without changing routes.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
