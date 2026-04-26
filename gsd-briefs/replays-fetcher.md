# replays-fetcher - GSD Project Brief

**Created:** 2026-04-26  
**Application:** `replays-fetcher`

This document records the ingest-service boundary as seen from `replay-parser-2`. `replays-fetcher` is one part of Solid Stats alongside `replay-parser-2`, `server-2`, and `web`.

## Product Context

`replays-fetcher` discovers new OCAP replay files from the external replay source. It stores raw replay objects in S3-compatible storage and writes ingestion staging/outbox records that `server-2` promotes into canonical replay and parse-job state.

## Boundary With replay-parser-2

`replays-fetcher` owns:

- External replay source discovery.
- Raw replay download.
- S3 `raw/` object writes.
- SHA-256 checksum evidence.
- Source URL/ID metadata.
- Ingestion staging/outbox records.

`replay-parser-2` owns:

- OCAP JSON parsing from local files or `server-2` parse jobs.
- Checksum verification for worker-downloaded S3 objects.
- Deterministic parser artifacts.
- S3 `artifacts/` writes for successful worker output.
- `parse.completed`/`parse.failed` result publication.

## Cross-App Flow

1. `replays-fetcher` writes raw S3 object and staging evidence.
2. `server-2` promotes staging rows, creates `replays` and `parse_jobs`, and publishes RabbitMQ parse requests.
3. `replay-parser-2` downloads `object_key`, verifies `checksum`, parses, writes an artifact under S3 `artifacts/`, and returns an artifact reference.

## Compatibility Rules

- Fetcher raw object checksum algorithm must match parser worker verification expectations, currently SHA-256.
- Parser worker must not assume knowledge of the external source; it consumes only `object_key`, `checksum`, and job metadata from `server-2`.
- Raw object key layout changes require coordination between `replays-fetcher`, `server-2`, and parser worker configuration.
- Parser artifact key layout is owned by `replay-parser-2`/`server-2`, not by `replays-fetcher`.
