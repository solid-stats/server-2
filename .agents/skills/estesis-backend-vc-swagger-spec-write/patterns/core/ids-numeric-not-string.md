---
name: ids-numeric-not-string
title: All ids are numeric, not strings
category: ids
kind: core
severity_when_violated: HIGH
applies_to:
  - schema properties named `id` or with an `*Id` / `*ID` suffix
  - path parameters `/{id}` and `/{...Id}`
  - request and response fields that reference an entity
related:
  - naming-camelcase-fields
  - schema-anyof-nullability
source:
  - core-conventions.md
  - empirical
---

# All ids are numeric, not strings

## Rule

All ids must be numbers, not strings. Use `type: integer` (optionally `format: int64`). Never describe an id as `type: string`, even if the backend serializes a large number as a string for precision — the spec must stay `integer`.

## When it applies

- Any schema property named `id`.
- Any schema property with an `Id` / `ID` suffix (`programId`, `resourceId`, `sourceId`, `userId`, etc.).
- Path parameters named `id` or `*Id` (`/{id}`, `/{programId}`).

## How to detect a violation

- For each `id:` field (exact match or `*Id:`), the schema below it must be `type: integer`.
- Path parameters: the schema inside the `{id}` parameter is `type: integer` too.
- Nullable id: `anyOf: [{ type: integer }, { type: 'null' }]`, not `{ type: string }`.
- Red flag: `type: string` with `format: uuid` on an id field.

## Severity and risk

HIGH: a string id breaks arithmetic and comparison, hampers database indexing, and conflicts with generated typed clients (Java/Kotlin/TypeScript). Keeping ids numeric across the spec prevents type mismatches between services.

## Good example

```yaml
properties:
  id:
    type: integer
    format: int64
  sourceId:
    type: integer
    format: int64
```

## Anti-example

```yaml
properties:
  id:
    type: string
    format: uuid
  sourceId:
    type: string
```

Fix: rewrite as `type: integer` (optionally `format: int64`). If the business genuinely requires a UUID, that must be an explicit, documented decision recorded in the shared context with a justification.

## Related patterns

- [[naming-camelcase-fields]] — the `Id` suffix is camelCase.
- [[schema-anyof-nullability]] — a nullable id via `anyOf` with `type: integer`.

## Reviewer notes

- `format: int64` is appropriate for ids whose values may exceed 32 bits (usually a safe default).
- Fields like `videoPath`, `imageUrl` are URLs/paths, not ids. They are strings and fall outside this rule.
- A `*Token` or `*Hash` field is not an id and may be a string; this rule applies only to entity identifiers.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/013_label_public_songs/01_musicLabels_license_rules.yaml` — path parameters `labelId` and `licenseId` both declare `schema: { type: integer }`, and the `LicenseId` parameter comment explicitly notes that both entity ids and local draft ids are integers, not strings.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — all schema properties (`id`, `userId`, `sourceId`) and the `SourceResourceId` path parameter use `type: integer`, consistently across list and detail response shapes.
- `changes/002_appeals_api/01_appeals_api.yaml` — `id`, `authorId`, and the pagination `limit`/`offset` parameters all carry `type: integer`; no string-typed id fields appear even for service-boundary ids passed between microservices.
