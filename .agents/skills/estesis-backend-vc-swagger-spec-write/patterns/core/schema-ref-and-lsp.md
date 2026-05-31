---
name: schema-ref-and-lsp
title: $ref and the Liskov Substitution Principle when extending schemas
category: schema
kind: core
severity_when_violated: HIGH
applies_to:
  - extended schemas that use `allOf` to add fields to an existing schema
  - '`Short<Entity>` / `Full<Entity>` or `Item` / `ItemDetails` pairs'
related:
  - schema-anyof-oneof-for-polymorphism
  - schema-allof-with-default
  - schema-description-on-property
source:
  - core-conventions.md
  - empirical
---

# `$ref` and the Liskov Substitution Principle when extending schemas

## Rule

When extending a schema via `allOf`, preserve Liskov substitution: the extended schema must stay fully compatible with the base wherever the base is expected. An extension only adds fields and/or fixes discriminator values; it must not weaken or override existing ones.

In the extended schema's `description`, list explicitly which fields the extension adds and where it is used.

## When it applies

- A schema is built as `allOf` with a `$ref` to a base plus a `type: object` block of extra `properties`.
- A pair like `ShortLesson` / `FullLesson`, `ScheduleItem` / `ScheduleItemDetails`.
- A discriminated union whose variants extend a common base.

## How to detect a violation

- Inspect each `allOf`. The extension must NOT:
  - redefine the base `required` so a previously required field becomes optional;
  - change the `type` or narrow an existing field to an incompatible subset;
  - remove fields.
- The extended schema's `description` should say something like "Extends `<Base>` ... Adds `<fieldList>`".
- If the base field is non-nullable but the extension makes it nullable, that is an LSP violation.

## Severity and risk

HIGH: the backend typically implements the extended schema as a subtype of the base DTO. An incompatible extension breaks code generation and causes runtime errors wherever code expects the base contract. Describing the added fields helps the developer not miss them during implementation.

## Good example

```yaml
FullLesson:
  description: Extends `ShortLesson`. Adds `items` and `documents`.
  allOf:
    - $ref: '#/components/schemas/ShortLesson'
    - type: object
      properties:
        items: { type: array, items: { $ref: '#/components/schemas/LessonItem' } }
        documents: { type: array, items: { $ref: '#/components/schemas/Document' } }
```

## Anti-example

```yaml
ScheduleItemDetails:
  allOf:
    - $ref: '#/components/schemas/ScheduleItem'
    - type: object
      properties:
        resource:
          $ref: '#/components/schemas/UnrelatedThing'
```

If the base `ScheduleItem.resource` is a `ShortLesson`, this breaks LSP: substituting `ScheduleItemDetails` where `ScheduleItem` is expected breaks the shape of `resource`. Fix: have the extension reference a schema compatible with the base (a `FullLesson` that extends `ShortLesson`), and add a `description` listing the added fields.

## Related patterns

- [[schema-anyof-oneof-for-polymorphism]] — discriminated unions impose LSP requirements through a different channel.
- [[schema-allof-with-default]] — also uses `allOf`, but not for extension.
- [[schema-description-on-property]] — the extension description lives on the extended schema itself, not somewhere above it.

## Reviewer notes

- It is acceptable for an extension to make a previously optional field required (the extension strengthens the contract on the response side). This is LSP-compatible for responses (covariance) but NOT for requests (it breaks contravariance — a client sending a valid base body may stop matching the extension).
- If the extension is used in both request and response, state that explicitly in the `description`.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml` — `FullExercise` schema (line 521) carries the description "Extends `ShortExercise` with detailed exercise fields … Adds `description`, `playbackPattern`, `baseNotes`, `fragments`, and `documents`." — both the `allOf` structure and the explicit field list are shown.
- `changes/023_music_label_display_drafts/01_musicLabels_label_display_drafts.yaml` — `ApprovedMusicLabel` schema (line 188) says "Extends the shared top-level label fields with `isApproved = true`." and adds only the `isApproved` field, keeping the base contract intact.
