# Layers — controllers, usecases, services, repositories, DI

Translated from the SolidStats backend doctrine to TypeScript / Fastify. Read alongside §A of
`SKILL.md` (layer responsibilities and dependency rules). Every layer is a **factory** returning a
typed contract (`type X = {…}` + `createX(deps): X`); lower layers are typed to the contract, never
a concrete construction. Each section ends with an exhaustive checklist — any deviation is a finding.

---

## Controllers / routes

A controller's only job is to wrap one unit of business logic into a Fastify route — path, method,
request/response schema, status code. Anything that *decides* or *computes* belongs below it.

```ts
// appeal.routes.ts — the controller layer, as a Fastify plugin
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const appealRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();   // zod schemas → fully-typed handlers
  app.post(
    RoutePath.create,                       // from a const, not a scattered "/create" literal
    { schema: { body: AppealCreate, response: { 201: AppealFull } } },
    async (req, reply) => {
      const appealUsecase = app.getDecorator<AppealUsecase>('appealUsecase'); // typed, fails fast at boot if unregistered
      const appeal = await appealUsecase.create(req.body);       // req.body inferred from AppealCreate
      reply.code(201);
      return appeal;
    },
  );
};
```

The `validatorCompiler` / `serializerCompiler` are set once on the app (in `app.ts`, from
`fastify-type-provider-zod`); each routes plugin only calls `.withTypeProvider<ZodTypeProvider>()`.

**Checklist:**

- Routes are registered in the module's `*.routes.ts` plugin — never scattered or registered
  globally.
- The path comes from the module's `RoutePath` const, not a bare `"/create"` literal.
- Every route declares a **request** schema (`body`/`params`/`querystring`) **and** a **response**
  schema (zod). The response schema is mandatory — it drives serialization and the OpenAPI
  contract.
- `status_code` is explicit whenever it differs from 200 (`reply.code(201)`, `204`); a 204 route
  declares an empty response schema.
- The handler contains **no business logic**: no decision branch that computes an outcome, no
  Kysely call, no `try/catch` for domain flow (a thrown typed error is handled centrally).
- The handler calls **exactly one** usecase or service method and returns its result.
- Dependencies are reached via `app.getDecorator<Contract>('appealUsecase')` (Fastify 5.3+), typed
  to the **contract**, never a concrete factory and never through a `declare module 'fastify'`
  augmentation. `getDecorator` fails fast with `FST_ERR_DEC_UNDECLARED` at boot if the dependency
  was never registered.
- Plain CRUD with no orchestration may call the service directly; anything orchestrating multiple
  services goes through a usecase.
- The routes plugin is registered with its `prefix` and OpenAPI `tag` in the module plugin.

---

## Usecases (optional)

A usecase is justified **only** when an operation orchestrates more than one service or has
non-trivial assembly. Simple CRUD has no usecase — the controller calls the service.

```ts
type AppealUsecase = { create(input: AppealCreate): Promise<AppealFull> };

const createAppealUsecase = (deps: {
  db: Database;
  appealService: AppealService;          // depend on the CONTRACT, not createAppealService
  outboxService: OutboxService;
}): AppealUsecase => ({
  async create(input) {
    return deps.db.transaction().execute(async (tx) => {     // usecase owns the tx boundary
      const appeal = await deps.appealService.create(input, tx);
      await deps.outboxService.enqueue({ type: 'appeal.created', id: appeal.id }, tx);
      return appeal;
    });
  },
});
```

**Checklist:**

- The usecase exists only because it orchestrates **multiple** services or has non-trivial
  assembly. A usecase that wraps a single service call with no added logic is a layer that should be
  removed — call the service directly. **No pass-through layer** (§A): a usecase that only forwards
  — no guard, no transaction boundary, no orchestration across siblings, no row→domain validation —
  is a pure proxy and must be collapsed.
- It depends on service **contracts** (`AppealService`), never concrete factories, repositories, or
  another module's internals.
- It issues **no** queries of its own — only service calls.
- It does **not** re-validate or re-map what a service already returned validated; receiving a raw
  row means the service is broken — fix the service, don't paper over it here.
- **No no-op `try/catch` around service calls.** Services already throw typed domain errors;
  catching and re-throwing a generic "createFailed" hides the root cause and duplicates
  error-handling. Just `await` the service.
- It owns the **transaction boundary** for composite writes: opens one `db.transaction()` and
  threads the `tx` handle through every service/repository call.
- It logs the meaningful orchestration steps (which arm ran, what was enqueued) — see
  [std: correctness §Z/§AA].

---

## Services

A service works with repositories, returns **validated** domain data, and carries only minimal
business logic — guards and simple checks. Orchestrating several services is a usecase's job;
talking to storage is a repository's.

```ts
type AppealService = { getById(id: string, tx?: Transaction<DB>): Promise<AppealFull> };

const createAppealService = (deps: {
  appealRepository: AppealRepository;
  errors: AppealErrors;
}): AppealService => ({
  async getById(id, tx) {
    const row = await deps.appealRepository.findById(id, tx);
    if (!row) throw new deps.errors.NotFound({ id });   // the service decides "not found"
    return AppealFull.parse(row);                               // returns validated domain data
  },
});
```

**Checklist:**

- Raises **only typed domain errors** (`AppError` subclasses) — never a raw `Error`, never an
  HTTP-framework error, never a bare `throw value`.
- Errors from **external HTTP** calls use `ExternalServiceError`, not a domain error (preserve the
  taxonomy — see [std: correctness → External adapters]; server-2's 502 mapping is in
  `correctness-and-quality.md`).
- Contains **no Kysely queries** — only repository calls.
- Row → domain validation (`AppealFull.parse(row)`, zod's parse) happens here, not in the repository
  or the usecase.
- **No pass-through service** (§A): a service that only forwards a repository (or another service)
  call with no added logic — no guard, no row→domain validation, no typed-error decision — is a pure
  proxy and must be collapsed; the caller reaches the layer it forwarded to directly (still
  controller→service for plain CRUD — never a controller→repository skip).
- A "not found" / "empty" outcome is **decided here** (the repository returns `undefined`); the
  service turns it into a typed error or a domain-meaningful value.
- All public method return types are explicitly annotated and match the actual value — no implicit
  `any`, no missing annotation.
- The transaction handle (`tx`) is propagated to repositories for composite writes.

---

## Repositories

A repository is the data-access adapter: it builds and runs Kysely queries and returns typed rows.
No business logic, no domain-error decisions, no row→domain validation — those belong in the
service above it. A "not found" is an empty result the service interprets, not an error the
repository throws.

```ts
type AppealRepository = {
  findById(id: string, tx?: Transaction<DB>): Promise<AppealRow | undefined>;
  findPage(filter: AppealFilter, page: Pagination, tx?: Transaction<DB>): Promise<Paged<AppealRow>>;
};

const createAppealRepository = (deps: { db: Database }): AppealRepository => ({
  findById: (id, tx) =>
    (tx ?? deps.db).selectFrom('appeal').selectAll().where('id', '=', id).executeTakeFirst(),
  findPage: (filter, page, tx) =>
    paginate((tx ?? deps.db).selectFrom('appeal').selectAll().$call(applyAppealFilter(filter)), page),
});
```

**Checklist:**

- Uses the **Kysely** query builder — parameterized by construction. No string-interpolated SQL.
  Raw SQL only via Kysely's `sql` tag when the builder genuinely can't express it, always with bound
  parameters, never interpolating user input.
- Pagination goes through the **shared `paginate` helper**, never hand-rolled `.offset().limit()`
  repeated per method.
- Accepts an optional **transaction handle** (`tx`) and uses `tx ?? db`, so the same method works
  inside or outside a transaction.
- Returns DB **row types**, not domain schemas — the service validates/maps.
- Contains **no business logic** and makes **no domain-error decisions** — it returns
  `undefined`/empty, and the service decides what that means.
- Inputs are typed; ids are `string` (Steam) / branded surrogate types, never untyped.
- Partial updates write only the provided fields (Kysely `updateTable(...).set(patch)`), not a
  full-row overwrite.

---

## Dependency injection — Fastify plugins

Wiring is done with Fastify plugins and decoration — no DI container, no module-level singletons.
Registration uses `app.decorate(name, value)`; **access** uses `app.getDecorator<Contract>(name)`
(Fastify 5.3+), typed to the contract at the access site. There is **no `declare module 'fastify'`
global interface augmentation** — `getDecorator`'s type parameter carries the type locally, so no
global `FastifyInstance` type bleed, and an unregistered dependency throws `FST_ERR_DEC_UNDECLARED`
at boot instead of surfacing as `undefined` at request time. The sibling override `setDecorator`
is what route integration tests use to swap a decorated dependency for a controlled double after
build (see `solidstats-server-ts-tests`).

```ts
// src/infra/db/db.plugin.ts — a cross-cutting client, app-wide
export const dbPlugin = fp(async (app) => {
  const db = createDatabase(app.config);          // built inside the plugin, never at import time
  app.decorate('db', db);
  app.addHook('onClose', async () => db.destroy()); // teardown
});

// modules/appeal/appeal.plugin.ts — wires the module's layers
export const appealPlugin = fp(async (app) => {
  const db = app.getDecorator<Database>('db');                  // typed access; throws at boot if 'db' is unregistered
  const outboxService = app.getDecorator<OutboxService>('outboxService');
  const appealRepository = createAppealRepository({ db });
  const appealService = createAppealService({ appealRepository, errors: appealErrors });
  app.decorate('appealUsecase', createAppealUsecase({ db, appealService, outboxService })); // register
  await app.register(appealRoutes, { prefix: '/appeals' });
}, { name: 'appeal', dependencies: ['db', 'outbox'] });
```

**Checklist:**

- Cross-cutting clients (`db`, `queue`, `storage`, `config`) are provided by `src/infra/` plugins
  wrapped in `fastify-plugin` (`fp`) and exposed via `app.decorate`, with an `onClose` hook for
  teardown.
- Per-module layers are built by their factories inside the module plugin and decorated/registered
  there.
- Everything depends on the **contract type**, never the concrete factory or another module's
  internals (cross-module only via the exported service contract).
- Decorated dependencies are **registered** with `app.decorate(name, value)` and **accessed** with
  `app.getDecorator<Contract>(name)` (Fastify 5.3+), typed to the contract at the access site —
  **no `declare module 'fastify'` global interface augmentation**. `getDecorator` fails fast with
  `FST_ERR_DEC_UNDECLARED` at boot for an unregistered dependency. Route integration tests use the
  override `app.setDecorator<Contract>(name, double)` after build (see `solidstats-server-ts-tests`).
- **No module-level state**: the rule lives in **[std: correctness → Process lifecycle &
  construction]** and applies here unchanged — construct inside a plugin/factory, never at import
  time.
- A long-lived shared client (HTTP, S3) is created **once** in its plugin and reused — never
  re-instantiated per request.
- The plugin declares its `name` and its `dependencies` so load order is explicit.
- Config is reached through the `config` decorator (validated once at boot — see
  `schemas-and-data.md` → Config), never `process.env` reads scattered through the code.
