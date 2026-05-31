---
name: request-multipart-flat-fields
title: multipart/form-data carries only flat fields
category: request
kind: core
severity_when_violated: HIGH
applies_to:
  - a multipart/form-data request body in any service except the multipart-exception service
related:
  - schema-anyof-nullability
  - request-optional-list-default
source:
  - core-conventions.md
  - empirical
---

# `multipart/form-data` carries only flat fields

## Rule

For every service except the profile's multipart-exception service, a `multipart/form-data` request body may contain only flat fields of primitive types: `string`, `integer`, `number` (`float`/`double`), `boolean`, `null`, or a file (`type: string`, `format: binary`). Arrays, nested objects, and JSON structures via `$ref` to complex schemas are not allowed in a multipart schema.

If complex data is needed, move it to a separate JSON endpoint, a separate method, or decompose it into flat fields.

## When it applies

- `requestBody.content` contains `multipart/form-data`.
- The service is not the profile's multipart-exception service.
- Sometimes the description explicitly records that complex collections were moved out of multipart into JSON endpoints.

## How to detect a violation

- Open the schema referenced by `multipart/form-data`.
- All properties must be `type: string|integer|number|boolean` or `type: string, format: binary`. An `anyOf` with `{ type: 'null' }` over a primitive is also allowed.
- Red flags:
  - `type: array` in any form (even an array of strings) inside the multipart schema of a non-exception service;
  - a nested `type: object` with its own properties;
  - a `$ref` to a schema that expands into an object/array (not a primitive);
  - `oneOf`/`anyOf` where one variant is an array or object.
- Cross-check: if the method `description` says the create/update body is intentionally JSON because multipart makes an ordered array difficult, multipart must not be used for that operation.
- The multipart-exception service is the only relaxation — arrays inside its multipart bodies are allowed; do not report them as a violation.

## Severity and risk

HIGH: `multipart/form-data` has no universal serialization for arrays and nested objects; backend frameworks resolve this differently (repeated keys, indexed keys, JSON-stringified into a string). Such quirks are hard to fix in the contract, leading to integration bugs.

## Good example

```yaml
requestBody:
  required: true
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          title: { type: string }
          coverImage:
            type: string
            format: binary
```

## Anti-example

```yaml
requestBody:
  required: true
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          title:
            type: string
          items:
            type: array
            items:
              $ref: '#/components/schemas/LessonItem'
          coverImage:
            type: string
            format: binary
```

Fix: split into a JSON endpoint `POST /lessons` with `application/json` for `title`+`items`, and a separate `PATCH /lessons/{id}/cover` with multipart for the cover image.

## Related patterns

- [[schema-anyof-nullability]] — `null` via `anyOf` in multipart is allowed only if the main type is a primitive.
- [[request-optional-list-default]] — list filters are always query parameters; they must not appear in multipart.

## Reviewer notes

- The multipart-exception service is the single exception (arrays such as prices and tag lists may live inside its multipart schema). Do not report it.
- `oneOf` in multipart is allowed only if all variants are primitives or files.
- Encoding hints (`encoding.<field>.contentType`) are fine and do not affect field flatness.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/006_video_lessons/01_resources_create_delete.yaml` — `CreateVideoLessonRequest` and `UpdateVideoLessonRequest` demonstrate flat multipart schemas: only `string`, `number`, `boolean`, and `format: binary` fields; `$ref` to `VideoLessonCategory` and `ResourceDifficulty` is allowed because those schemas expand to string primitives (not objects/arrays)
- `changes/016_lessons_resources/01_resources_lessons_create_delete.yaml` — `PATCH /api/v1/lessons/{id}/cover` uses `SetLessonCoverRequest` (single `format: binary` field) and the `description` explicitly explains why `items` was moved out of multipart into a JSON endpoint
- `changes/016_lessons_resources/01_resources_lessons_create_delete.yaml` — `addLessonDocument` uses `AddLessonDocumentRequest` with a single `documentFile: { type: string, format: binary }` — minimal flat multipart body
