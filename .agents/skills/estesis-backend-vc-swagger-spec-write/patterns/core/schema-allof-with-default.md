---
name: schema-allof-with-default
title: allOf wrapper around $ref for a query enum with a default
category: schema
kind: core
severity_when_violated: HIGH
applies_to:
  - query parameters whose `$ref` points at a string enum and that have a `default`
  - other places that need `$ref` plus a sibling default/description
related:
  - schema-openapi-310
  - schema-ref-and-lsp
source:
  - core-conventions.md
  - empirical
---

# `allOf` wrapper around `$ref` for a query enum with a `default`

## Rule

If a query parameter references a schema via `$ref` and you need a `default`, wrap the `$ref` in `allOf`. JSON Schema forbids sibling keys next to `$ref`; Swagger UI and most parsers emit `Property $ref is not allowed` when you place `$ref` and `default` side by side.

## When it applies

- A query parameter for `sortBy` / `sortDir` / any enum with a default.
- A schema property that needs a `default` next to a `$ref` to another schema.
- Any case that needs `$ref` plus sibling keys (`description`, `default`, `example`).

## How to detect a violation

- For every `default:` under a `schema:`, confirm it sits next to a `type:` or is wrapped in `allOf` next to the `$ref`.
- Anti-pattern: a `$ref` and `default` as direct siblings under `schema:`.

## Severity and risk

HIGH: Swagger UI and many parsers (swagger-parser, openapi-typescript, several code generators) treat such a schema as invalid and fail to load it. The `default` is silently ignored, which changes the client's actual behavior.

## Good example

```yaml
- name: sortBy
  in: query
  schema:
    default: createdAt
    allOf:
      - $ref: '#/components/schemas/ResourceSortBy'
```

## Anti-example

```yaml
- name: sortBy
  in: query
  schema:
    $ref: '#/components/schemas/ResourceSortBy'
    default: createdAt
```

Fix: move `default` out of the `$ref` sibling position and wrap the `$ref` in `allOf`, as in the good example.

## Related patterns

- [[schema-openapi-310]] — the general requirement for the 3.1.0 style.
- [[schema-ref-and-lsp]] — correct inheritance via `allOf`.

## Reviewer notes

- The `allOf` wrapper here is not an LSP extension; it is just a way around the sibling-key prohibition. Do not confuse it with a real extension where `allOf` adds new `properties`.
- When the enum has only one or two values, an inline copy of the enum is also acceptable, but `allOf` + `$ref` reuses a shared schema better.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — `sortBy` and `sortDir` query parameters (lines 36–49) each use `default: purchasedAt` / `default: desc` wrapped in `allOf: [ $ref: ... ]`, the canonical form of this pattern.
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `sortBy` and `sortDir` parameters (lines 212–221 and 349–358) show the same `default` + `allOf` + `$ref` structure for lesson library sort params.
