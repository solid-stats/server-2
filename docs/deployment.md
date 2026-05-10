# Production Deployment

`server-2` v1 deploys with Docker Compose on a single VPS. It runs the API, PostgreSQL, RabbitMQ, and S3-compatible object storage in one Compose project.

## Files

- `Dockerfile` builds the production API image from compiled TypeScript.
- `docker-compose.prod.yml` runs the API, migration job, PostgreSQL, RabbitMQ, MinIO, and bucket creation job.
- `.env.production.example` documents required production environment values.

## First Deploy

```bash
cp .env.production.example .env.production
# edit every change-me value and PUBLIC_BASE_URL
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

The `migrate` service runs `node dist/src/infra/db/migrate.js` before the API starts. Re-running the stack is safe because migrations are checksum-guarded and idempotent after apply.

## Health Checks

After deploy:

```bash
curl -fsS http://127.0.0.1:3000/live
curl -fsS http://127.0.0.1:3000/ready
curl -fsS http://127.0.0.1:3000/openapi.json >/tmp/server-2.openapi.json
```

Use `GET /ready` for dependency readiness and `GET /metrics` for Prometheus scraping.

## Operational Notes

- Put a reverse proxy or load balancer in front of port `3000` and terminate TLS there.
- Set `PUBLIC_BASE_URL` to the public HTTPS origin used by Steam callback redirects.
- Keep `DATABASE_URL`, `POSTGRES_PASSWORD`, `RABBITMQ_URL`, `RABBITMQ_PASSWORD`, `S3_SECRET_ACCESS_KEY`, and `MINIO_ROOT_PASSWORD` aligned in `.env.production`.
- Keep `.env.production` outside version control.
- Persisted data lives in Docker volumes: `postgres-data`, `rabbitmq-data`, and `minio-data`.
- Backups and restore validation are covered by the later Phase 8 backup/restore plan.
