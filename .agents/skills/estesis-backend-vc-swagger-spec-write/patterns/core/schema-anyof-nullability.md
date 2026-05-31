---
name: schema-anyof-nullability
title: 'Nullable values via anyOf with { type: ''null'' }'
category: schema
kind: core
severity_when_violated: HIGH
applies_to:
  - any property or parameter that may be null in OpenAPI 3.1.0 specs
related:
  - schema-no-nullable-true
  - schema-openapi-310
  - request-optional-non-list-null
source:
  - core-conventions.md
---

# Nullable values via `anyOf` with `{ type: 'null' }`

## Rule

Express a nullable value with `anyOf` that includes `{ type: 'null' }`. Do not use `nullable: true` (a 3.0-ism that is not valid JSON Schema 2020-12) and do not rely on `type: [string, 'null']` shorthand when the value is a `$ref` or needs its own subschema.

## When it applies

- A property can legitimately hold `null`.
- A `$ref`-typed value can be absent/null — wrap it: `anyOf: [ { $ref: ... }, { type: 'null' } ]`.

## How to detect a violation

- Search for `nullable: true` — always a violation in a 3.1.0 spec.
- A property documented as "optional/maybe null" in prose but typed as a single non-null type with no `anyOf`.
- A `$ref` that the description says can be null but is not wrapped in `anyOf` with a null branch.

## Severity and risk

HIGH: `nullable: true` is silently ignored by JSON Schema 2020-12 validators, so the contract says a field is non-null while the API returns null — clients break at runtime and generated types are wrong.

## Good example

```yaml
description:
  anyOf:
    - { type: string }
    - { type: 'null' }
parent:
  anyOf:
    - { $ref: '#/components/schemas/Node' }
    - { type: 'null' }
```

## Anti-example

```yaml
description:
  type: string
  nullable: true
```

Fix: replace with `anyOf: [ { type: string }, { type: 'null' } ]`.

## Related patterns

- [[schema-no-nullable-true]] — the direct prohibition on `nullable: true`.
- [[schema-openapi-310]] — why 3.1.0 / JSON Schema 2020-12 changes nullability.
- [[request-optional-non-list-null]] — applying this to optional non-list query parameters.

## Reviewer notes

- Don't add a null branch to optional string/string-enum query parameters unless `null` carries distinct business meaning (see [[request-optional-non-list-null]]).

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — `description`, `imageUrl`, `lastName`, and `musicAudio` properties (lines 83–96, 190–197, 280–285) all use `anyOf: [ { type: string }, { type: 'null' } ]`; `bestSuitedFragment` (lines 126–128) shows the `$ref`-plus-null variant.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — `scheduleItemId` and several optional fields (line 523 area) use `anyOf` with `{ type: 'null' }` next to a `$ref`, demonstrating nullable references.
