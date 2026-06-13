---
name: solidstats-server-ts-conventions
description: >
  Prescriptive architecture and coding conventions for server-2 — the SolidStats
  TypeScript/Fastify HTTP backend. Defines the 4-layer architecture (controllers → usecases →
  services → repositories), module layout, the server-2 error→HTTP mapping, zod 4 schema
  discipline, Kysely data access, Fastify-plugin dependency injection, and the
  security/queue-reliability rules. Builds on solidstats-shared-backend-ts-standards (which
  builds on solidstats-shared-ts-standards) — read both first. Consult this before writing or
  changing any server-2 code; it is also the rule source that solidstats-server-ts-code-review
  enforces.
  Use this proactively — read it before writing or changing ANY server-2 TS/Fastify code, even
  when the task doesn't say "conventions"; standardizing the code is worth a few tokens.
  Triggers: "backend conventions", "fastify route", "add endpoint", "write a service",
  "write a repository", "add a migration", "kysely query", "queue consumer", "backend module",
  "конвенции бэкенда", "напиши эндпоинт", "добавь роут", "сервис на fastify", "напиши репозиторий",
  "добавь миграцию", "воркер очереди", "структура модуля бэкенда".
---

# SolidStats Backend Conventions — TypeScript / Fastify

**This skill builds on [`solidstats-shared-backend-ts-standards`](../solidstats-shared-backend-ts-standards/SKILL.md)
(which builds on [`solidstats-shared-ts-standards`](../solidstats-shared-ts-standards/SKILL.md)) — read both first.**
The backend standards skill owns the shared service baseline cited as `[std: …]`: naming and
factory contracts, the typed-error base, enums, config discipline, external adapters, async
safety, process lifecycle, LSP/SOLID/DRY, and §Z/§AA/§AB. The TS standards skill owns the
TypeScript baseline: tsconfig strictness flags, code style (`type` over `interface`, no `any`,
no `as`), the ESLint 10 setup, Node 25 / pnpm 11, Prettier defaults, and Vitest 4 / V8 coverage
gates. This skill adds only the **server-2 Fastify/HTTP HOW** on top of those.

These are the **prescriptive** conventions for the SolidStats backend: what good backend code
*should* look like, not a description of whatever exists today. Where current code diverges, the
code is brought into line over time — the convention wins. This skill is the rule source that
[`solidstats-server-ts-code-review`](../solidstats-server-ts-code-review/SKILL.md) enforces and
that [`solidstats-server-ts-tests`](../solidstats-server-ts-tests/SKILL.md) assumes.

## Scope

- **`server-2` only**: the Fastify HTTP backend (Fastify 5, zod 4 + fastify-type-provider-zod,
  Kysely/pg, amqplib, S3, pino, prom-client, envalid). All sections apply. For `replays-fetcher` use
  `solidstats-fetcher-ts-conventions`; the rules both services share live in
  `solidstats-shared-backend-ts-standards`.

This skill absorbs the relevant Fastify, Node, and API-design best practices — those generic
skills are not installed separately; their guidance lives here, tuned to SolidStats.

## Reference map

The detailed rules live in `references/`. Read the one you need:

| File | Covers |
|------|--------|
| `references/layers.md` | Per-layer rules: controllers/routes, usecases, services, repositories, and Fastify-plugin DI. |
| `references/schemas-and-data.md` | zod 4 schemas (OpenAPI 3.0.x pin, schema-variable + `z.globalRegistry` `$ref` dedup), the server-2 error→HTTP mapping on the [std: SKILL §B] base (status table, `setErrorHandler`, envelope, 422 override), Kysely data access & query rules (`Selectable`/`Insertable`/`Updateable`, codegen `--verify`), filters/pagination, `RoutePath`, envalid config. |
| `references/correctness-and-quality.md` | The server-2-specific correctness rules: security depth (IDOR, mass assignment), security & runtime hardening, queue reliability (RabbitMQ consumer discipline), schema quality, the metrics/health surface — plus the forwarding table for the rules that moved to `solidstats-shared-backend-ts-standards`. |

This SKILL.md owns the spine that everything else hangs off: the architecture and the module
layout.

---

## A. Architecture, layers & module structure

The backend is split into **feature modules** under `src/modules/<feature>/`, plus cross-cutting
infrastructure under `src/infra/`. Most rules in this skill are really one rule — *keep each layer
doing its own job* — so start with the layer responsibilities; the specific checks then read as
consequences, not dogma.

### Layer responsibilities (bottom-up)

| Layer | Responsibility | Depends on |
|-------|----------------|------------|
| **repository** | Data-access adapter. Builds and runs Kysely queries, returns typed rows. No business logic, no HTTP. | (db) |
| **service** | Works with repositories; returns **validated** domain data; carries minimal business logic (guards, simple checks); raises typed domain errors. | repositories |
| **usecase** *(optional)* | Orchestrates **multiple** services into one unit of business logic and owns the transaction boundary. | services |
| **controller** (Fastify route + handler) | Wraps one unit of business logic into an HTTP endpoint — routing, request/response schema, status code. No logic of its own. | usecases (or a service directly, for plain CRUD) |

The **usecase layer is optional**: introduce it only when an operation orchestrates more than one
service or has non-trivial assembly/transaction logic. Plain CRUD goes straight from controller to
service.

### Dependency rules

- Dependencies point **downward only**: `controller → usecase → service → repository`. A lower
  layer never imports an upper one — a repository knows nothing about services; a service never
  calls a usecase.
- No layer reaches **past** the one below it for business flow: a controller never calls a
  repository directly; a usecase never issues a Kysely query. (A controller may call a service
  directly for plain CRUD with no orchestration — that controller→service carve-out is the *only*
  legal layer skip; there is no controller→repository shortcut.)
- **No pass-through layer.** A usecase or service that only *forwards* a call without adding logic
  of its own — no guard, no transaction boundary, no orchestration across siblings, no
  row→domain validation — must not exist; collapse it and let the caller reach the layer below
  directly. This generalizes the "a usecase wrapping a single service call should be removed" rule
  (`references/layers.md`) to any pure-proxy layer, service included. Collapsing never means adding
  a layer skip: a pure-proxy service folds into its caller calling the service it forwarded to
  (still controller→service for plain CRUD), not into a controller→repository call.
- **Cross-module sharing happens only through a module's service contract.** Module A may depend on
  module B's exported service *interface* (`BService`) — nothing else. Importing B's repository,
  usecase, route, schema, or error internals into A is a violation.
- Genuinely cross-cutting code lives in `src/infra/` (db, queue, storage, logging, metrics, health,
  runtime) — never copied between modules or pulled sideways from a peer module.

### Module layout

Every feature module follows this layout (files; small modules may inline, but the role split
stays):

```
src/modules/<feature>/
├── <feature>.routes.ts        # Fastify plugin — registers routes (the controller layer)
├── <feature>.controller.ts    # handlers, when separated from route registration
├── <feature>.usecase.ts       # optional — orchestration across services + transaction boundary
├── <feature>.service.ts       # business logic; returns validated data; raises typed errors
├── <feature>.repository.ts    # Kysely data access only
├── <feature>.schemas.ts       # zod request/response schemas
├── <feature>.errors.ts        # module-specific typed errors + codes
├── <feature>.types.ts         # domain types (derived from schemas / DB row types)
├── <feature>.constants.ts     # enums, status/type unions, route-path constants
└── index.ts                   # public surface — re-exports ONLY the service contract used cross-module
```

- New files land in the correct role file/dir — no flat modules where a service sits beside a
  handler with no layer separation.
- `index.ts` exposes only what other modules may consume (the service contract). It never
  re-exports repositories, usecases, routes, schemas, or errors.
- New routes are registered with the app (a single place wires module route-plugins with their
  prefix/tag), not scattered.
- Cross-cutting clients (db, queue, storage) are **not** imported ad-hoc — they are provided by
  `src/infra/` plugins and injected (see DI, `references/layers.md`).
- Decorated dependencies are registered with `app.decorate(name, value)` but **reached via
  `app.getDecorator<Contract>(name)`** (Fastify 5.3+), typed to the contract — not through a
  `declare module 'fastify'` interface augmentation. `getDecorator` fails fast with
  `FST_ERR_DEC_UNDECLARED` at boot if the dependency was never registered, and keeps the type
  local to the access site instead of bleeding a global `FastifyInstance` augmentation across the
  app (see DI, `references/layers.md`).

### Boundary enforcement

The layer and module rules above are also enforced **mechanically** by a `.dependency-cruiser.cjs`
preset — the same tool the fetcher uses, so one boundary-enforcement tool spans both TS services
(`solidstats-fetcher-ts-conventions` ships the fetcher's preset; the preset draft for server-2
lives at `plans/product/skills-taxonomy/drafts/server-2-dependency-cruiser.cjs`). The preset is the
executable form of the rules in this section, expressed as `forbidden` import rules:

1. **Public-surface only across modules.** A cross-module import is legal only when it reaches
   another module through that module's `index.ts` (the exported service contract). Importing into
   another module's `*.repository.ts`, `*.usecase.ts`, `*.routes.ts`, `*.schemas.ts`, or
   `*.errors.ts` is forbidden.
2. **Layer allowlist (downward only).** Dependencies point downward —
   `controller → usecase → service → repository`. A `*.repository.ts` imports nothing upward (no
   service, usecase, or controller). `src/infra/` (cross-cutting) imports nothing upward either.

(The draft splits these two conceptual rules into several `forbidden` entries — public-surface,
per-layer upward bans, and a no-cycles baseline — plus a no-type-only-exemption rule; see the
preset and its notes.) **The preset is aspirational against today's code:** server-2 has no
`index.ts` barrels yet and a few real layer inversions, so the first run reports many violations —
that is the prescriptive convention pulling the code into line over time, not a config to relax.

The reviewer's manual layer/boundary checks become a **backstop for what depcruise cannot see** —
semantic placement (is this really orchestration? does this service actually add logic, or is it a
pass-through?) — not the primary gate; the import-graph rules are the primary gate.

---

## B. Naming

Naming lives in the standards layer: **[std: SKILL §A]** in
[`solidstats-shared-backend-ts-standards`](../solidstats-shared-backend-ts-standards/SKILL.md) —
file shape, factory contracts (`type X` + `createX(deps): X`, no classes, no `I`-prefix), casing,
and identifiers (`steamId64`, `<entity>Id`, `jobId`/`replayId`). This skill adds no extra naming
rules beyond the role-file vocabulary shown in §A (`<feature>.routes.ts`, `.service.ts`,
`.repository.ts`, …) — deviation from either is a finding.

---

## Using this skill

When writing or changing backend code, consult the spine here for placement (naming, errors,
enums, and config discipline live in `solidstats-shared-backend-ts-standards`), then the
relevant `references/` file for the layer or concern you are touching. When in doubt about whether
something is a convention violation, the rule is: does it keep each layer doing its own job, does
it preserve the typed contract, and does it match an explicit rule here? If yes to all, it is fine.
