---
name: response-list-shape
title: Non-paginated collections return a named object, not a bare array
category: response
kind: core
severity_when_violated: MEDIUM
applies_to:
  - endpoints returning a collection without limit/offset
  - bulk lookup endpoints (by a list of identifiers)
  - nested lists inside an application structure
related:
  - response-pagination-envelope
  - response-status-200-vs-201
source:
  - core-conventions.md
  - empirical
---

# Non-paginated collections return a named object, not a bare array

## Rule

If an endpoint returns a list but without pagination:
- Do not use the `{ data, limit, offset, total }` envelope — there is no pagination.
- Return an object whose collection field is explicitly named (`scheduleItems`, `missingIds`, `data` for a bulk lookup, etc.), not a bare array at the root of `application/json`. This leaves room to extend the response.
- The object and the collection field must be `required`. For the empty case return an empty array, not `null` or a 404.

## When it applies

- The endpoint accepts a list of input ids and returns their resolution (bulk lookup).
- An operation returns several related entities in one fixed set (e.g. a start operation returns several schedule items).
- The method intentionally returns a logically bounded list and pagination is unnecessary.

## How to detect a violation

- The `'200'` response must be `type: object`. A `type: array` directly at the root is a flag.
- The key name reflects the nature of the list (`scheduleItems`, `missingIds`, `data` for a bulk lookup keyed by id).
- If there are no `limit`/`offset` query parameters, there must be no `total` in the response.
- An empty list is `[]`, not an omitted field and not `null`.

## Severity and risk

MEDIUM: a bare array breaks compatibility the moment a sibling field is added (forcing a breaking change). Applying the pagination envelope without `limit`/`offset` is confusing: the client expects page control that does not exist.

## Good example

```yaml
'200':
  description: Resolved entities and ids that were not found.
  content:
    application/json:
      schema:
        type: object
        required: [data, missingIds]
        properties:
          data:
            type: array
            items: { $ref: '#/components/schemas/Entity' }
          missingIds:
            type: array
            items: { type: integer }
```

## Anti-example

```yaml
'200':
  description: Programs status list
  content:
    application/json:
      schema:
        type: array
        items:
          $ref: '#/components/schemas/CurrentProgramStatus'
```

Fix: wrap it in an object with an explicit field (`data` or a specific name such as `programs`), make the field `required`, and add meta fields (status, summary) now or later as needed.

## Related patterns

- [[response-pagination-envelope]] — if `limit`/`offset` exist, use the full envelope.
- [[response-status-200-vs-201]] — a list is returned with `200`.

## Reviewer notes

If the collection is inherently small (e.g. a user's active programs — a handful of records) and pagination is not required, an object with an explicit key is a fine solution. Do not demand `limit`/`offset` for the sake of formality.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — `StartProgramResponse` wraps the created schedule items in a named `scheduleItems` array field alongside `programStatus`, not in a bare array or a paginated envelope
- `changes/008_karaoke_queue/01_songs_membership.yaml` — `LeaveKaraokeQueueResponse` returns `{ queueId, queueDeleted }` as a named object rather than a bare array or a plain boolean
