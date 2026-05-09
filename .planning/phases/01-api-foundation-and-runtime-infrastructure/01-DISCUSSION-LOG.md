# Phase 1: API Foundation and Runtime Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 1-API Foundation and Runtime Infrastructure
**Areas discussed:** Runtime and project scaffold, Fastify and OpenAPI, Infrastructure adapters, Local development, Health and verification

---

## Runtime and Project Scaffold

| Option | Description | Selected |
|--------|-------------|----------|
| Node 24 LTS + strict TypeScript + npm | Boring production baseline that matches GSD/npm assumptions and current LTS guidance. | yes |
| pnpm-first scaffold | Good package manager, but introduces an extra project convention before any repo pattern exists. | |
| Defer package/tooling choices | Keeps options open but blocks useful Phase 1 planning detail. | |

**User's choice:** Auto-selected recommended default.
**Notes:** Use ESM unless a dependency forces an isolated CommonJS boundary.

---

## Fastify and OpenAPI

| Option | Description | Selected |
|--------|-------------|----------|
| Fastify route schemas generate OpenAPI | Keeps validation, serialization, and frontend schema aligned. | yes |
| Hand-written OpenAPI YAML | Can be precise but drifts from implementation too easily. | |
| TypeScript DTO mirrors for `web` | Quick at first, but conflicts with the brief's OpenAPI source-of-truth requirement. | |

**User's choice:** Auto-selected recommended default.
**Notes:** Prefer JSON Schema/TypeBox-style schemas and `@fastify/swagger`.

---

## Infrastructure Adapters

| Option | Description | Selected |
|--------|-------------|----------|
| Thin health-checkable adapters | Keeps routes decoupled from raw PostgreSQL, RabbitMQ, and S3 clients. | yes |
| Direct raw clients in route modules | Faster to sketch but creates coupling and test pain. | |
| Full framework-level dependency injection | More structure than the empty repo needs in Phase 1. | |

**User's choice:** Auto-selected recommended default.
**Notes:** Default DB assumption is `pg` plus explicit SQL-shaped access, likely Kysely plus explicit migrations unless planning finds a stronger fit.

---

## Local Development

| Option | Description | Selected |
|--------|-------------|----------|
| Docker Compose with PostgreSQL, RabbitMQ, and MinIO | Gives local parity for required dependencies without external services. | yes |
| External managed dependencies for local development | Reduces local setup but makes tests and onboarding brittle. | |
| Mock infrastructure only | Fast, but would hide contract failures in the first phase. | |

**User's choice:** Auto-selected recommended default.
**Notes:** Service names, ports, bucket names, and env examples should be documented.

---

## Health and Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Liveness, readiness, metrics, Vitest, and Compose-backed integration checks | Verifies the foundation can actually run and connect. | yes |
| Unit tests only | Fast but would miss dependency wiring failures. | |
| Defer metrics until operations phase | Reduces initial work but makes later job/worker metrics harder to add consistently. | |

**User's choice:** Auto-selected recommended default.
**Notes:** Phase 8 can expand metrics and production checks, but Phase 1 should establish the endpoints and patterns.

## the agent's Discretion

- Exact migration package, lint/format tooling, and script names may be chosen during planning as long as the project remains npm-compatible and keeps the OpenAPI contract generated from route schemas.

## Deferred Ideas

- Steam authentication protocol details belong to Phase 6.
- Exact ingest staging and parser message contracts belong to Phase 3.
- Bounty formula belongs to Phase 4.
- Production backup/restore details belong to Phase 8.
