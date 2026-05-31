---
name: schema-openapi-310
title: OpenAPI 3.1.0 and JSON Schema 2020-12 for new specs
category: schema
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any new spec
  - new specs in an existing context that has explicitly moved to 3.1.0
related:
  - schema-anyof-nullability
  - schema-no-nullable-true
  - schema-allof-with-default
  - schema-const-vs-enum-of-one
source:
  - core-conventions.md
  - empirical
---

# OpenAPI 3.1.0 and JSON Schema 2020-12 for new specs

## Rule

Every new spec must start with `openapi: 3.1.0` and follow the JSON Schema 2020-12 style. This includes:

- nullable via `anyOf` with `{ type: 'null' }`, no `nullable: true`;
- literals via `const`, not an `enum` of one element;
- query enum schemas with a `default` wrapped in `allOf` around the `$ref`;
- no auto-generated OpenAPI 3.0 boilerplate in new files.

Do not rewrite older OpenAPI 3.0 specs purely for the version.

## When it applies

- Any new spec.
- Any new spec in an existing context.
- An edit to an old file when the move is explicitly recorded in the shared context.

## How to detect a violation

- The first line of the spec should be `openapi: 3.1.0`. A `3.0.x` value in a new spec is a violation.
- Confirm the file has no `nullable: true` (see [[schema-no-nullable-true]]).
- Any single-literal property must use `const`, not `enum: [single]` (see [[schema-const-vs-enum-of-one]]).
- A query parameter with a `$ref` to an enum plus a `default` must use an `allOf` wrapper (see [[schema-allof-with-default]]).

## Severity and risk

MEDIUM: the OpenAPI version drives how parsers and code generation interpret the schemas. Using old 3.0 syntax in new files produces fuzzy behavior, especially in JSON Schema-only validators. When the team has explicitly migrated, a version mismatch breaks the uniformity of generated clients.

## Good example

```yaml
openapi: 3.1.0
info:
  title: Resource schedule
  version: 1.0.0
```

## Anti-example

```yaml
openapi: 3.0.3
info:
  title: New shiny endpoint
  version: 1.0.0
components:
  schemas:
    Item:
      type: object
      properties:
        name:
          type: string
          nullable: true
```

Fix: raise the version to `3.1.0` and rewrite `nullable: true` via `anyOf` with `{ type: 'null' }`.

## Related patterns

- [[schema-no-nullable-true]] — the specific rule about nullable.
- [[schema-anyof-nullability]] — the positive form of the same rule.
- [[schema-const-vs-enum-of-one]] — literals via `const`.
- [[schema-allof-with-default]] — the `allOf` wrapper around a `$ref` for a default.

## Reviewer notes

- Specs already pinned to version 3.0 stay as a baseline. If a new spec references such a baseline, do not read that as permission to write new files on 3.0.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — starts with `openapi: 3.1.0`; uses `anyOf` for nullability and `const` for discriminators throughout — the full modern style.
- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — `openapi: 3.1.0` schema-only file; demonstrates all 3.1.0 idioms (no `nullable: true`, proper `anyOf`, no single-value `enum`).
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — `openapi: 3.1.0` lifecycle spec; contrast with `changes/006_video_lessons/01_resources_create_delete.yaml` (`openapi: 3.0.2`) to see the version boundary in practice.
