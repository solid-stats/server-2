---
name: schema-anyof-oneof-for-polymorphism
title: anyOf and oneOf for polymorphism instead of an enum switch
category: schema
kind: core
severity_when_violated: MEDIUM
applies_to:
  - a response/request value that may be one of several object shapes
  - cards whose field set differs per author kind
  - items with several subtypes sharing a discriminator
related:
  - schema-const-vs-enum-of-one
  - schema-ref-and-lsp
source:
  - core-conventions.md
  - empirical
---

# `anyOf` / `oneOf` for polymorphism

## Rule

When a value may be one of several object shapes, use `oneOf` (mutually exclusive variants) or `anyOf` (variants may overlap). Do not model polymorphism with a single field carrying an `enum` plus a bag of optional fields for each variant.

For a discriminated union, always describe a `discriminator` with `propertyName` and `mapping`, and in each variant use `const` (see [[schema-const-vs-enum-of-one]]) for the discriminator field.

## When it applies

- `ResourceAuthor` = `Student | Teacher` with different field sets.
- `LessonContentItem` = `exercise | videoLesson | comment`.
- A nullable `$ref`: use `anyOf: [ { $ref: ... }, { type: 'null' } ]`.

## How to detect a violation

- Find union schemas (`oneOf:`); confirm a `discriminator` is present when the variants are distinguishable by a property.
- In each variant the discriminator field must be `const`, not `enum: [single]`.
- Every variant in `mapping` must appear in the `oneOf` list and vice versa.
- Reusing the same tag/type for two different variants is a mapping error.

## Severity and risk

MEDIUM: modeling polymorphism as a flat schema with optional fields produces a loose contract where it is impossible to say which fields are required in each variant. Code generation loses sealed-union types, and validators let invalid combinations through.

## Good example

```yaml
ResourceAuthor:
  oneOf:
    - $ref: '#/components/schemas/ResourceStudentAuthor'
    - $ref: '#/components/schemas/ResourceTeacherAuthor'
  discriminator:
    propertyName: role
    mapping:
      student: '#/components/schemas/ResourceStudentAuthor'
      teacher: '#/components/schemas/ResourceTeacherAuthor'
```

## Anti-example

```yaml
ResourceAuthor:
  type: object
  required: [role]
  properties:
    role: { type: string, enum: [student, teacher] }
    averageRating: { type: number }
    voiceTimbreType: { $ref: '#/components/schemas/VoiceTimbreType' }
```

Fix: split into `ResourceStudentAuthor` and `ResourceTeacherAuthor`, join via `oneOf` + `discriminator`. Each variant gets its own `required` list (e.g. `averageRating` required only for the teacher).

## Related patterns

- [[schema-const-vs-enum-of-one]] — the discriminator value on a variant is always `const`.
- [[schema-ref-and-lsp]] — variant extensions must be LSP-compatible with the base, if there is one.

## Reviewer notes

- Do not confuse `oneOf` and `anyOf`: use `anyOf` when shapes may overlap (e.g. a nullable `$ref`) and `oneOf` for strictly one variant. Most discriminated unions are `oneOf`.
- When the discriminator does not yet have all target values, keep `mapping` minimal and mention the future variant in the `description`.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — `StudioResult` schema (lines 490–498) uses `oneOf` with a `discriminator` (`propertyName: type`, mapping `lesson`) and mentions future `exercise` variant in the description; `LessonContentItem` (lines 901–970) has three concrete variants with `const` discriminators.
- `changes/020_resource_owned_content_studio/01_01_resources_studio_results.yaml` — `StudioResult` (lines 231–239) mirrors the same `oneOf` + `discriminator` pattern for the save-result endpoint.
- `changes/004_user_profile_v3/01_mainBackend_get_profiles.yaml` — profile response uses `oneOf` with `discriminator` (lines 69–74) to model two distinct profile shapes.
