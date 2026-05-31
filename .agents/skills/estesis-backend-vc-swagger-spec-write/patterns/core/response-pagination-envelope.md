---
name: response-pagination-envelope
title: Pagination returns a { data, limit, offset, total } envelope
category: response
kind: core
severity_when_violated: HIGH
applies_to:
  - any endpoint that returns a collection under limit/offset pagination
related:
  - request-pagination-params
  - response-status-200-vs-201
  - response-list-shape
source:
  - core-conventions.md
---

# Pagination returns a `{ data, limit, offset, total }` envelope

## Rule

Any endpoint that accepts `limit`/`offset` returns an object with exactly four required fields: `data` (array), `limit` (integer), `offset` (integer), `total` (integer). Never return a bare array, never move pagination into headers, never rename the fields (`items`, `pageSize`, `count`, `nextCursor`, `hasMore`).

## When it applies

- The endpoint declares `limit` and `offset` query parameters.
- The response schema represents a collection.
- The description mentions filtering or sorting a list.

Text trigger: `limit:` and `offset:` present together with an array under `data:`.

## How to detect a violation

- Open the `200` response schema. It must be `type: object` with `required: [data, limit, offset, total]`.
- `data` is `type: array` with `items: { $ref: ... }`; `limit`, `offset`, `total` are all `type: integer` (not strings, not nullable).
- Red flags: missing `total`; `data` is not an array; presence of `page`/`pageSize`/`nextCursor`/`hasMore`/`count`; the whole envelope missing (endpoint returns an array directly under `application/json`).

## Severity and risk

HIGH: the pagination contract is a shared client layer. Any deviation (missing `total`, renamed `data`, flat array) breaks reusable list UI, forces client workarounds, and doubles testing.

## Good example

```yaml
GetItemsResponse:
  type: object
  required: [data, limit, offset, total]
  properties:
    data:
      type: array
      items: { $ref: '#/components/schemas/Item' }
    limit: { type: integer }
    offset: { type: integer }
    total: { type: integer }
```

## Anti-example

```yaml
GetItemsResponse:
  type: object
  required: [items, page, pageSize]
  properties:
    items:
      type: array
      items: { $ref: '#/components/schemas/Item' }
    page: { type: integer }
    pageSize: { type: integer }
    hasMore: { type: boolean }
```

Fix: rename `items` → `data`, `page` → `offset`, `pageSize` → `limit`, add `total: { type: integer }`, drop `hasMore`; `required` is all four fields.

## Related patterns

- [[request-pagination-params]] — the matching `limit`/`offset` query parameters.
- [[response-status-200-vs-201]] — the envelope is returned under `200`.
- [[response-list-shape]] — non-paginated collections use a different shape.

## Reviewer notes

- `total` is required even when it is expensive to compute; the contract stays uniform.
- `offset` past `total` returns the same object with `data: []`, not a 404.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/011_playlists_api/01_songs_playlists.yaml` — `GetPlaylistsResponse` and `GetPlaylistSongsResponse` both declare `required: [data, limit, offset, total]` with `data: { type: array }` and three integer fields, the canonical envelope shape
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `GetLibraryLessonsResponse` follows the same four-field envelope on the library lessons list endpoint
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml` — `GetCalendarEventsResponse` uses `required: [data, limit, offset, total]` alongside the `startAt`/`endAt` date-range filters
