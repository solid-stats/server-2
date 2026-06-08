# Testing Patterns

**Analysis Date:** 2026-06-08

Testing is governed by the project skill `solidstats-backend-ts-tests`
(`.agents/skills/solidstats-backend-ts-tests/`), built on `solidstats-process-testing-standards`
(RITE, AAA, unit-vs-integration boundary, determinism, doubles, coverage mindset).

## Test Framework

**Runner:**
- **Vitest 4** (`vitest@^4.1.5`), config `vitest.config.ts`.
- Environment: `node`. Pool: `threads`.

**Assertion Library:**
- Built-in Vitest `expect` (`expect`, `describe`, `it` imported from `vitest`).

**Coverage:**
- `@vitest/coverage-v8`, provider `v8`.

**Run Commands:**
```bash
pnpm test                 # unit tests only (excludes integration + *postgres.test.ts)
pnpm run test:integration # integration suite (real Postgres/RabbitMQ/S3), no file parallelism
pnpm run test:schema      # just the schema integration test
pnpm run test:coverage    # full run with V8 coverage, no file parallelism
pnpm run verify           # format + lint + typecheck + test + integration + openapi + ops + coverage
```

`pnpm test` excludes `src/test/integration/**/*.test.ts` and any `*/tests/postgres.test.ts`, so unit
runs need no external services.

## Per-Layer Testing Map

| Layer | Default test type | Why |
|-------|-------------------|-----|
| repository | **integration** (real Postgres) | SQL/contract correctness — a mocked DB hides what the repo exists to get right. |
| service | **unit** (fake repository) + integration where the query is the point | Logic/guards are unit; factory/constructor DI makes the fake trivial. |
| usecase | **unit** (fake services) for branching; **integration** for transaction behavior | Tx boundary needs a real DB. |
| controller / route | **integration** via `app.inject` | Schema validation, status codes, wiring only exist against the real Fastify app. |

## Test File Organization

**Co-location:** unit tests sit beside their unit — `service.ts` → `service.test.ts`
(`src/modules/ingest/service.test.ts`). Pattern: `*.test.ts`, picked up by
`include: ["src/**/*.test.ts"]`.

**Outgrown suites** move into a `tests/` directory with scenario-named files and role-named helpers,
**not** prefixed split names:
- `src/modules/admin/routes/tests/rotations.test.ts`, `.../tests/utilities.ts`
- `src/modules/requests/routes/tests/fixtures.ts`, `.../tests/attachments.test.ts`
- `src/modules/auth/routes/tests/index.test.ts`, `.../tests/roles.test.ts`

**Integration tests** live under `src/test/integration/` (`schema.test.ts`, `sitemap.test.ts`,
`steamid-leak-guard.test.ts`, `adapters.test.ts`) or as `*/tests/postgres.test.ts` inside a module
(`src/modules/auth/tests/postgres.test.ts`, `src/modules/public-stats/tests/postgres.test.ts`). These
are excluded from `pnpm test` and run via `test:integration`.

## Test Structure

```typescript
describe("IngestPromotionService", () => {
  it("promotes a new staging record into replay and queued parse job state", async () => {
    // Arrange — build fake deps + input fixtures
    const repository = new FakePromotionRepository();
    repository.claimed = [stagingRecord];

    // Act
    const service = new IngestPromotionService(repository),
      results = await service.promotePending({ batchSize: 10, parserContractVersion: "3.0.0" });

    // Assert — strong oracle on the full result shape
    expect(results).toEqual([{ /* full expected object */ }]);
    expect(repository.promotedEvidence).toMatchObject({ parse_job_id: "…", replay_id: "…" });
  });
});
```

Patterns:
- One behavior per `it`, descriptive sentence-style names.
- AAA structure; assert full object shapes with `toEqual`, partial with `toMatchObject`.
- Module-level shared fixtures (`stagingRecord`, `replayRecord`) declared once at top of file
  (`src/modules/ingest/service.test.ts`).

## Mocking & Doubles

**No mocking framework for layer isolation** — DI means you pass a hand-written fake that implements
the contract directly.

```typescript
// Fake implementing the repository contract — hand-rolled, no vi.mock
class FakePromotionRepository implements PromotionRepository {
  public claimed: IngestStagingRecord[] = [];
  public promotedEvidence: Record<string, unknown> | undefined;
  public claimPendingStagingRecords(): Promise<IngestStagingRecord[]> {
    return Promise.resolve(this.claimed);
  }
  public withTransaction<T>(cb: (c: PoolClient) => Promise<T>): Promise<T> {
    return this.transactionError !== undefined
      ? Promise.reject(this.transactionError)
      : cb({} as PoolClient);
  }
  // …records inputs into public fields for later assertion
}
```
(Full example: `src/modules/ingest/service.test.ts`.)

**Mock only true boundaries** — S3, external HTTP, RabbitMQ at the contract edge, and the clock.

**Deterministic time:** `vi.useFakeTimers()` / `vi.setSystemTime()`, never real `sleep`/wall-clock.
Used in `src/infra/runtime/interval-task.test.ts`, `src/infra/storage/client.test.ts`,
`src/modules/ingest/runtime.test.ts`, `src/modules/auth/routes/memory.test.ts`. Reset
timers/mocks in teardown (`vi.clearAllMocks()` in `beforeEach`).

**What NOT to mock:** PostgreSQL, RabbitMQ, S3 at the contract level — use the real service in
integration tests, because a mock at a contract boundary hides contract failures.

## Integration Harness

**Important divergence from the skill:** the skill prescribes **testcontainers**, but the current
integration suite connects to **Docker Compose services** via hardcoded localhost connection strings
with env overrides (`docker-compose.yml`). Example from `src/test/integration/schema.test.ts`:

```typescript
const env = {
  DATABASE_URL: process.env["DATABASE_URL"] ?? "postgresql://solid:solid@localhost:15432/solid_stats",
  RABBITMQ_URL:  process.env["RABBITMQ_URL"]  ?? "amqp://solid:solid@localhost:5673",
  S3_ENDPOINT:   process.env["S3_ENDPOINT"]   ?? "http://localhost:9000",
  /* … */
};
const config = loadConfig(env), pool = new Pool({ connectionString: config.databaseUrl });

beforeAll(async () => { await runMigrations(config.databaseUrl); });
```

- Integration tests run **real migrations** (`src/infra/db/migrate.ts`) against the ephemeral DB in
  `beforeAll`.
- Run with `--no-file-parallelism` (they share the same DB/queue/bucket).
- **Routes** are tested against the real built app with `app.inject` (see below). Used widely:
  `src/test/app.test.ts`, `src/modules/auth/routes/tests/roles.test.ts`,
  `src/modules/requests/routes/tests/attachments.test.ts`,
  `src/modules/public-stats/routes/tests/rotations.test.ts`.

Local services must be up (`docker compose up`) before running `pnpm run test:integration`.

## HTTP Route Testing

```typescript
const res = await app.inject({ method: "POST", url: "/appeals", payload: createAppealInput() });
expect(res.statusCode).toBe(201);
expect(res.json()).toMatchObject({ id: expect.any(String) });
```

Assert the status code AND that the body conforms to the route's response schema.

## Fixtures & Builders

- **Typed builders / shared fixtures** live in `tests/fixtures.ts` / `tests/utilities.ts` next to the
  suite (`src/modules/requests/routes/tests/fixtures.ts`, `src/modules/admin/routes/tests/utilities.ts`).
- Prefer `create…(overrides?: Partial<T>)` builders with sane defaults over copied object literals.
- Invalid-input cases use `@ts-expect-error` with a one-line reason, never an unexplained `as` cast.

## Parameterized Tests

Use `test.each` / `it.each` / `describe.each` for input matrices with identical assertions. Seen in
`src/modules/public-stats/routes/slug.test.ts`,
`src/modules/public-stats/routes/pagination/cursor.test.ts`,
`src/modules/statistics/repository/tests/parity-sql.test.ts`,
`src/test/integration/steamid-leak-guard.test.ts`.

## Coverage

**Gate: 100% reachable-source** — `vitest.config.ts` thresholds: branches/functions/lines/statements
all 100. Run via `pnpm run test:coverage`.

**Excluded from coverage** (non-application / entrypoints): `dist/**`, `src/test/**`,
`src/infra/db/migrate.ts`, `src/openapi/{export,verify}-openapi.ts`, `src/openapi/schema.ts`,
`src/operations/check-backup-runbook.ts`, `src/server.ts`, `vitest.config.ts`.

**Per-line exceptions** are rare and must be marked `/* v8 ignore next -- @preserve */` (the
`@preserve` marker keeps esbuild from stripping the hint) so each gap is auditable.

Coverage is a **floor, not proof** — pair it with strong oracles (`toEqual` on full shapes) and
mutation thinking. A test that only raises a number without catching a real fault does not satisfy the
intent.

## Test Types

- **Unit:** services, mappers, formulas, pure helpers — fake deps, no external services
  (`src/modules/statistics/parity-formulas.test.ts`, `src/modules/public-stats/replay-mapper.test.ts`).
- **Integration:** repositories, route wiring, schema/migration correctness, SteamID leak guards,
  adapters — real Postgres/RabbitMQ/S3.
- **Contract / freeze:** OpenAPI contract is asserted (`src/openapi/contract.test.ts`,
  `src/openapi/frozen-contract.test.ts`) to catch breaking API changes for `web`.
- **E2E (browser):** not in this repo — owned by `web`.

---

*Testing analysis: 2026-06-08*
