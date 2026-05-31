---
name: request-optional-non-list-null
title: 'Optional non-list parameters use anyOf with { type: ''null'' } and default null'
category: request
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any single (non-list) optional query parameter without a business default
related:
  - request-optional-list-default
  - schema-anyof-nullability
source:
  - core-conventions.md
  - empirical
---

# Optional non-list parameters use `anyOf` with `{ type: 'null' }` and `default: null`

## Rule

For an optional non-list query parameter:

- If it has a business default — set it in `schema.default` (no null variant).
- If the parameter is a string or string enum — do not add a null variant or `default: null`, unless `null` carries distinct business meaning.
- For all other non-lists without a business default — declare `anyOf` with the main type and `{ type: 'null' }`, plus `default: null`. Do not use `nullable: true`.

In the parameter `description`, explain what `null` means (filter not applied, mode disabled, etc.).

## When it applies

- The parameter is not an array, is declared in query, and is not required.
- It is an integer (id filter), boolean (flag), date-time (period boundary), etc.
- Semantics: the user may pass a value or explicitly "not set".

## How to detect a violation

- Find single query parameters with `nullable: true` (must be replaced).
- The correct form: `schema.anyOf: [{ type: <T> }, { type: 'null' }]`, `default: null`.
- If the parameter has a meaningful business default — `null` is redundant; use only `default: <value>`.
- For string query parameters (search, substring filters) avoid the null variant unless you need to distinguish "not passed" from an empty string.
- Red flags: `nullable: true`; a bare `type: <T>` without a `default` for an optional parameter where `null` is meaningful; `default: null` without `anyOf` (the type has no null variant).

## Severity and risk

MEDIUM: without an explicit `{ type: 'null' }` the contract is ambiguous — the client cannot tell whether `null` may be sent explicitly (as a valid value) or only omitted. Frontend codegen breaks on `nullable: true` under JSON Schema 2020-12 (not supported by OpenAPI 3.1). Undocumented `null` semantics lead to different behavior across endpoints.

## Good example

```yaml
- name: authorId
  in: query
  description: If not `null`, filters by `authorId`. `null` means the filter is not applied.
  schema:
    anyOf:
      - type: integer
      - type: 'null'
    default: null
```

## Anti-example

```yaml
- name: authorId
  in: query
  description: Filter by author id.
  schema:
    type: integer
    nullable: true
    default: null
```

Fix: replace `nullable: true` + `default: null` with an `anyOf` that includes `{ type: 'null' }` and keep `default: null`:

```yaml
schema:
  anyOf:
    - type: integer
    - type: 'null'
  default: null
```

## Related patterns

- [[request-optional-list-default]] — lists use `default: []` without a null variant.
- [[schema-anyof-nullability]] — the same nullability rules apply in response/body schemas.

## Reviewer notes

- A `search` parameter is conventionally `type: string` without `null` (absence = search not applied). Exceptions must be justified explicitly in the `description`.
- If a parameter has a business default such as `default: true`, the null variant is unnecessary.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml` — `startAt` and `endAt` query parameters on `GET /api/v1/events/users/{userId}` use `anyOf: [{ type: string, format: date-time }, { type: 'null' }]` with `default: null`
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — several date-range filter parameters repeat the same `anyOf` + `default: null` structure for nullable non-list integer and datetime filters
