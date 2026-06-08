# Coding Conventions

**Analysis Date:** 2026-06-08

These conventions are enforced by configuration (`eslint.config.js`, `tsconfig.json`) and by the
project skill `solidstats-backend-ts-conventions` (`.agents/skills/solidstats-backend-ts-conventions/`).
The skill is **prescriptive** — where current code diverges, the convention wins and the code is
brought into line over time. This document records both the rule and notable real-world divergences.

## Layered Architecture (the core rule)

Backend code is organized into **feature modules** under `src/modules/<feature>/`, plus cross-cutting
infrastructure under `src/infra/`. Dependencies point **downward only**:

```
controller (route + handler) → usecase (optional) → service → repository → (db)
```

- A lower layer never imports an upper one. A repository knows nothing about services.
- A controller never calls a repository directly (it may call a service directly for plain CRUD).
- A usecase never issues a Kysely query.
- The **usecase layer is optional** — introduce it only when orchestrating more than one service or
  owning a transaction boundary. Plain CRUD goes controller → service.
- Cross-module sharing happens **only through a module's exported service contract** (`index.ts`
  re-exports the service type only — never repositories, usecases, routes, schemas, or errors).

See `.planning/codebase/ARCHITECTURE.md` for the full layer model.

## Naming Patterns

**Files** — kebab-case with a role suffix, one role per file:
- `service.ts` / `<feature>.service.ts`, `repository.ts`, `routes.ts`, `schemas.ts`, `errors.ts`,
  `types.ts`, `constants.ts`. Examples: `src/modules/ingest/service.ts`,
  `src/modules/auth/routes/routes.ts`, `src/modules/public-stats/routes/pagination/errors.ts`.
- When a unit outgrows one file it moves into a `<unit>/` directory (e.g. `service/service.ts`,
  `service/recalculation.ts`), not flat split-file names.

**Types / contracts** — `PascalCase`, **no `I`-prefix** (`AppealService`, not `IAppealService`).
Each layer exposes a contract `type`/`interface` plus a construction function. Example:
`PromotionRepository` interface in `src/modules/ingest/service.ts`.

**Functions / variables** — `camelCase`, **no abbreviations** (`unicorn/prevent-abbreviations` is
`error`): `userId` not `uid`, `replayId` not `rid`. Allow-listed short names: `db`, `env`, `id`,
`s3`, `createDbClient`, `migrationsDir`.

**Constants** — `UPPER_SNAKE_CASE` for true constants (e.g. `const UNAUTHORIZED = 401;` in
`src/modules/auth/routes/routes.ts`).

**Identifiers** — Steam identity is `steamId64` (string); internal numeric ids are `<entity>Id`;
opaque/UUID surrogate keys keep the entity name (`replayId`, `jobId`). Correlate logs and jobs by
`jobId` / `replayId`.

**DB column naming** — database rows / evidence JSON use `snake_case` (e.g. `parse_job_id`,
`replay_id`, `source_system`). Files touching raw DB shapes disable the `camelcase` lint rule at the
top (`/* eslint-disable camelcase */` in `src/modules/ingest/service.ts`). Domain types exposed
upward are `camelCase`.

## Construction Pattern (factory vs class)

The skill prescribes **factory functions** (`createXService(deps)`) over classes — trivial to test
with fake deps, no `this`/binding pitfalls, composes with Fastify decoration.

**Divergence (real code):** both styles exist today. `src/modules/ingest/service.ts` uses an
`export class IngestPromotionService` with constructor DI; many route modules use plain `register…`
functions and `create…` factories (`src/modules/ingest/routes/routes.ts`,
`src/modules/requests/routes/workflow-applier.ts`). **For new code, prefer factory functions** per the
skill. When extending an existing class-based module, match the local style.

## TypeScript Strictness

`tsconfig.json` is maximally strict. Beyond `strict: true`:
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`,
`noImplicitOverride`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`,
`noUnusedParameters`, `noUncheckedSideEffectImports`, `forceConsistentCasingInFileNames`.

Consequences seen in code:
- Index-signature access uses bracket notation: `process.env["DATABASE_URL"]`.
- Optional properties built conditionally (`definedQuery` in `src/modules/auth/routes/routes.ts`)
  because `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional field.
- Skill baseline: prefer `type` over `interface`, **no `any`, no `as`** casts. (`as` appears only in
  narrow test boundaries like `{} as PoolClient`.)

## Code Style

**Formatting:** Prettier 3 (`pnpm run format` runs `prettier --check .`), default config (no
`.prettierrc` — defaults apply): 2-space indent, double quotes, semicolons, trailing commas.
Ignored paths in `.prettierignore`: `dist`, `coverage`, `node_modules`, `.agents`, `.planning`,
`gsd-briefs`, `openapi`, `AGENTS.md`.

**Linting:** ESLint 10 with the strictest stack (`eslint.config.js`):
- `js.configs.all` (all core rules)
- `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked` (typed linting)
- `eslint-plugin-import-x` (recommended + typescript) for import hygiene
- `eslint-plugin-unicorn` (recommended)

Notable tuned rules:
- `@typescript-eslint/no-floating-promises`: error — every promise is awaited, returned, or `void`-ed.
- `@typescript-eslint/no-misused-promises`: error.
- `no-magic-numbers`: error, ignoring `[0, 1, 2, 200, 3000, 503]` and array indexes/defaults. Other
  literals must be named constants.
- `max-lines-per-function`: 120 (skip blanks/comments). `max-statements`: 25.
- `new-cap`: error, with TypeBox `Type.*` and `Fastify` exempted.
- `unicorn/prevent-abbreviations`: error (see allow-list above).
- `import-x/order`: enforced alphabetized groups (builtin → external → internal → parent → sibling →
  index → object → type) with blank lines between groups.

**Lint scope:** `.agents/**` and `.claude/**` (vendored GSD tooling) and `openapi/**` are ignored.
Per-file `/* eslint-disable … */` headers are used sparingly for DB-shape (`camelcase`) and test
files; keep the disabled rule list minimal and at file top.

## Import Organization

Enforced by `import-x/order`. Order, with blank line between each group:
1. Node builtins
2. External packages (`@sinclair/typebox`, `fastify`, `pg`, `vitest`)
3. Internal (`../../config/env.js`)
4. Parent / sibling relative imports (`./authorization.js`)
5. **Type-only imports last** (`import type { FastifyInstance } from "fastify"`)

**Critical:** relative imports use the `.js` extension (NodeNext ESM): `import … from "./types.js"`.
Type imports use `import type`. Alphabetized, case-insensitive within groups. No path aliases.

## Error Handling

- **Typed domain errors** per module in `errors.ts` (`src/modules/public-stats/routes/pagination/errors.ts`).
  Services raise typed errors; controllers translate them to HTTP status/codes.
- Service-level boundaries that aggregate results catch and convert to a result object rather than
  throwing across the batch — see `promoteRecord` in `src/modules/ingest/service.ts`, which returns
  `{ status: "failed", reason }` and narrows `error instanceof Error ? error.message : "…"`.
- HTTP handlers wrap risky calls in try/catch and return an explicit error response with a status
  code (`/auth/steam/callback` returns 401 with `{ message }` in `src/modules/auth/routes/routes.ts`).
- Always narrow `unknown` errors (`error instanceof Error`) — never assume a thrown value is an `Error`.

## Validation & Schemas (HTTP)

- Request/response validation uses **TypeBox** (`@sinclair/typebox`) declared inline or in
  `*.schemas.ts`, registered as Fastify route `schema` (`querystring`, `response` keyed by status).
  See `src/modules/auth/routes/routes.ts`.
- `@fastify/type-provider-typebox` provides typed inference.
- These schemas are the **OpenAPI contract source** consumed by `web` — schema changes must preserve
  generated-client compatibility (`pnpm run openapi:check`). See `.planning/codebase/INTEGRATIONS.md`.

## Configuration

- Env parsing via **envalid** `cleanEnv` in `src/config/env.ts` — a single typed `AppConfig` with
  nested sections (`ingest`, `auth`, `s3`). Choices/defaults declared per-var. Never read
  `process.env` ad hoc in business code; load config once and inject.

## Logging

- **pino** (`src/infra/logging/logger.ts`), structured. Correlate parser/job logs by `jobId` /
  `replayId`. **No logging in tests** (the pino instance is quieted).

## Function & Module Design

- Functions stay under the lint thresholds (120 lines / 25 statements). Long handlers extract private
  helpers (`authCallbackUrl`, `safeRedirectPath`, `definedQuery`).
- Pure helpers are module-level functions below the export (`conflictDetails` in
  `src/modules/ingest/service.ts`).
- **Module `index.ts` exposes only the cross-module service contract** — never repositories, routes,
  schemas, or errors.
- Cross-cutting clients (db, queue, storage) are provided by `src/infra/` and injected, never imported
  ad hoc into modules.

## Comments

- `capitalized-comments` is off; comments are used to justify non-obvious decisions (e.g. lint-ignore
  rationale in `eslint.config.js`, `vitest.config.ts`).
- V8 coverage exceptions are marked `/* v8 ignore next -- @preserve */` so each gap is auditable.

---

*Convention analysis: 2026-06-08*
