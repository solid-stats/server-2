# Phase 02 - Pattern Map

**Mapped:** 2026-05-09
**Status:** Ready for planning

## Reusable Phase 1 Patterns

- `src/config/env.ts` is the source for `DATABASE_URL`.
- `src/infra/db/client.ts` uses `pg.Pool`; migration code should also use `pg` rather than introducing a new ORM abstraction.
- `src/test/integration/adapters.test.ts` shows how Compose-backed tests load default env.
- `docker-compose.yml` exposes PostgreSQL on host port `15432`.
- README documents npm scripts and must be updated for migration commands.

## Target Files

| Path | Role |
|------|------|
| `src/infra/db/migrate.ts` | TypeScript migration runner |
| `src/infra/db/migrations/0001_v1_domain_schema.sql` | Initial v1 schema |
| `src/test/integration/schema.test.ts` | Schema and constraint verification |
| `package.json` | Adds `db:migrate` and `test:schema` scripts |
| `README.md` | Documents schema commands |

## Planning Constraints

- Keep parser logic, ingest crawling, stats calculation, auth flows, and request workflow behavior out of Phase 2.
- Schema must support later phases without implementing their business processes.
- Tests should assert structural guarantees: table existence, enum existence, indexes/constraints, and history tables.
