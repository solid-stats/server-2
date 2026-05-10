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

Use `GET /ready` for dependency readiness. It reports API dependency checks for PostgreSQL, RabbitMQ, S3-compatible storage, and parser integration.

Use `GET /metrics` for Prometheus scraping. The endpoint includes Node.js process metrics plus Solid Stats operational metrics:

- `server2_parse_job_duration_seconds`
- `server2_parse_job_outcomes_total`
- `server2_parser_worker_failures_total`
- `server2_queue_depth`

Parser job publishing logs include structured `job_id`, `replay_id`, `object_key`, and `parser_contract_version` fields. Publish failures also include a structured retryable error payload.

Production startup runs the ingest/parser runtime loops:

- `PARSER_CONTRACT_VERSION` is written to newly created parse jobs.
- `INGEST_PROMOTION_BATCH_SIZE` limits each staging-promotion poll.
- `PARSE_JOB_PUBLISH_BATCH_SIZE` limits each RabbitMQ publish poll.
- `RUNTIME_POLL_INTERVAL_MS` controls both promotion and publish loop cadence.

The API process also binds durable RabbitMQ queues for `parse.completed` and `parse.failed` messages and records parser terminal state in PostgreSQL.

## Parser Job Operations

Moderator or admin sessions can inspect parser jobs through the operations API. Admin sessions can operate failed parser jobs:

- `GET /operations/parse-jobs?status=failed` inspects failed jobs.
- `GET /operations/parse-jobs/{id}/history` shows durable status history for a job.
- `POST /operations/parse-jobs/{id}/retry` moves a failed or retryable job back to `queued`.
- `POST /operations/replays/{id}/reparse` creates a new queued parse job for an existing replay.

Retry and manual reparse operations append `parse_job_history` records with the acting user id and optional reason.

## Operational Notes

- Put a reverse proxy or load balancer in front of port `3000` and terminate TLS there.
- Set `PUBLIC_BASE_URL` to the public HTTPS origin used by Steam callback redirects.
- Keep `DATABASE_URL`, `POSTGRES_PASSWORD`, `RABBITMQ_URL`, `RABBITMQ_PASSWORD`, `S3_SECRET_ACCESS_KEY`, and `MINIO_ROOT_PASSWORD` aligned in `.env.production`.
- Keep `.env.production` outside version control.
- Persisted data lives in Docker volumes: `postgres-data`, `rabbitmq-data`, and `minio-data`.
- Backups and restore validation are covered by [backup-restore.md](backup-restore.md).
