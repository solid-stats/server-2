---
name: schema-description-on-property
title: Descriptions live on the specific property
category: schema
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any spec
  - schema properties, query/path parameters, response statuses
related:
  - schema-no-validation-keywords
  - schema-no-default-duplication-in-description
source:
  - core-conventions.md
  - empirical
---

# Descriptions live on the specific property

## Rule

Describe details in the most appropriate place:

- for fields — in the `description` of the specific schema property;
- for query/path parameters — in the parameter `description`;
- for errors and edge cases — in the `description` of the specific response status.

Do not hoist information about specific fields, parameters, or statuses into the description of the whole method or whole file, except when it is genuinely needed as extra shared context.

## When it applies

- Authors write long operation-level descriptions enumerating each field's behavior.
- Edge cases are described in the method description instead of in the response statuses.
- A top-level file `description` carries details of individual resources.

## How to detect a violation

- Open the method description — it must not stand in for individual parameter or status descriptions.
- Every field with non-trivial behavior should have its own `description`.
- Every non-trivial status (`400` with conditions, `403` tied to ownership, `404`) should have its own `description`, not a generic `Error`.

## Severity and risk

MEDIUM: during review and implementation the developer reads context next to the field. If the description sits higher in the file, it is easily lost when copying or when viewing only the relevant fragment. Swagger UI also renders the description next to the property, not duplicated at the top.

## Good example

```yaml
properties:
  resultId:
    description: Id of the completed attempt; null until the lesson is finished.
    anyOf:
      - { type: integer }
      - { type: 'null' }
responses:
  '403': { description: Returned on cross-user access to the schedule. }
```

## Anti-example

```yaml
/resource:
  get:
    description: |
      Returns the resource. `imageUrl` is null when not uploaded. `400` is returned when the request is invalid. `403` is returned for cross-user access.
    responses:
      '400': { description: Error }
      '403': { description: Error }
```

Fix: remove the enumeration from the method description; move each detailed behavior to the matching field and status.

## Related patterns

- [[schema-no-validation-keywords]] — describe constraints in the description, not via schema keywords.
- [[schema-no-default-duplication-in-description]] — don't repeat `default` in the description.

## Reviewer notes

- An operation description may still give shared context: what the endpoint does, its side effects, links to related methods. The prohibition is on duplicating what is already described at the field/status level.
- In `description: |`, start a new paragraph only with a blank line (two line breaks). A single line break is part of one paragraph, not a separate block in the UI.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — properties such as `notesRange`, `voiceTimbreTypes`, `bestSuitedFragment`, and `isPublished` (lines 36–101) each carry their own `description` explaining semantics; the operation description is kept to a high-level summary.
- `changes/020_resource_owned_content_studio/01_01_resources_studio_results.yaml` — every response status has its own `description` (e.g. `403` explains cross-user access, `404` explains what object is missing), and individual fields like `scheduleItemId` carry field-level descriptions rather than hoisting them to the operation level.
