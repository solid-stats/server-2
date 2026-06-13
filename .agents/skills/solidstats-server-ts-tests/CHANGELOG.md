# Changelog — solidstats-server-ts-tests

## 2026-06-13 — test-mocking strategy settled (decision D): substitution by layer
- Added a **"Substituting dependencies"** subsection (builds on the per-layer testing map) that
  states the now-settled rule crisply: **unit tests inject into the factory; route tests override
  via `setDecorator`.**
- **Unit tests** (service / repository / usecase) call the factory directly with mock deps
  (`createAppealService({ appealRepository: fakeRepo, errors })`) — no Fastify instance, no mocking
  framework; the functional-factory DI makes the fake trivial. Default for logic/branching coverage.
- **Route integration tests** build the real app (`buildApp()` + `app.inject`) and override one
  decorated dep after build via `app.setDecorator<AppealUsecase>('appealUsecase', mockUsecase)`
  (Fastify 5.3+, decision B) — **no third-party `fastify-override` dependency needed** — to drive the
  full HTTP stack (schema validation, error handler, wiring) against a controlled usecase.
- Folded the old "Doubles in practice" paragraph + service-unit snippet into this subsection
  (the unit half of decision D); mock-only-true-boundaries (S3, external HTTP, clock) restated here.

## 2026-06-13 — coverage suppression mechanism documented in coverage-gate section
- Added "Coverage suppression" subsection to the coverage gate: blanket excludes (`server.ts`, `src/operations/*.ts`) go in `vitest.config.ts coverage.exclude`; inline `/* v8 ignore next -- @preserve */` is narrow and reason-tagged only for structurally unreachable branches; never ignore a reachable branch. Cites `solidstats-shared-testing-standards` §H.

## 2026-06-13 — server-2 only; TS idioms moved to solidstats-shared-ts-standards §G (taxonomy V5)
- **Scope narrowed to server-2 only:** dropped the replays-fetcher sentence and the `[HTTP]`
  markers (per-layer map, integration harness) — the fetcher gets its own test skill
  (`solidstats-fetcher-ts-tests`). Testcontainers list keeps RabbitMQ (server-2 uses amqplib).
- **"TS idioms" body moved** (at full fidelity) to `solidstats-shared-ts-standards` **§G** —
  typed builders, `test.each` tables, `@ts-expect-error`, fake timers, mock/timer hygiene are
  shared TS idioms, not Fastify ones. The section here is now a pointer; the only
  Fastify-specific idiom (the `app.inject` harness) stays.

## 2026-06-06 — Analysis fixes (see .planning/SKILLS-ANALYSIS.md)
- Added the missing reference to `solidstats-server-ts-conventions` (siblings already referenced
  theirs).
- Fixed the coverage-ignore comment to `/* v8 ignore next -- @preserve */` (esbuild strips a bare
  hint during TS transpile); noted that coverage gates are per-stack by design.

## 2026-06-06 — Initial
- The thin per-stack backend test skill on top of `solidstats-shared-testing-standards` (which owns
  the philosophy). Adds only the TS/Fastify how-to; does not restate RITE/AAA/determinism.
- **Runner:** Vitest 4 + `@vitest/coverage-v8`, with unit and integration as separate projects.
- **Per-layer testing map:** repository → integration (real Postgres); service → unit (fake repo) +
  integration where the query matters; usecase → unit (fake services) + integration for transactions;
  route → integration via Fastify `app.inject`.
- **Doubles in practice:** the functional-factory DI means unit isolation needs no mocking
  framework — pass fake deps directly; mock only true boundaries.
- **Integration harness:** testcontainers (or Docker Compose test services) for PostgreSQL,
  RabbitMQ, S3 — never mocked (a mock at a contract boundary hides contract failures); isolated
  ephemeral resource per test, real migrations, reset between tests.
- **TS idioms harvested** (backend-flavored) from the estesis unit-tests skill: typed builders,
  `test.each` / case-tables, `@ts-expect-error` for invalid input, `vi` fake timers; React specifics
  (`renderHook`/`act`) intentionally excluded.
- **File placement:** co-located `*.test.ts`; decomposed `<unit>/tests/` when a suite grows;
  integration marked `*.integration.test.ts` / under `src/test/integration/`.
- **Coverage gate:** 100% reachable-source (per server-2 AGENTS), rare justified exceptions via
  explicit `/* v8 ignore */ + reason`; coverage is a floor, not proof.
