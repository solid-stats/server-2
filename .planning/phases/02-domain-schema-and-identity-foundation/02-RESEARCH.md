# Phase 2: Domain Schema and Identity Foundation - Research

**Researched:** 2026-05-09
**Domain:** PostgreSQL schema, migrations, canonical identity/history, moderation audit
**Confidence:** HIGH

## Summary

Phase 2 should establish explicit SQL migrations and schema tests. The existing Phase 1 foundation already provides `DATABASE_URL`, `pg`, strict TypeScript, npm scripts, Docker Compose PostgreSQL, and integration tests. The safest implementation is a small TypeScript migration runner over ordered `.sql` files, plus a first migration that creates v1 enums, lifecycle tables, identity/history tables, parser result storage targets, aggregate tables, request/moderation tables, and audit patches.

## Requirements Map

| Requirement | Research Finding |
|-------------|------------------|
| DATA-01 | Create core tables for users, roles, canonical players, nicknames, SteamIDs, squads, memberships, rotations, replays, ingest staging, parse jobs, parse results, events, aggregate stats, requests, attachments, moderation actions, and audit patches. |
| DATA-02 | Replays and ingest staging need source identity, object key, checksum, size, and promotion evidence JSON. |
| DATA-03 | Nicknames and SteamIDs must be separate timestamped rows under canonical players. |
| DATA-04 | Squad memberships need valid-from/valid-to timestamps and replay/source evidence. |
| DATA-05 | Rotations need start/end timestamps and replay timestamp assignment support. |
| DATA-06 | Moderation actions and audit patches need decision/comment/patch/affected-entity data. |

## Technical Direction

- Use PostgreSQL SQL migrations under `src/infra/db/migrations/`.
- Use a `schema_migrations` ledger table with migration id, checksum, and timestamp.
- Run migrations through `npm run db:migrate`.
- Keep schema verification in `src/test/integration/schema.test.ts`.
- Use `jsonb` for source evidence, parser raw snapshots, event payloads, aggregate details, and audit patch payloads.
- Use UUID primary keys with `gen_random_uuid()` via `pgcrypto`.
- Prefer explicit indexes over relying on future query builders.

## Validation Architecture

| Behavior | Command |
|----------|---------|
| Migration runner applies all migrations idempotently | `npm run db:migrate` twice |
| Required tables exist | `npm run test:schema` |
| Required enums exist | `npm run test:schema` |
| Identity history supports many nicknames/SteamIDs | `npm run test:schema` |
| Audit patch tables link moderation decisions and affected entities | `npm run test:schema` |

## Risks

- Over-modeling future phases can lock in wrong business behavior. Mitigation: create structural foundations and lifecycle columns, but defer workflow behavior to later phases.
- Exact parser result contract belongs partly to `replay-parser-2`. Mitigation: store raw snapshot and normalized event/payload tables flexibly enough for Phase 4 refinement.
- Unique constraints can accidentally prevent historical corrections. Mitigation: prefer timestamped history uniqueness scoped to player/source/effective time rather than destructive singleton columns.
