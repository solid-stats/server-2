# Changelog — solidstats-server-ts-code-review

## 2026-06-13 — Layer/DI conventions: pass-through, getDecorator DI, depcruise gate
- **Pass-through layer is a 🟡.** Phase 2 architecture topic now flags a usecase/service that only
  forwards to the layer below with no added logic/orchestration/transaction — collapse it (call the
  next layer directly). Cites `[conv: SKILL §A]`. Added the matching severity-table row.
- **DI checks updated to `app.getDecorator<Contract>(name)` (fail-fast).** Dependencies are reached
  via `getDecorator`, NOT `app.decoratorName` + `declare module 'fastify'`. A new `declare module
  'fastify'` augmentation, or untyped `app.<name>` access, is now a 🟡 finding (loses the fail-fast
  check, re-introduces ambient typing). Cites `[conv: layers → DI]`. Added the matching severity-table row.
- **Boundary rules are now a mechanical `.dependency-cruiser.cjs` gate.** Wrong-layer dependency,
  cross-module import that bypasses `index.ts`, and upward import are caught by `depcruise` in CI —
  the reviewer treats a reported violation as a hard gate (like a failing Phase 1 gate) and spends its
  own attention on **semantic placement** the tool can't judge (right-layer logic, a layer earning its
  existence). Reworded the Phase 2 architecture bullet and the severity-table layer row accordingly.
- Phase 1 zod API-contract gate and everything else unchanged.

## 2026-06-13 — Phase 1 gate migrated TypeBox → zod
- **API-contract gate (Phase 1) rewritten for zod.** Route schemas are now zod (validated/typed via
  `fastify-type-provider-zod`); `@fastify/swagger` still generates the OpenAPI from them and `web`
  still consumes it via `openapi-typescript`. The gate is unchanged in spirit — every public/touched
  route declares request+response **zod** schemas (`body`/`params`/`querystring` + each
  `response[status]` as a schema variable, so handlers stay fully typed); breaking shape changes are
  flagged against `web`; the artifact is regenerated when the shape changes.
- **Added the $ref-dedup check.** A schema reused across routes should be registered once
  (`z.globalRegistry.add(Schema, { id })`) so `jsonSchemaTransformObject` emits a single
  `#/components/schemas/Schema` while routes pass the real variable — dedup and handler inference are
  decoupled, so there is **no** inline-vs-`$ref` tradeoff. Removed the old TypeBox `Type.Ref`
  inference-loss wording (the reason for the migration, issue #263); a shared schema duplicated
  inline instead of registered is a 🟡 finding, not a BLOCK.
- **Phase 2 + severity table:** TypeBox→zod wording. Schema-discipline topic now reads "request+response
  zod … `.strict()` on request objects"; citation retargeted `[conv: schemas-and-data → Zod]` (was
  `→ TypeBox`). Severity table: bounds row now names `.max()`/`.int().min().max()`/`.strict()`; added a
  row for the shared-schema-not-registered finding. Severity scale and Phase 2 ordering otherwise unchanged.

## 2026-06-13 — server-2 only; two rule libraries (taxonomy V5)
- **Scope narrowed to server-2 only**; the replays-fetcher CLI note in Phase 1 (and the `[HTTP]`
  marker on the gate heading) deleted — the fetcher gets its own reviewer
  (`solidstats-fetcher-ts-code-review`).
- **Rule libraries are now two:** `solidstats-server-ts-conventions` (cited `[conv: …]`) and
  `solidstats-shared-backend-ts-standards` (cited `[std: …]`). Every citation in Phase 2 (and
  the Output section) rewritten to the rule's new home — naming → `[std: SKILL §A]`, error base →
  `[std: SKILL §B]`, async safety/LSP/SOLID/DRY and §Z/§AA/§AB → `[std: correctness → …]`; the
  kept server-2 sections (Security depth/hardening, Queue reliability, Schema quality, Error
  system mapping, layers, Kysely) stay `[conv: …]`. Each target heading verified against the
  standards skill. Added an explicit queue-reliability sweep note for consumer changes.
- **Severity reference table** annotated as derived from the conventions + standards tags —
  update the table when either source changes.

## 2026-06-06 — Analysis fixes (see .planning/SKILLS-ANALYSIS.md)
- Severity now comes from the in-skill Severity reference table (only `correctness-and-quality.md`
  carries inline tags); dropped the "apply the severity the rule is tagged with — don't re-derive"
  instruction that was unsatisfiable for the untagged layer/schema rules.
- Softened the asserted OpenAPI export path to "e.g. `src/openapi/`".

## 2026-06-06 — Initial
- The operational backend reviewer: hard-requires `solidstats-shared-review-standards` (format,
  severity buckets, verdict, scope, noise filter) and enforces `solidstats-server-ts-conventions`
  as its rule library. Does not restate rules — cites them.
- **Phase 1 — API-contract gate (adapted).** estesis checks code against a separate swagger repo;
  SolidStats generates OpenAPI *from* the Fastify route schemas and `web` consumes it via
  `openapi-typescript`, so the gate verifies: every public/touched route declares request+response
  schemas; breaking shape changes are flagged against `web` compatibility (per the AGENTS cross-app
  rule); the OpenAPI artifact is regenerated when the shape changes. Missing schema / unflagged
  breaking change → BLOCK. N/A for the `replays-fetcher` CLI.
- **Phase 2 — convention & design/correctness sweep** in risk order (security → correctness →
  architecture → errors → schemas → data → observability → resource lifecycle → SOLID/DRY →
  quality), each finding citing the `[conv: …]` section and using the severity that rule is tagged
  with in the conventions skill.
- Consolidated severity reference table for a mechanical verdict.
- Output delegates to review-standards (§D–§E), opening with the API-contract gate result; test
  quality deferred to `solidstats-server-ts-tests` + review-standards §F.
