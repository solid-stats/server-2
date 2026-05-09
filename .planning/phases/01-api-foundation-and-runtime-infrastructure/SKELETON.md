# Phase 01 Walking Skeleton

## Goal

Create the thinnest backend slice that proves `server-2` can run as a typed Fastify service, load typed configuration, report dependency readiness, publish metrics, and generate an OpenAPI artifact consumable by `openapi-typescript`.

## Thin Slice

1. `src/app.ts` builds a Fastify app without binding a port.
2. `src/server.ts` starts the app from typed env config and closes dependencies on shutdown.
3. `docker-compose.yml` starts PostgreSQL, RabbitMQ, and MinIO for local checks.
4. `/live`, `/ready`, `/metrics`, and `/openapi.json` are available.
5. `npm run openapi:check` exports `openapi/server-2.openapi.json` and validates it with `openapi-typescript`.

## Non-Goals

- Domain schema and migrations beyond foundation wiring.
- Replay ingest promotion.
- Parser job publishing.
- Public stats, auth, moderation, and production hardening.
