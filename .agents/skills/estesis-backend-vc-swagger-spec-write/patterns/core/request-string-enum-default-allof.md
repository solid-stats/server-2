---
name: request-string-enum-default-allof
title: Query enum with default uses an allOf wrapper over $ref
category: request
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any query parameter whose type is a $ref to an enum schema and that needs a default
related:
  - request-sort-by-and-dir
  - schema-anyof-nullability
  - schema-allof-with-default
source:
  - core-conventions.md
  - empirical
---

# Query enum with `default` uses an `allOf` wrapper over `$ref`

## Rule

If a query parameter uses a `$ref` to an enum schema and needs a `default`, wrap the `$ref` in `allOf` and put `default` next to it, not as a sibling of `$ref`. A direct `$ref` with a sibling `default` triggers the Swagger/parser warning `Property $ref is not allowed` under JSON Schema 2020-12.

```yaml
schema:
  default: desc
  allOf:
    - $ref: '#/components/schemas/SortDir'
```

## When it applies

- A query parameter with an enum type defined as a separate schema in `components/schemas/...`.
- New specs (`openapi: 3.1.0`) and edits to a schema block where sibling properties next to `$ref` appear.
- Most often touches `sortBy`, `sortDir`, status filters, resource-type filters.

## How to detect a violation

- Find `parameters` blocks with `schema:` -> `$ref:` and `default:` at the same level. That is a violation.
- The correct form: `schema:` -> `default: <value>` + `allOf: [ { $ref: ... } ]`.
- Red flags: `default` as a sibling of `$ref`; adding `description` or `example` directly next to `$ref` (note that a parameter `description` belongs at the parameter level, not the schema).
- An alternative — leaving `$ref` without a `default` (the business default is then described in the parameter `description` as server behavior) — is acceptable but less preferred.

## Severity and risk

MEDIUM: the contract is preserved, but Swagger UI and parser validators emit warnings. Frontend codegen may generate the enum without the default, causing a mismatch with server behavior. The fix is purely mechanical and does not break compatibility.

## Good example

```yaml
- name: sortDir
  in: query
  schema:
    default: desc
    allOf:
      - $ref: '#/components/schemas/SortDir'
```

## Anti-example

```yaml
- name: sortDir
  in: query
  schema:
    $ref: '#/components/schemas/SortDir'
    default: desc
```

Fix: move `default` out of the `$ref` sibling position and wrap the `$ref` in `allOf`:

```yaml
schema:
  default: desc
  allOf:
    - $ref: '#/components/schemas/SortDir'
```

## Related patterns

- [[request-sort-by-and-dir]] — `sortBy`/`sortDir` almost always need this pattern.
- [[schema-allof-with-default]] — the same wrapping rule for property schemas.
- [[schema-anyof-nullability]] — a parallel pattern using `anyOf` for nullable values; do not confuse it with `allOf`.

## Reviewer notes

- In response schemas a `default` over a `$ref` is rarer, but the same logic applies to property schemas via `allOf` or (for nullable) `anyOf` with `{ type: 'null' }`.
- If a parameter has no `default` and only its type is described via `$ref`, wrapping it in `allOf` is unnecessary.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `sortBy` and `sortDir` both follow the `schema: { default: <value>, allOf: [{ $ref: ... }] }` structure; `default` is at the `schema` level, `$ref` is inside `allOf`
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml` — `sortBy` with `default: startAt` and `sortDir` with `default: asc` each wrapped in `allOf` over their respective `$ref` schemas
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml` — the same `allOf` wrapper pattern applied to `ResourceSortBy` and `SortDir` references with non-trivial defaults (`rating`, `desc`)
