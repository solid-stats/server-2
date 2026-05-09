# Plan 06-01 Summary: Steam Auth and Sessions

## Completed

- Added Steam OpenID login URL construction and callback verification adapter.
- Added `GET /auth/steam/login`, `GET /auth/steam/callback`, `GET /auth/session`, and `POST /auth/logout`.
- Added opaque server-side session store and user repository seams with in-memory defaults.
- Added auth runtime config: public base URL, session cookie name, and session TTL.
- Updated generated OpenAPI and README runtime/config surfaces.

## API Shape

- `GET /auth/steam/login?redirectTo=`
- `GET /auth/steam/callback`
- `GET /auth/session`
- `POST /auth/logout`

Sessions use an HttpOnly `SameSite=Lax` cookie containing an opaque session ID. Unsafe absolute `redirectTo` values fall back to `/`.

## Verification

- `pnpm exec vitest run src/modules/auth/routes --coverage.enabled false` passed on 2026-05-09.
- `pnpm exec tsc --noEmit` passed on 2026-05-09.
- `pnpm run openapi:check` passed on 2026-05-09.
- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 22 files, 100 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.
- OpenAPI export includes the Steam login, callback, session, and logout routes.

## Notes

- Steam login is modeled as OpenID based on Steamworks documentation, not as generic OAuth.
- The repository/session interfaces are ready for a PostgreSQL-backed implementation if restart-persistent sessions are required later.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
