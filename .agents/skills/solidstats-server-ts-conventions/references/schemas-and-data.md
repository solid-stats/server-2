# Schemas, errors & data

Translated from the SolidStats backend doctrine to TypeScript / Fastify (zod 4 + Kysely + envalid).
Covers the server-2 error→HTTP mapping, zod schema discipline, Kysely data access, filters/
pagination, transactions, and config. The shared base rules live in
`solidstats-shared-backend-ts-standards` (cited as `[std: …]`). Read alongside `layers.md`.

---

## Error system

Base hierarchy / taxonomy rules: **[std: SKILL §B]** — typed errors only (never a raw `Error`, an
HTTP-framework error, or a bare value), per-module `<feature>.errors.ts` with `snake_case` codes,
`details` semantics, cause-chain preservation, and the domain-vs-`ExternalServiceError` taxonomy
all live there. This section adds only the **server-2 transport mapping**: the `httpStatus`
extension and the central handler.

```ts
// src/infra/errors/app-error.ts — the server-2 concrete form of the [std: SKILL §B] base
abstract class AppError extends Error {
  readonly isOperational = true;                 // expected/handled vs a programmer bug
  protected constructor(
    readonly code: string,                       // snake_case, unique within its module
    readonly httpStatus: number,                 // semantic — see table below
    message: string,
    readonly details?: Record<string, unknown>,
    options?: ErrorOptions,                       // { cause } is forwarded to Error
  ) {
    super(message, options);                      // keeps error.message; preserves the cause chain
  }
}

// modules/appeal/appeal.errors.ts
class AppealNotFound extends AppError {
  constructor(details?: Record<string, unknown>, options?: ErrorOptions) {
    super('appeal_not_found', 404, 'Appeal not found', details, options);
  }
}
// throw new AppealNotFound({ id });                 // simple
// throw new AppealNotFound({ id }, { cause: err }); // with the source chain
```

- `httpStatus` is set from a **semantic** constant, never a bare literal scattered in logic:
  - `400` — business validation failure / invalid state transition
  - `403` — insufficient permissions
  - `404` — entity does not exist
  - `409` — uniqueness / conflict
  - `422` — invalid request payload (a project override; zod's `validatorCompiler` defaults to **400**)
  - `502` — an upstream service returned an error
  - `500` — reserved for the unknown/unexpected error only, never a domain error
- One **central `setErrorHandler`** maps errors to the response envelope and logs them:

```ts
app.setErrorHandler((err, req, reply) => {
  req.log.error({ err });
  if (err instanceof AppError) return reply.code(err.httpStatus).send(envelope(err));
  if (err.validation) return reply.code(422).send(validationEnvelope(err));   // zod validation
  return reply.code(500).send(opaque500(req));     // never leak internals in prod
});
```

- Response envelope is consistent across the API: `{ statusCode, error, message, details? }`.

---

## zod schemas

Request and response shapes are zod 4; the TS type is derived from the schema, never hand-mirrored.
server-2 builds routes on the zod type provider (`fastify-type-provider-zod`), so passing a schema
variable into a route fully types the handler.

```ts
import { z } from 'zod';

const AppealCreate = z
  .object({
    title: z.string().max(200),                              // bound every string
    tags:  z.array(z.string()).max(50),                      // bound every array
    score: z.number().int().min(0).max(100).optional(),
  })
  .strict();                                                 // reject unknown keys
type AppealCreate = z.infer<typeof AppealCreate>;
```

- Derive types with `z.infer<typeof Schema>` — never maintain a parallel hand-written interface.
- **Bound every string (`.max(n)`) and array (`.max(n)`)** on request bodies, and bound numeric
  ranges (`.int().min().max()`) — an unbounded field is a DoS vector (the review hunts for missing
  bounds; see `correctness-and-quality.md` → schema quality).
- **`.strict()` on request objects** — rejects unknown keys (the zod 4 form of the old
  `additionalProperties: false`).
- Schema naming: `XBase` (minimal shared), `XFull` (all fields + relations), `XCreate` (creation
  input), `XUpdate` (partial — `XCreate.partial()`), `XRow` (DB row shape).
- A **response schema is always declared** on a route — it gates serialization and feeds the
  generated OpenAPI (the contract `web` consumes).
- **Pin the emitted OpenAPI spec to 3.0.x.** `@fastify/swagger` documents OpenAPI 3.0.0 output
  only — 3.1 support is unconfirmed; do not assume it works.
- **Pass the schema variable into the route — inference stays intact; register via
  `z.globalRegistry` for `$ref` dedup.** With `fastify-type-provider-zod` there is **no
  inline-vs-`$ref` tradeoff**: the route always receives the real schema variable (so `req.body` /
  `req.params` / `req.query` and the response are inferred), while `jsonSchemaTransformObject`
  emits a deduplicated `#/components/schemas/AppealFull` for any schema registered with an `id`:

  ```ts
  z.globalRegistry.add(AppealFull, { id: 'AppealFull' });   // emits a $ref in the OpenAPI output
  ```

  Dedup and handler-typing are **decoupled** — registering for `$ref` never costs you inference,
  unlike the retired TypeBox `Type.Ref`, which broke handler type inference (the reason for this
  migration).
- IDs are typed `string`; timestamps are ISO strings — `z.iso.datetime()` (or `z.string().datetime()`).
- zod handles *shape* validation (`validatorCompiler` → **400** by default; the central handler
  remaps it to 422 if that's the project's chosen code). **Domain** validation (a rule that
  needs data or context) lives in the **service** and raises a typed `AppError` — do not push
  business rules into `z.refine()` / schema refinements.

---

## Kysely data access & models

- The database shape is a typed Kysely `Database` interface (table row interfaces). Columns are
  precisely typed; nullable columns are `T | null`, not loose.
- **Repository signatures expose only `Selectable<T>` / `Insertable<T>` / `Updateable<T>` row
  types** — never the raw table interface, whose column types conflate the select/insert/update
  shapes (generated columns, defaults).
- **`kysely-codegen --verify` runs in CI** so the generated `Database` types are checked against
  the live schema — schema drift fails the build, not production.
- Surrogate keys are explicit and consistently named (`id`); Steam identity is `steamId64: string`.
- `createdAt` / `updatedAt` are managed consistently (DB default or a shared helper) — not set
  ad-hoc per insert.
- Frequently-filtered columns are indexed (declared in the migration).
- If Postgres schemas/namespaces are used to separate domains, the schema is explicit in the table
  definition — never implicit `public`.
- Configuring `pg.Pool` explicitly is the long-lived-client rule — see **[std: correctness → External adapters]** for the required parameters.

### Migrations

- Run through the existing `src/infra/db/migrate.ts` script (`pnpm db:migrate`); no ad-hoc DDL.
- Every migration has a correct `up` **and** `down`.
- Adding a `NOT NULL` column to an existing table includes a `DEFAULT` or a prior backfill step in
  the same migration.
- Migration files have descriptive names, not just a hash/timestamp.

### Transactions

- A composite write (multiple inserts/updates that must succeed together) runs in **one** Kysely
  transaction, opened by the **usecase**: `db.transaction().execute(async (tx) => { … })`.
- Services and repositories accept an optional `tx` and use `tx ?? db`, so the same method composes
  inside or outside a transaction. The transaction boundary is never opened in a repository or a
  controller.

---

## Enums & constants

The enum/const discipline lives in **[std: SKILL §C]** — `as const` objects with derived union
types, no magic strings, conditions compare against the const. server-2 adds one HTTP-specific
rule:

- Per-module route paths live in a `RoutePath` const (referenced by the routes plugin), not inline
  literals: `const RoutePath = { create: '/create', revoke: '/:id/revoke' } as const;`

---

## Filters & pagination

```ts
type Pagination = { limit: number; offset?: number; cursor?: string };
type Paged<T> = { items: T[]; total?: number; hasMore: boolean };

const applyAppealFilter = (f: AppealFilter) => (qb: AppealQuery) =>
  f.statusIn ? qb.where('status', 'in', f.statusIn) : qb;   // composable, $call-able
```

- Pagination uses the shared `Pagination` type and the `paginate` helper; results are `Paged<T>`.
  Offset for small/bounded sets; cursor (`limit` + `cursor` + `hasMore`) for large stat listings.
- Filters are typed objects applied via composable `$call(applyXFilter(f))` helpers — not query
  fragments hand-built inside each repository method.
- `orderBy` is a typed union with an explicit default, never a raw client-supplied string.

---

## Config / env

```ts
// src/config/env.ts — validated once, at boot
export const loadConfig = () => cleanEnv(process.env, {
  DATABASE_URL: str(),
  RABBITMQ_URL: str(),
  S3_ENDPOINT: str(),
  STEAM_API_KEY: str(),
});
```

- Validate env **once at boot** with envalid and expose the result via the `config` decorator.
  Everything reads `app.config`, never `process.env` directly.
- The discipline bullets — no config files, no per-environment objects, no `NODE_ENV` branching,
  no hardcoded secrets, no module-top-level reads, schema-first types, bound external fields —
  live in **[std: SKILL §D]** and apply unchanged.
