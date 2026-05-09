# Plan 04-01 Summary: Parser Result Persistence

## Completed

- Added parser v3 artifact TypeScript types and a mapper from compact parser artifact rows into normalized parser events.
- Added persistence service and PostgreSQL repository support for idempotently replacing `parser_events` for a parser result.
- Added unit coverage for kill/teamkill/unknown kill, destroyed vehicle, diagnostic, missing lookup, and rollback behavior.
- Added integration coverage proving parser event replacement deletes stale rows and persists the current normalized result set.
- Serialized integration and coverage test scripts because the integration suite shares one local PostgreSQL database and uses truncation setup.

## Verification

- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 9 files, 28 tests passed.
- Integration tests: 4 files, 12 tests passed.
- Coverage: 100% statements, branches, functions, and lines.

## Notes

- `server-2` consumes parser artifact JSON snapshots only; raw OCAP parsing remains in `replay-parser-2`.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
