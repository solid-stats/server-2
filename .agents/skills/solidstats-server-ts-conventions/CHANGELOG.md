# Changelog — solidstats-server-ts-conventions

## 2026-06-13 — Three settled conventions: no pass-through layer, typed `getDecorator` access, depcruise boundary enforcement
- **No pass-through layer (decision A).** §A "Dependency rules" gains a rule: a usecase **or
  service** that only forwards a call with no added logic (no guard, transaction boundary,
  orchestration, or row→domain validation) must not exist — collapse it. This generalizes the
  existing "a usecase wrapping a single service call should be removed" rule (`layers.md`) to any
  pure-proxy layer, service included. Collapsing never introduces a layer skip: the only legal skip
  stays controller→service for plain CRUD — there is **no** controller→repository shortcut.
  Matching lines added to the usecase checklist (extends the single-call rule) and the service
  checklist (`references/layers.md`).
- **Typed decorator access via `getDecorator`/`setDecorator` (decision B; server-2 on Fastify
  ^5.8.5).** Registration stays `app.decorate(name, value)`, but decorated deps are **accessed via
  `app.getDecorator<Contract>(name)`** (Fastify 5.3+) — which throws `FST_ERR_DEC_UNDECLARED` at
  boot if unregistered — and the `declare module 'fastify'` global interface-augmentation blocks
  are **dropped** (no more global `FastifyInstance` type bleed; the type is carried locally at the
  access site). §A DI bullet, the `references/layers.md` controller example + checklist, and the DI
  section (prose intro, plugin example, checklist) updated. `setDecorator` noted as the override
  route integration tests use after build (cross-ref `solidstats-server-ts-tests`).
- **Mechanical boundary enforcement via dependency-cruiser (decision C).** New §A "Boundary
  enforcement" subsection: a `.dependency-cruiser.cjs` preset — the **same tool the fetcher uses**,
  one boundary tool across both TS services — encodes the layer/module rules as `forbidden` import
  rules: (1) cross-module imports only through the module's `index.ts` public surface (the exported
  service contract), no reaching into another module's repository/usecase/route/schema/errors;
  (2) a layer allowlist — `*.repository.ts` and `src/infra/` import nothing upward, dependencies
  point downward only (controller → usecase → service → repository). Preset draft lives at
  `plans/server-2/briefs/server-2-dependency-cruiser.cjs`. The reviewer's manual
  layer/boundary checks become a backstop for what depcruise cannot see (semantic placement — e.g.
  whether a service really adds logic or is a pass-through), not the primary gate.

## 2026-06-13 — TypeBox → zod 4 (whole skill); fastify-type-provider-zod
- **Migrated server-2's schema layer from TypeBox to zod 4** (`fastify-type-provider-zod`),
  retiring `@sinclair/typebox` + `@fastify/type-provider-typebox`. Every existing schema rule keeps
  its intent at full fidelity — only the expression changes to zod; voice, severity tags, and
  section structure are unchanged. The whole SolidStats org is now zod-uniform (fetcher + web were
  already zod). OpenAPI is still emitted from route schemas via `@fastify/swagger` (3.0.x pin held);
  the web client still consumes it via `openapi-typescript`.
- **`references/schemas-and-data.md`:** the **TypeBox schemas** section is now **zod schemas** —
  `z.object({…}).strict()` (replaces `additionalProperties: false`); `z.string().max()` /
  `z.array(z.string()).max()` / `z.number().int().min().max()` bounds; `.optional()`;
  `z.iso.datetime()` for ISO timestamps; types via `z.infer<typeof X>` (replaces `Static`);
  `XUpdate = XCreate.partial()`. **Rule change (decoupling, not a reversal of intent):** the old
  "Share common schemas via `$id` + `app.addSchema`" guidance AND the "inline-vs-`Type.Ref` /
  handler-inference tradeoff" note are both replaced by the zod story — pass the schema variable
  into the route (inference stays intact) **and** register via `z.globalRegistry.add(X, { id })` for
  `$ref` dedup in the OpenAPI output; with `fastify-type-provider-zod` these are decoupled, so there
  is no inline-vs-`$ref` tradeoff (unlike the retired `Type.Ref`, issue #263, which broke handler
  inference — the reason for the migration). Domain validation still lives in the service as a typed
  `AppError`, now stated as "not in `z.refine()`". Error-system Ajv mentions retagged to zod's
  `validatorCompiler`. The error-system, Kysely, enums, filters, and config sections are otherwise
  untouched.
- **SKILL.md:** description, Scope, reference-map, and the module-layout comment now say
  zod 4 / `fastify-type-provider-zod` instead of TypeBox / `@fastify/type-provider-typebox`; the
  OpenAPI-from-route-schemas pipeline is unchanged.
- **`references/layers.md`:** the controller route example uses
  `fastify.withTypeProvider<ZodTypeProvider>()` + zod schemas (was `FastifyPluginAsyncTypebox`),
  with a note that the validator/serializer compilers are set once on the app; the services example
  validates rows with `AppealFull.parse(row)` (was `Value.Parse(AppealFull, row)` from
  `@sinclair/typebox/value`). Layer rules, checklists, and severities are identical.
- **`references/correctness-and-quality.md`:** Schema-quality bullets retagged from JSON-Schema
  keyword names (`maxLength`/`maxItems`/`minimum`/`maximum`, "schema keywords") to zod methods
  (`.max()`/`.min()`, "zod refinements") — same rules, same 🟡 severity.

## 2026-06-13 — server-2 only; shared rules extracted to solidstats-shared-backend-ts-standards (taxonomy V5)
- **Scope narrowed to server-2 only.** The replays-fetcher shared-baseline bullet and the `[HTTP]`
  tag mechanism are gone — the whole skill is HTTP now, so every `[HTTP]` marker was removed
  file-wide. The fetcher gets its own trio (`solidstats-fetcher-ts-*`); the rules both services
  share moved (at full fidelity, not rewritten) to `solidstats-shared-backend-ts-standards`,
  which this skill now builds on (and which builds on `solidstats-shared-ts-standards`).
- **SKILL.md:** description + intro rewritten for the two-layer standards stack; §B Naming is now a
  pointer to `[std: SKILL §A]` (this skill adds no extra naming rules beyond the §A role-file
  vocabulary); reference-map table descriptions updated.
- **`references/layers.md`:** dropped `[HTTP]` markers; observability and external-adapter
  cross-references re-pointed to `[std: correctness]`; the DI checklist's "No module-level state"
  bullet now cites `[std: correctness → Process lifecycle & construction]` instead of restating it
  (single home for the rule).
- **`references/schemas-and-data.md`:** Error system keeps the server-2 concrete form (`AppError`
  with `httpStatus`, status table, `setErrorHandler`, envelope, 422 override) and opens with a
  pointer to the `[std: SKILL §B]` base; duplicated base rules removed; trailing
  replays-fetcher/Zod note deleted; Enums stubbed to `[std: SKILL §C]` keeping only the `RoutePath`
  note; Config keeps the envalid example + config-decorator rule and points to `[std: SKILL §D]`
  for the discipline bullets. The `pg.Pool` config bullet now cites
  `[std: correctness → External adapters]` (the long-lived-client rule) instead of restating it
  (single home for the rule). Research additions (research-server.md pass 2): pin emitted OpenAPI
  to 3.0.x (3.1 unconfirmed); **rule change (reversal):** prefer inline schemas where handler
  inference matters (`Type.Ref`/`addSchema` only for `$ref` dedup) — this deliberately reverses
  the previous "Share common schemas via `$id` + `app.addSchema`" prescription, because
  `Type.Ref()` breaks handler type inference; repository signatures expose only
  `Selectable<T>`/`Insertable<T>`/`Updateable<T>`; `kysely-codegen --verify` in CI.
- **`references/correctness-and-quality.md`:** now server-2-specific only — opens with a
  "Moved to solidstats-shared-backend-ts-standards" forwarding table (External adapters, Async
  safety, LSP, SOLID, DRY, Utility & type libraries, §Z/§AA/§AB, Code-quality bugs, Comments,
  Imports) so stale citations resolve. Kept: Security depth, Security & runtime hardening
  (graceful-shutdown bullet keeps the Fastify drain/under-pressure specifics, principle points to
  std), Queue reliability, Schema quality, plus a short External-adapters 502 stub and the
  server-2 metrics/health surface delegated by `[std: §Z]`. Queue reliability updated per
  research: per-consumer prefetch explicit (global deprecated in RabbitMQ 4.0; 100–300 guidance),
  DLX effectively mandatory on quorum queues (default delivery-limit 20 silently drops),
  `nack(requeue)` (no delivery-count increment, transient) vs `reject(no-requeue)` (counted
  failure) codified, consumers idempotent (`redelivered` is a hint, not proof).

## 2026-06-07 — Add `day.js` + `nanoid` to utilities
- `correctness-and-quality.md`: added **`day.js`** (date handling over `Date` math / Moment.js, UTC at
  the boundary) and **`nanoid`** (application-level ids — idempotency/correlation/job ids — over
  `Math.random`/slugs; DB keys still own primary keys) to **Utility & type libraries**. Both 🔵, and
  folded into the evidence gate.

## 2026-06-07 — Utility & type library recommendation
- `correctness-and-quality.md`: added a **Utility & type libraries** section (after DRY) — actively
  prefer `es-toolkit` over hand-rolled runtime helpers / `lodash`, and `type-fest` for type derivation
  over hand-rolled mapped/conditional types. Domain types still derive from the one source of truth
  (TypeBox `Static`, Kysely rows). 🔵 with an evidence gate scoped to generic reinventable helpers
  only (bespoke domain logic excluded). Enforced automatically via the code-review skill's delegation.

## 2026-06-06 — Analysis fixes (see .planning/SKILLS-ANALYSIS.md)
- Corrected row→domain validation: TypeBox has no `.parse()` — use `Value.Parse(Schema, x)` from
  `@sinclair/typebox/value` (was Zod's API).
- Reworked the `AppError` example: ctor takes message + `ErrorOptions` and forwards `{ cause }` to
  `super` (was dropping cause + empty message); `code`/`httpStatus` no longer `readonly`-abstract
  (compiles under ES2022 class fields).
- Fixed the 422 claim (Fastify's Ajv validation defaults to **400**; 422 is a project override).
- Named the Kysely transaction type (`Transaction<DB>`, was an undefined `Tx`); added explicit
  `pg.Pool` config rule.
- Added a **Security & runtime hardening** section (rate-limit, helmet/CORS, bodyLimit, graceful
  shutdown, auth/session+CSRF, secrets-in-responses) and a **Queue reliability** section (manual ack,
  prefetch/QoS, DLQ, idempotency).
- Dropped the bogus "§T–§AB" section range (only §Z/§AA/§AB are lettered); added repository/migration/
  Kysely/queue triggers; removed the stale "(not yet built)" note.

## 2026-06-06 — Initial
- Rebased on `estesis-backend-vc-code-review` (the team's proven backend doctrine), translated
  Python/FastAPI → TypeScript/Fastify at **full fidelity** (§A–§AB), anchored to server-2's actual
  stack: Fastify 5, TypeBox, Kysely/pg, amqplib, S3, pino, prom-client, envalid.
- **Architecture:** 4-layer model — controllers → usecases → services → repositories — with the
  usecase layer optional (only for multi-service orchestration). Downward-only dependencies;
  cross-module sharing only via a module's exported service contract.
- **Style decisions (made by Claude per the user's delegation of backend internals):**
  - DI/contracts: **functional factories** returning typed contract objects (`type X` +
    `createX(deps): X`), no classes, no `I`-prefix — lowest ceremony, easiest to test, cleanest with
    Fastify decoration.
  - Module layout: **flat role-files** (`appeal.service.ts`, `appeal.repository.ts`, …).
- **Scope:** server-2 (Fastify) is the primary subject; a shared baseline (layering, naming, errors,
  async, logging, config, TS strictness) also binds the `replays-fetcher` CLI. Fastify/TypeBox/HTTP
  sections are tagged `[HTTP]` and do not bind the CLI.
- **Structure:** `SKILL.md` spine (architecture, module layout, naming) + `references/`:
  - `layers.md` — controllers, usecases, services, repositories, Fastify-plugin DI, with an
    exhaustive per-layer checklist (full estesis granularity).
  - `schemas-and-data.md` — typed error system, TypeBox schema discipline, Kysely data access,
    enums/filters/pagination, transactions, envalid config.
  - `correctness-and-quality.md` — full §T–§AB (LSP, async safety, security depth, SOLID, DRY,
    schema quality, observability, log diagnosability, resource lifecycle) + code-quality, comments,
    imports/lint. Each rule notes the severity the code-review skill maps it to.
- Absorbs `fastify-best-practices`, `nodejs-backend-patterns`, `api-design-principles` — those
  generic skills are not installed separately; their guidance lives here, tuned to SolidStats.
- The design/correctness rules are stated as conventions; the separate
  `solidstats-server-ts-code-review` skill operationalizes them into hunts with
  evidence gates, the OpenAPI conformance gate, and the severity table.
