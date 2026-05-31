---
name: request-optional-list-default
title: Optional list query parameters default to [] meaning "empty == all"
category: request
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any array query parameter that filters by multiple values
related:
  - request-optional-non-list-null
  - request-pagination-params
source:
  - core-conventions.md
  - empirical
---

# Optional list query parameters default to `[]` meaning "empty == all"

## Rule

An optional list query parameter must have `schema.type: array` and `default: []`. In the parameter `description`, state explicitly that an empty list means all items and the filter is not applied. Do not use `nullable: true`, `default: null`, or the alternative form "omit the parameter to disable the filter".

## When it applies

- The endpoint accepts a query filter over multiple values of one domain (`statuses`, `categories`, `difficulty`, `licenseType`, `resourceTypes`, etc.).
- Semantics: the user may pass nothing (equals "all"), or pass one or more values.

## How to detect a violation

- The parameter has `schema.type: array`, `default: []`, `items: { $ref: ... }` or `items: { type: integer }`.
- The parameter `description` contains a phrase like "empty list means all items, the filter is not applied".
- Red flags: `nullable: true` on an array; `default: null`; `anyOf: [array, null]`; `required: true` for a filtering list; no note about "empty == all" in the `description`.

## Severity and risk

MEDIUM: a mismatch in default semantics leads to one client sending an empty list as "return nothing" and another as "all". Without an explicit note in the `description`, a developer may implement an empty-array rejection and return `400`. The contract is implicit — each endpoint documents/fixes it differently.

## Good example

```yaml
- name: statuses
  in: query
  description: |
    Filter the list by status. An empty list means all statuses; the filter is not applied.
  schema:
    type: array
    default: []
    items:
      $ref: '#/components/schemas/Status'
```

## Anti-example

```yaml
- name: statuses
  in: query
  description: Filter list by status.
  schema:
    type: array
    nullable: true
    default: null
    items:
      $ref: '#/components/schemas/Status'
```

Fix: remove `nullable: true`, replace `default: null` with `default: []`, and add to the `description`: "An empty list means all statuses; the filter is not applied."

## Related patterns

- [[request-optional-non-list-null]] — non-list optional parameters use `anyOf` with `{ type: 'null' }` and `default: null` (different semantics).
- [[request-pagination-params]] — filters usually sit next to `limit`/`offset`.

## Reviewer notes

- Exception: if a list has explicit business semantics of "empty != all" (e.g. an empty list of programs means a "no programs" mode), state it explicitly in the `description`.
- A non-empty array default (e.g. `default: [accepted]`) is acceptable for status filters that have a business default.
- Do not use `style: form` / `explode: false` without an explicit reason — leave the OpenAPI default.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `category` and `difficulty` query parameters both use `type: array`, `default: []`, and descriptions that read "Empty list means all items … and no filter is applied"
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml` — same pattern for `category` and `difficulty` on the exercises shop/library list endpoint
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml` — `dataIds` and `statuses` query parameters on `GET /api/v1/events/users/{userId}` follow the same `default: []` + "пустой список означает все" convention
