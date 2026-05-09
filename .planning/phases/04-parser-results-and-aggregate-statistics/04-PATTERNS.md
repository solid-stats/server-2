# Phase 04 Patterns

## Existing Patterns To Follow

- `src/modules/ingest/repository.ts` for explicit SQL repositories, transaction handling, and JSONB evidence persistence.
- `src/test/integration/ingest-repository.test.ts` for Docker Compose PostgreSQL-backed integration tests with seeded rows and migration setup.
- `src/modules/ingest/service.ts` for service/repository separation and deterministic state transitions.
- `src/infra/db/migrations/0001_v1_domain_schema.sql` for existing aggregate table names and JSONB payload direction.

## Proposed File Layout

- `src/modules/statistics/parser-artifact.ts` — TypeScript artifact types and mapper from parser v3 JSON.
- `src/modules/statistics/repository.ts` — parser result/event/aggregate SQL repository.
- `src/modules/statistics/service/service.ts` — artifact ingestion and recalculation orchestration.
- `src/modules/statistics/bounty.ts` — documented v1 bounty formula and pure tests.
- `src/modules/statistics/*.test.ts` — pure unit tests for formula and mappers.
- `src/test/integration/statistics-repository.test.ts` — PostgreSQL replacement/idempotency tests.
- `docs/bounty-formula.md` or README section — human-readable v1 bounty formula.

## Implementation Rules

- Keep parser artifact parsing to JSON artifact content only; do not parse OCAP raw replays.
- Use existing JSONB aggregate columns for MVP payloads.
- Prefer pure functions for aggregate calculations; repositories should only persist/fetch rows.
- Make recalculation overwrite affected rows for deterministic idempotency.
- Keep Phase 5 public API requirements out of Phase 4 implementation.
