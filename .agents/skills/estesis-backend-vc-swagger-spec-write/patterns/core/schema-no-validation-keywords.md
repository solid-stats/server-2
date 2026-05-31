---
name: schema-no-validation-keywords
title: No field validation keywords in the schema
category: schema
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any spec
  - all schema properties and parameters
related:
  - schema-description-on-property
  - request-multipart-flat-fields
source:
  - core-conventions.md
  - empirical
---

# No field validation keywords in the schema

## Rule

Do not add field validation to the schema. The keywords `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `multipleOf`, `minItems`, `maxItems`, `uniqueItems` in schema properties are a violation. Describe business constraints in the `description` of the relevant field, parameter, or response status.

Exception: `format` (e.g. `date-time`, `float`, `int64`, `binary`) and the type shape itself (`type: integer`, `type: string`) are not "validation" in this context.

## When it applies

- Any schema where the author tries to pin a string length, a regex, or a numeric range.
- Query parameters attempting to bound `limit`/`offset`.
- File upload fields where the author wants to pin MIME type / extension.

## How to detect a violation

- Search for `minLength`, `maxLength`, `pattern:`, `minimum:`, `maximum:`, `multipleOf`, `minItems`, `maxItems`, `uniqueItems` — any match is a violation.
- In the field `description`, check whether practical constraints are stated as prose ("at most two program ids", "length 1..255 chars") — that is acceptable and preferred.

## Severity and risk

MEDIUM: schemas turn into a half-validator where the backend cannot tell which constraints to enforce (schema vs domain layer). This creates a gap between the OpenAPI model and the actual validation. Keeping constraints in one place — the business layer — avoids that split.

## Good example

```yaml
visibleProgramIds:
  type: array
  description: Up to 2 program ids may be passed. An over-limit request returns `400`.
  items:
    type: integer
```

## Anti-example

```yaml
visibleProgramIds:
  type: array
  maxItems: 2
  items:
    type: integer
    minimum: 1
```

Fix: drop `maxItems` and `minimum`. State "Up to 2 program ids may be passed" in the parameter description, and the over-limit scenario in the `400` response description.

## Related patterns

- [[schema-description-on-property]] — put constraints in the description, not as schema keywords.
- [[request-multipart-flat-fields]] — for multipart, a similar constraint on field composition is described separately.

## Reviewer notes

- Not validation: `format: date-time`, `format: float`, `format: int64`, `format: binary`. These indicate the value type, not a constraint.
- The temptation to add `minLength: 1` for a required string is common. Don't — required-ness is governed by `required`, and empty/whitespace strings are described in the field `description` or a `400` status.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/017_programs_resources/01_resources_programs_create_delete.yaml` — `scheduledLessons` array property (line 325) states "One day can contain at most one lesson" in the `description` with no `maxItems` or `uniqueItems` in the schema.
- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — `voiceTimbreTypes` property description (lines 39–44) states "The array can be empty when a note range exists but does not fully cover any supported timbre" — business rules in prose, no `minItems`/`maxItems` keywords.
