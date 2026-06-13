---
name: solidstats-server-ts-tests
description: >
  TypeScript/Fastify backend testing for server-2 — the per-stack layer on top of
  solidstats-shared-testing-standards. Adds the Vitest runner, test file layout, the integration
  harness (testcontainers for PostgreSQL/RabbitMQ/S3, Fastify app.inject), a per-layer testing
  map, and the coverage gate; the TS test idioms (typed builders, test.each, fake timers) live in
  solidstats-shared-ts-standards §G. Use when writing or reviewing backend unit or integration
  tests.
  Use this proactively — apply it when writing or reviewing ANY backend test, even when not explicitly
  asked.
  Triggers: "write backend tests", "test this service", "integration test", "vitest",
  "test the route", "напиши тесты бэкенда", "юнит-тест сервиса", "интеграционный тест",
  "покрой бэкенд тестами", "тест на роут".
---

# Backend Tests — TypeScript / Fastify

**This skill builds on [`solidstats-shared-testing-standards`](../solidstats-shared-testing-standards/SKILL.md) — read it first.**
That skill owns the philosophy (RITE, AAA, the unit-vs-integration boundary, determinism, doubles,
oracle strength, the coverage mindset, naming, TDD). This skill adds only the **server-2
TS/Fastify HOW**: the runner, layout, integration harness, per-layer map, and the coverage gate.
It assumes [`solidstats-server-ts-conventions`](../solidstats-server-ts-conventions/SKILL.md) —
the factory-DI shape that makes the unit doubles below trivial.

## Runner

- **Vitest 4** with `@vitest/coverage-v8`. Unit and integration run as separate Vitest projects/
  configs so integration (slower, needs containers) can be gated and run independently.
- No logging in tests (quiet the pino instance).

## Per-layer testing map

The unit-vs-integration boundary (testing-standards §B) maps onto the backend layers like this:

| Layer | Default | Why |
|-------|---------|-----|
| repository | **integration** (real Postgres) | SQL/contract correctness — a mocked DB hides exactly what the repo exists to get right. |
| service | **unit** (fake repository) + integration where the query is the point | Logic and guards are unit; the functional-factory DI makes the fake trivial. |
| usecase | **unit** (fake services) for orchestration/branching; **integration** for transaction behavior | Branching is unit; the tx boundary needs a real DB. |
| controller / route | **integration** via `app.inject` | Schema validation, status codes, and wiring only exist against the real Fastify app. |

## Substituting dependencies

There are exactly **two** substitution mechanisms, one per test kind — pick by the layer you are
testing (above). The rule, stated crisply: **unit tests inject into the factory; route tests
override via `setDecorator`.** In both cases mock only true boundaries (S3, external HTTP, the
clock) per testing-standards — never a layer you own.

**Unit tests** (service / repository / usecase) call the factory directly with mock deps — no
Fastify instance, no mocking framework. The functional-factory DI (`createX(deps)`) makes this
trivial: construct the unit with a stub object satisfying the dep's **contract type** (a fake
repository, a fake service) passed straight in. This is the default for logic/branching coverage.

```ts
// service unit test — fake the repository contract directly, no mock framework
const repo: AppealRepository = { findById: async () => undefined, /* … */ };
const service = createAppealService({ appealRepository: repo, errors });
await expect(service.getById('x')).rejects.toBeInstanceOf(AppealNotFound);
```

**Route integration tests** build the real app (`buildApp()` + `app.inject`) and override a
decorated dependency **after build** via `app.setDecorator<AppealUsecase>('appealUsecase', mockUsecase)`
(Fastify 5.3+) — so the full HTTP stack (schema validation, error handler, wiring) runs against a
controlled usecase. This needs **no third-party `fastify-override` dependency**; `setDecorator` is
the native, settled mechanism.

```ts
// route integration test — real app, one decorated dep swapped for a controlled double
const app = await buildApp();
app.setDecorator<AppealUsecase>('appealUsecase', mockUsecase);
const res = await app.inject({ method: 'POST', url: '/appeals', payload: createAppealInput() });
```

## Integration harness

Per AGENTS, use **testcontainers** (or Docker Compose test services) for PostgreSQL, RabbitMQ, and
S3 (MinIO) — never mock these, because a mock at a contract boundary hides contract failures
(testing-standards §B).

- Each test (or suite) provisions an **isolated** resource — a fresh schema/database, a fresh
  bucket, a fresh queue — and tears it down. No shared mutable state, no order dependency.
- DB: run the real migrations (`src/infra/db/migrate.ts`) against the ephemeral database; reset
  between tests via truncate or a per-test transaction rolled back at teardown.
- Routes: build the real app and use `app.inject({ method, url, payload })`; assert the
  status code and that the body conforms to the route's response schema.

```ts
const res = await app.inject({ method: 'POST', url: '/appeals', payload: createAppealInput() });
expect(res.statusCode).toBe(201);
expect(res.json()).toMatchObject({ id: expect.any(String) });
```

## TS idioms

The TS test idioms — typed builders/factories, `test.each` parameterized tables,
`@ts-expect-error` for invalid-input typing, deterministic time via `vi` fake timers, and
mock/timer hygiene — live in
[`solidstats-shared-ts-standards`](../solidstats-shared-ts-standards/SKILL.md) **§G (TS test
idioms)**, shared by every SolidStats TS repo; they apply here unchanged. The only
Fastify-specific idiom is the `app.inject` harness above.

## File placement

- Unit tests co-locate: `appeal.service.ts` → `appeal.service.test.ts`.
- When a suite outgrows one file, move the unit into `<unit>/tests/` with scenario-named files
  (`index.test.ts`, `invalid-input.test.ts`) and role-named helpers (`utilities.ts`) — never
  prefixed split-file names like `appeal.service.index.test.ts`.
- Integration tests are marked (`*.integration.test.ts`, or under `src/test/integration/`) so the
  integration Vitest project picks them up separately from unit.

## Coverage gate

- `@vitest/coverage-v8`. The gate is **100% reachable-source** coverage (per server-2 AGENTS) —
  maximize coverage with **rare, justified** exceptions only, marked with an explicit
  `/* v8 ignore next -- @preserve */` (the `@preserve` legal-comment marker keeps esbuild from
  stripping the ignore hint during TS transpile) so each gap is auditable.
- Coverage is a **floor, not proof** (testing-standards §H): pair it with strong oracles, and use
  mutation thinking to check that the tests would actually catch a fault.
- Coverage gates are **per-stack by design** (testing-standards §H delegates the number): backend
  gates on 100% reachable-source, the parser on llvm-cov, the frontend on CI/Lighthouse + bundle
  budgets rather than a line %.

### Coverage suppression (builds on testing-standards §H)

Two mechanisms are available; use the narrowest one that fits.

**Blanket file-level excludes — `vitest.config.ts` `coverage.exclude`:**
Put files whose source is structurally untestable at the module level here, not in the
source. Two legitimate targets in server-2:

- `server.ts` — the process bootstrap; its side effects are tested indirectly through the
  integration harness, not by running the entrypoint itself.
- `src/operations/*.ts` — each operations entrypoint shares an identical
  `import.meta.url`-based main-guard whose body is tested elsewhere; exclude the file,
  do not inline-ignore the guard.

**Inline suppress — `/* v8 ignore next -- @preserve */`:**
Narrow (one line or one branch), always reason-tagged. Use only for a branch that is
structurally unreachable in a passing test run — for example a defensive `throw` after a
faked-auth test helper, or a SQL single-row invariant assertion. The `@preserve` marker
prevents esbuild from stripping the hint during TS transpile.

Use `/* v8 ignore */` consistently — do not mix in `c8`-syntax comments.

**Never ignore a reachable branch to hit 100% — write the fixture-driven test instead.**
A file that accumulates a cluster of inline ignores is the smell that the test suite has
a gap; treat it as a red flag in review.

## Not owned here

The testing *philosophy* lives in `solidstats-shared-testing-standards`; the *severity* of a
test-quality problem in review lives in `solidstats-shared-review-standards` §F (test quality is
never a standalone BLOCK unless a test actively masks a real bug). This skill is only the TS/Fastify
how-to.
