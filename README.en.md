# server-2

[Русский](README.md) · **English**

TypeScript backend and source of truth for **Solid Stats** — game statistics for the
[Solid Games](https://sg.zone) (ArmA 3) community. It owns the HTTP API, business state in
PostgreSQL, canonical player identity, Steam sign-in, moderation, parser job orchestration,
and the statistics and bounty calculation.

Part of a multi-repo platform: raw replay discovery lives in `replays-fetcher`, OCAP parsing
in `replay-parser-2`, the web interface in `web`, and runtime/operations in `infrastructure`.
server-2 is the integration layer where they meet.

> Solid Stats is built end to end by AI agents via the
> [GSD](https://github.com/open-gsd/gsd-core) process. Development outside GSD is outside the process.

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres rabbitmq minio minio-create-bucket
pnpm run dev
```

PostgreSQL listens on host port `15432`, RabbitMQ on `5673` (management `15673`): these
non-standard ports avoid clashes with common local services. Before committing, run the
`pnpm run verify` gate (format, lint, types, tests, OpenAPI contract, boundaries).

## Documentation

- docs/backend-reference.md — runtime surfaces, contract policy, statistics, auth, DB schema
- docs/deployment.md · docs/backup-restore.md — deployment and recovery
- docs/api-compatibility.md — the OpenAPI contract and type generation for `web`
- .planning/ — product context, milestone, roadmap, state (GSD)

## Stack

TypeScript 6 · Node 25 · Fastify 5 · PostgreSQL · RabbitMQ · S3 · OpenAPI

## License — MIT
