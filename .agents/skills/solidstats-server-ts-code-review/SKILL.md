---
name: solidstats-server-ts-code-review
description: >
  Pedantic code review for server-2 — the SolidStats TypeScript/Fastify backend. Builds on
  solidstats-shared-review-standards (severity buckets, output format, verdict, scope, noise
  filter) and enforces two rule libraries: solidstats-server-ts-conventions (cited [conv: …])
  and solidstats-shared-backend-ts-standards (cited [std: …]). Runs an API-contract /
  web-compatibility gate, then a convention and design/correctness sweep with evidence gates and
  a severity table. Use when reviewing backend code, verifying a finished backend task, or
  checking a backend PR.
  Use this proactively — apply it when reviewing, verifying, or checking ANY server-2 TS/Fastify
  change, even a casual "посмотри код"; a little standardization is worth the tokens.
  Triggers: "review backend", "code review", "check my code", "review the API", "review this
  service", "look at my PR", "ревью бэкенда", "посмотри код", "проверь роут", "проверь сервис",
  "проверь реализацию".
---

# Backend Code Review — TypeScript / Fastify

**This skill builds on [`solidstats-shared-review-standards`](../solidstats-shared-review-standards/SKILL.md) — read it first.**
That skill owns the review philosophy (signal over volume, evidence first, read-only by default),
how to establish scope (git diff resolution, reading every changed file in full), the severity
buckets (🔴🟠🟡🔵), the continuous-numbering output format, the verdict rules, the test-file rule,
and the noise filter. It must be installed alongside this skill.

**The rule libraries are two.**
[`solidstats-server-ts-conventions`](../solidstats-server-ts-conventions/SKILL.md) — the
server-2 architecture/HTTP rules, cited as `[conv: …]` — and
[`solidstats-shared-backend-ts-standards`](../solidstats-shared-backend-ts-standards/SKILL.md) —
the shared service standards (naming, the error base, enums, config discipline, external
adapters, async safety, LSP/SOLID/DRY, §Z/§AA/§AB), cited as `[std: …]`. This skill does not
restate the rules; it *enforces* them. Every finding cites the rule it breaks
(`[conv: layers.md → Services]`, `[std: correctness §AA]`) as its objective evidence; the
severity comes from the **Severity reference** table below — the citation identifies *which*
rule, not its severity (the two `correctness-and-quality.md` reference files carry inline
severity tags; the table consolidates them).

Review happens in two phases, in order. Do not skip or reorder.

---

## Phase 1 — API-contract gate (blocking)

This is the SolidStats adaptation of a spec gate. There is **no separate spec repo**: server-2's
Fastify route schemas are **zod** schemas (validated and typed via `fastify-type-provider-zod`),
`@fastify/swagger` generates the OpenAPI document *from* them, and `web` consumes that document via
`openapi-typescript`. So the route schemas **are** the contract, and the gate verifies the change
keeps that contract complete and compatible.

For every public route the change adds or touches:

- **Request and response schemas are declared** (zod). Each of `body` / `params` / `querystring`
  and every `response[status]` is a zod schema variable, so the handler is fully typed. A missing or
  partial response schema means the generated OpenAPI — and therefore `web`'s generated client — is
  incomplete or wrong. Missing schema on a public route → gate failure.
- **Shared schemas are registered for $ref dedup.** A schema reused across routes/responses should be
  registered once (`z.globalRegistry.add(Schema, { id: 'Schema' })`) so `jsonSchemaTransformObject`
  emits a single `#/components/schemas/Schema` with `$ref` usages. Routes still pass the real schema
  variable, so handler inference is preserved — dedup and typing are decoupled, there is no
  inline-vs-`$ref` tradeoff. A shared schema duplicated inline across the OpenAPI output instead of
  registered is a finding (not a BLOCK).
- **Breaking shape changes are flagged against `web`.** A removed/renamed field, a narrowed type, a
  changed status code, or a changed path/method on an existing public endpoint breaks the generated
  client. It is acceptable only if it is backward-compatible **or** the adjacent `web` app is updated
  in lockstep (per the cross-app rule in AGENTS.md). An unflagged breaking change to a public
  contract, with no justification, is a **BLOCK**.
- **The OpenAPI artifact is regenerated** when the API shape changed (server-2 exposes an export,
  e.g. under `src/openapi/`). If the change alters the contract but doesn't refresh the artifact, note it.

Render the gate result at the top of the report, above the severity buckets:

```
## API contract
✅ All touched routes declare request+response schemas; no breaking change to the web client.
⚠️ Shape changed (field `x` removed) — backward-compatible / web updated in <ref> — verified.
❌ Public route `POST /appeals` has no response schema → generated client incomplete → BLOCK
```

A failing gate is a **BLOCK**, in addition to the standard "any 🔴 → BLOCK" rule.

---

## Phase 2 — Convention & design/correctness sweep

Read every changed file in full (per review-standards scope), then sweep the change against
`solidstats-server-ts-conventions` (`[conv: …]`) and `solidstats-shared-backend-ts-standards`
(`[std: …]`). Work in **risk order** — this is where the standard's "risk first" ordering becomes
concrete for the backend:

1. **Security** — IDOR / missing ownership check, mass assignment, server-side authz, secrets.
   `[conv: correctness → Security depth; correctness → Security & runtime hardening]`
2. **Correctness** — blocking I/O in async, N+1, floating promises, LSP/contract breaks,
   transaction boundaries. `[std: correctness → Async safety / Contract compliance (LSP);
   conv: layers → Usecases]`
3. **Architecture & layers** — downward-only deps, no layer reaching past the one below, cross-module
   only via the service contract (the importing module reaches a peer through its `index.ts`, never a
   deep path), no upward import, correct module placement. **These boundary rules are enforced
   mechanically by the `.dependency-cruiser.cjs` preset** — a wrong-layer dependency, a cross-module
   import that bypasses `index.ts`, and an upward import are all caught by `depcruise` in CI, so a
   reported violation is a hard gate (treat it like a failing Phase 1 gate, not a judgement call).
   Spend your own attention on what the tool can't judge: **semantic placement** — is this logic in
   the *right* layer at all (a guard living in the controller, a query inferred in the usecase, a
   `.parse()` map done in the repository), and is a layer earning its existence. A **pass-through
   layer** — a usecase or service that only forwards to the layer below with no added
   logic/orchestration/transaction — is a 🟡: collapse it (call the next layer directly).
   `[conv: SKILL §A; layers.md]`
   - **Dependency injection** — dependencies are reached via `app.getDecorator<Contract>(name)`
     (fail-fast: an unregistered/mis-typed decorator throws at resolution). Flag the old pattern: a
     new `declare module 'fastify'` interface augmentation, or untyped property access on the app
     (`app.appealUsecase` / `app.<name>` instead of `app.getDecorator<AppealUsecase>('appealUsecase')`),
     is a finding — it loses the fail-fast check and re-introduces ambient typing. Everything is still
     reached through the **contract** type, never a concrete factory. `[conv: layers → DI]`
4. **Error system** — typed `AppError` only, domain vs external taxonomy, semantic HTTP status.
   `[std: SKILL §B; std: correctness → External adapters; conv: schemas-and-data → Error system]`
5. **Schema discipline** — request+response zod, bound string/array/number fields, `.strict()` on
   request objects, domain rules in the service not the schema. `[conv: schemas-and-data → zod schemas;
   correctness → Schema quality]`
6. **Data access** — Kysely only in repositories, parameterized, shared pagination, tx threading,
   `Selectable`/`Insertable`/`Updateable` row types. `[conv: layers → Repositories;
   schemas-and-data → Kysely / Transactions]`
7. **Observability & diagnosability** — structured logs, levels, state-transition logging, PII,
   swallowed errors, traceback, identifying context, upstream detail. `[std: correctness §Z/§AA;
   conv: correctness → Observability surface]`
8. **Resource lifecycle** — unbounded memory/DB-row/file growth (the three legs).
   `[std: correctness §AB]`
9. **SOLID / DRY** — function length, dependency count, OCP dispatch maps, rule of three.
   `[std: correctness → SOLID — function/factory level / DRY — rule of three]`
10. **Quality & style** — naming, code-quality bugs, comments, imports/lint. `[std: SKILL §A;
    std: correctness → Code-quality bugs / Comments & docs / Imports & lint]`

Queue-consumer changes additionally sweep `[conv: correctness → Queue reliability]` (per-consumer
prefetch, DLX, nack-vs-reject, idempotent consumers) under topic 2.

Each finding lands in exactly one severity bucket (from review-standards), carries a `[topic]` tag,
and cites the `[conv: …]` / `[std: …]` section it breaks. Take the severity from the **Severity
reference** table below (where either `correctness-and-quality.md` tags a rule, the table matches
it). Group identical 🟡/🔵 findings; never drop a 🔴/🟠.

---

## Severity reference

Consolidated so the verdict is mechanical (derived from the conventions + standards tags — update
this table when either source changes). Topics can appear at any severity — this lists the
*typical* mapping; classify by actual impact.

| Finding | Severity |
|---------|----------|
| IDOR — no ownership/permission check | 🔴 BLOCK |
| Blocking I/O on an async path | 🟠 (🔴 if it stalls a hot/shared path) |
| LSP / contract break that breaks callers | 🔴 |
| Breaking public API-contract change, unflagged (Phase 1) | 🔴 BLOCK |
| N+1 query (await in a loop) | 🟠 |
| Mass assignment (privileged field in a request schema) | 🟠 |
| Domain/external error taxonomy conflated | 🟠 |
| Queue consumer discipline (manual ack, per-consumer prefetch, DLX, nack-vs-reject, idempotency) | 🟠 |
| Swallowed error (silent catch, no log + no re-throw) | 🟠 |
| Unbounded growth — memory / DB rows / files | 🟠 (🔴 fast leak on hot path) |
| Wrong layer / cross-module import not via `index.ts` / upward import (`.dependency-cruiser.cjs` violation) | 🟠 hard gate (🔴 if it breaks a public contract) |
| Logic in the wrong layer semantically (guard in controller, query in usecase, `.parse()` in repository) | 🟠 |
| Pass-through layer — usecase/service that only forwards, no added logic | 🟡 (collapse it) |
| DI via `declare module 'fastify'` augmentation or untyped `app.<name>` access (not `app.getDecorator<Contract>(name)`) | 🟡 |
| SOLID threshold (fn >40 lines, >5 deps, OCP >3 branches) | 🟡 |
| DRY — rule of three | 🟡 |
| Missing schema field bounds (`.max()` / `.int().min().max()` / `.strict()`) | 🟡 |
| Shared schema duplicated inline instead of registered for `$ref` dedup | 🟡 |
| Log-level misuse / missing state-transition log / PII | 🟡 |
| Lost traceback / missing error context / upstream not logged | 🟡 |
| Happy-path inflection point unlogged | 🔵 |
| Naming, style, comments, import order | 🔵 |

---

## Output

Follow the output format, continuous numbering, severity buckets, and verdict rules from
`solidstats-shared-review-standards` (§D–§E). Open the report with the **API contract** gate result
(above the buckets); there is no "Good" section. Cite the broken rule (`[conv: …]` / `[std: …]`) on
each finding as the optional convention reference. The test-file rule (test quality is never a standalone BLOCK unless a
test actively masks a real bug) lives in review-standards §F and applies unchanged; defer detailed
test-quality judgement to [`solidstats-server-ts-tests`](../solidstats-server-ts-tests/SKILL.md).
