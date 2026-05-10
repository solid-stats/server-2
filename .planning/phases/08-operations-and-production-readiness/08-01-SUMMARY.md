# Plan 08-01 Summary: Production Compose and Deployment

## Completed

- Added production `Dockerfile` using Node 25 and compiled TypeScript output.
- Added `tsconfig.build.json` and `pnpm run build`.
- Added `docker-compose.prod.yml` with API, migration job, PostgreSQL, RabbitMQ, MinIO, bucket initialization, and persistent volumes.
- Added `.env.production.example` with production-only environment values.
- Added `docs/deployment.md` runbook and README production Compose section.

## Verification

- `pnpm run build` passed on 2026-05-10.
- `docker compose --env-file .env.production -f docker-compose.prod.yml config` passed on 2026-05-10 with `.env.production.example` copied to `.env.production`.

## Notes

- Backup/restore procedures are intentionally left for 08-05.
- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
