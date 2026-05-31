---
name: schema-const-vs-enum-of-one
title: const instead of an enum of one element
category: schema
kind: core
severity_when_violated: MEDIUM
applies_to:
  - schema properties that allow exactly one value
  - discriminator fields of union types with a fixed value per variant
related:
  - schema-anyof-oneof-for-polymorphism
  - schema-openapi-310
  - naming-enum-value-style
source:
  - core-conventions.md
  - empirical
---

# `const` instead of an `enum` of one element

## Rule

If a schema property allows exactly one literal value, use `const`, not an `enum` with a single element. JSON Schema 2020-12 supports `const` natively, and it conveys the intent "this value only" more precisely.

## When it applies

- A discriminator field on a union variant (`type: 'lesson'` in `LessonStudioResult`).
- A type or role fixed for a specific schema (`role: student` in `ResourceStudentAuthor`).
- Any schema denoting a literal kind/marker.

## How to detect a violation

- Find every `enum:` with a single value (`enum: [singleValue]` or a one-item list) — a violation in a 3.1.0 spec.
- In models with `oneOf` + `discriminator`, each variant's discriminator field must be `const`, not `enum: [variant]`.

## Severity and risk

MEDIUM: `enum: [x]` works but describes the contract less clearly and renders poorly in Swagger UI / generated clients (the type becomes an `Enum` rather than a literal). Code generation for discriminated unions handles `const` literals more reliably than single-value `enum`.

## Good example

```yaml
role:
  type: string
  const: student
```

## Anti-example

```yaml
role:
  type: string
  enum: [student]
```

Fix: replace `enum: [student]` with `const: student`.

## Related patterns

- [[schema-anyof-oneof-for-polymorphism]] — discriminator constants are used precisely in union variants.
- [[schema-openapi-310]] — `const` only appears in the newer version.
- [[naming-enum-value-style]] — even single-value `const` follows the camelCase naming rules.

## Reviewer notes

- If the discriminator already declares `propertyName`, still inspect each union variant: the mapping dictionary does not waive the requirement on the variant schema itself.
- For several values (e.g. `easy/medium/hard`), `enum` remains the correct choice. The rule fires only at exactly one value.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — discriminator fields across multiple union variants use `const`: `const: lesson` (lines 459, 520), `const: exercise` (line 927), `const: videoLesson` (line 954), `const: student` (line 1338), `const: teacher` (line 1373).
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — `ResourceAuthor` variants (lines 1085, 1143, 1177) use `const: video`, `const: student`, `const: teacher` as discriminator literals.
