# Phase 1: API Foundation and Runtime Infrastructure - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the initial backend foundation only: a TypeScript Fastify service that starts locally, connects to PostgreSQL/RabbitMQ/S3-compatible storage, exposes health and OpenAPI outputs, and has the basic tooling/test structure needed for later phases. It does not implement domain schema beyond foundation/migration setup, ingest promotion, parser jobs, public stats, auth, moderation, or production operations hardening.

</domain>

<decisions>
## Implementation Decisions

### Runtime and Project Scaffold

- **D-01:** Use Node.js 24 LTS as the target runtime and TypeScript in strict mode.
- **D-02:** Use ESM unless a specific dependency forces a CommonJS boundary; isolate any such boundary behind an adapter.
- **D-03:** Use `npm` for the initial project scripts because the repo has no existing package manager lockfile and GSD workflows already assume npm-compatible commands.
- **D-04:** Scaffold with explicit entry points: `src/app.ts` for the Fastify app factory and `src/server.ts` for process startup.
- **D-05:** Use `src/config/`, `src/infra/`, `src/openapi/`, and `src/modules/` as the first structure. Keep domain modules thin in Phase 1 and leave detailed domain implementation to later phases.

### Fastify and OpenAPI

- **D-06:** Use Fastify route schemas as the source of truth for validation and OpenAPI generation.
- **D-07:** Prefer JSON Schema/TypeBox-style schemas over hand-written OpenAPI YAML so route validation, response serialization, and generated schema stay aligned.
- **D-08:** Register `@fastify/swagger` in Phase 1 and expose/export an OpenAPI 3.x document that `openapi-typescript` can consume.
- **D-09:** Do not create hand-maintained DTO mirrors for `web`; frontend typing must come from the generated OpenAPI contract.

### Infrastructure Adapters

- **D-10:** Wrap PostgreSQL, RabbitMQ, and S3-compatible storage behind narrow health-checkable adapters instead of using raw clients directly from routes.
- **D-11:** Use `pg` as the PostgreSQL driver and prefer explicit SQL-shaped access. Default planning assumption is Kysely plus explicit migrations unless Phase 1 planning finds a stronger fit.
- **D-12:** Use AWS SDK v3 S3 client with configurable endpoint/path-style behavior so local MinIO and the production S3-compatible provider share one code path.
- **D-13:** Use a RabbitMQ adapter that can later publish typed parser messages, but Phase 1 only needs connection, readiness, and configuration wiring.

### Local Development

- **D-14:** Local Docker Compose should run PostgreSQL, RabbitMQ, and MinIO or another S3-compatible service.
- **D-15:** Compose service names, ports, buckets, credentials, and DB names should be boring and documented in README/env examples as part of Phase 1.
- **D-16:** Do not depend on external managed services for local tests or local development.

### Health, Metrics, and Verification

- **D-17:** Provide a liveness endpoint that only proves the process is running and a readiness endpoint that checks configured dependencies.
- **D-18:** Add a `/metrics` baseline early, even if Phase 8 expands the metric set later.
- **D-19:** Use Vitest for unit tests and Docker Compose-backed integration checks for real PostgreSQL/RabbitMQ/S3 wiring.
- **D-20:** Phase 1 verification should prove the server starts, dependency adapters connect, OpenAPI schema is generated, and `openapi-typescript` can parse the schema.

### the agent's Discretion

- The planner may choose exact package names for migration execution, lint/format tooling, and process scripts, but must preserve the decisions above and document any deviation.
- The planner may decide whether integration checks run automatically in the default test command or through a separate documented script, based on dependency startup cost.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope

- `.planning/PROJECT.md` - Core value, boundaries, constraints, and key decisions for `server-2`.
- `.planning/ROADMAP.md` - Phase 1 goal, requirements, success criteria, and phase boundary.
- `.planning/REQUIREMENTS.md` - v1 requirement definitions and Phase 1 traceability for `INFRA-01`, `INFRA-02`, `INFRA-03`, `API-01`, and `API-02`.
- `gsd-briefs/server-2.md` - Original product brief and cross-application workflow rules.

### Research

- `.planning/research/STACK.md` - Recommended stack, version-sensitive sources, alternatives, and warnings.
- `.planning/research/ARCHITECTURE.md` - Suggested backend structure and integration boundaries.
- `.planning/research/PITFALLS.md` - Foundation-relevant pitfalls, especially OpenAPI drift and queue/job state risks.
- `.planning/research/SUMMARY.md` - Roadmap implications and Phase 1 research flags.

### Project Guidance

- `AGENTS.md` - Generated project guidance, stack summary, and GSD workflow enforcement.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- No source code exists yet. The only reusable assets are planning docs and `gsd-briefs/`.

### Established Patterns

- Planning docs are tracked in git and commits are atomic by artifact group.
- Project work should stay inside GSD workflows unless the user explicitly bypasses them.
- Cross-application compatibility checks are required for parser contracts, ingest staging/source identity, RabbitMQ/S3 message shapes, API/data model changes, canonical identity, auth, moderation, and UI-visible behavior.

### Integration Points

- New source tree should be created under `src/`.
- New local infrastructure should be described in Docker Compose and env examples.
- OpenAPI output should be available to `web` for `openapi-typescript`.
- Future phases will connect this foundation to `replays-fetcher`, `replay-parser-2`, and `web`.

</code_context>

<specifics>
## Specific Ideas

- Keep the first implementation intentionally boring: Fastify app factory, typed config, dependency clients, OpenAPI export, health/readiness, metrics baseline, and tests.
- Start with adapter interfaces that make later parser, ingest, storage, and metrics work straightforward without overbuilding the domain in Phase 1.
- Treat Steam auth, ingest staging schema, parser message contract, bounty formula, and production backup details as later-phase decisions unless they affect Phase 1 scaffolding.

</specifics>

<deferred>
## Deferred Ideas

- Steam authentication protocol details belong to Phase 6.
- Exact `replays-fetcher` staging schema/status enum belongs to Phase 3.
- Exact `replay-parser-2` message/result contract belongs to Phase 3 and Phase 4.
- Exact bounty formula belongs to Phase 4.
- Production Compose hardening and backup/restore documentation belong to Phase 8.

</deferred>

---

*Phase: 1-API Foundation and Runtime Infrastructure*
*Context gathered: 2026-05-09*
