# Summary 08-03: Failed Job Retry, Manual Reparse, and Job History

## Completed

- Added `parse_job_history` migration and repository history recording.
- Added admin-only `POST /operations/parse-jobs/{id}/retry` for failed/retryable jobs.
- Added admin-only `POST /operations/replays/{id}/reparse` to create new queued parse jobs.
- Added `GET /operations/parse-jobs/{id}/history` for lifecycle visibility.
- Wired production startup to a real `PgIngestRepository` for operations read/action routes.
- Moved expanded ingest route and repository suites into adjacent folder layout.

## Evidence

- Targeted ingest route/repository lint, typecheck, and tests passed.
- Full verification is required before commit and phase advancement.
