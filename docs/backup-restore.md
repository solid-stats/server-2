# Backup and Restore

This runbook covers v1 single-VPS Docker Compose operation for PostgreSQL and S3-compatible object storage. RabbitMQ queue contents are operational state and are not part of the durable business backup; replay metadata, parse jobs, parser results, requests, audit patches, and aggregate state live in PostgreSQL, while replay files and attachments live in object storage.

## Backup Targets

- PostgreSQL database: `solid_stats` in the `postgres` service.
- S3-compatible bucket: `${S3_BUCKET}` in the `minio` service.
- Environment file: `.env.production`, stored separately from git and protected as a secret.
- Docker volumes: `postgres-data` and `minio-data`.

## Daily Backup

Create a timestamped backup directory on the VPS:

```bash
backup_id="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "backups/${backup_id}/postgres" "backups/${backup_id}/objects"
```

Dump PostgreSQL from the production Compose project:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump --format=custom --no-owner --no-privileges \
  --username=solid --dbname=solid_stats \
  > "backups/${backup_id}/postgres/solid_stats.dump"
```

Mirror object storage with the MinIO client:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  --entrypoint /bin/sh \
  -v "$PWD/backups/${backup_id}/objects:/backup" \
  minio-create-bucket \
  -c "mc alias set local http://minio:9000 solid \"${MINIO_ROOT_PASSWORD}\" && mc mirror local/${S3_BUCKET:-solid-replays} /backup"
```

Store backups off-host after creation. Keep at least 7 daily backups and 4 weekly backups for v1 unless production storage constraints require a stricter policy.

## Restore Drill

Restore only into an isolated drill environment first.

1. Stop the API so no writers are active:

   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml stop api migrate
   ```

2. Restore PostgreSQL into an empty `solid_stats` database:

   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
     dropdb --if-exists --username=solid solid_stats
   docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
     createdb --username=solid solid_stats
   docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
     pg_restore --clean --if-exists --no-owner --no-privileges \
     --username=solid --dbname=solid_stats \
     < "backups/${backup_id}/postgres/solid_stats.dump"
   ```

3. Restore object storage:

   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
   --entrypoint /bin/sh \
   -v "$PWD/backups/${backup_id}/objects:/restore/objects:ro" \
   minio-create-bucket \
   -c "mc alias set local http://minio:9000 solid \"${MINIO_ROOT_PASSWORD}\" && mc mirror --overwrite /restore/objects local/${S3_BUCKET:-solid-replays}"
   ```

4. Start services and validate:

   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d
   curl -fsS http://127.0.0.1:3000/ready
   pnpm run openapi:check
   ```

## Validation Checklist

- `pg_restore --list backups/${backup_id}/postgres/solid_stats.dump` succeeds.
- Restored API returns `GET /ready` with `status: "ready"`.
- `GET /operations/parse-jobs` returns JSON.
- MinIO bucket contains replay/object prefixes expected by the restored database.
- A restore drill result is recorded with backup id, backup age, operator, and validation outcome.

## Automation Check

`pnpm run ops:backup:check` validates that this runbook still mentions the production Compose file, PostgreSQL dump/restore commands, MinIO mirror commands, production volumes, and the validation checklist.
