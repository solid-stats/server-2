---
name: request-pagination-params
title: Pagination uses limit and offset query parameters
category: request
kind: core
severity_when_violated: HIGH
applies_to:
  - any endpoint that returns a paginated collection
related:
  - response-pagination-envelope
  - request-sort-by-and-dir
  - request-optional-list-default
source:
  - core-conventions.md
  - empirical
---

# Pagination uses `limit` and `offset` query parameters

## Rule

For endpoint pagination use the query parameters `limit` (maximum number of items in the response) and `offset` (how many items to skip). Do not use `page`, `pageSize`, `cursor`, `nextPage` or other alternative names. Both parameters are not required and carry a business default via `schema.default` (typical values are `limit: 20` or `50`, `offset: 0`).

## When it applies

- The endpoint returns a collection with pagination support (response shaped as `{ data, limit, offset, total }`).
- `parameters` contains `name: limit` or `$ref: '#/components/parameters/Limit'`.
- The method description mentions a list, filtering, or sorting of a collection.

## How to detect a violation

- Find the `limit`/`offset` pair in `parameters`, or `$ref: '#/components/parameters/Limit'` and `$ref: '#/components/parameters/Offset'`.
- Both are `in: query`, both not required, `schema.type: integer`, both have a `default` (`offset` is usually `0`).
- The type is strictly `integer` — not a string, not a null variant.
- Red flags: names `page`, `pageSize`, `cursor`, `pageNumber`, `perPage`, `take`, `skip`; missing `default`; `type: string`; query parameters declared but the response has no matching `{ data, limit, offset, total }` envelope.

## Severity and risk

HIGH: `limit`/`offset` are a fixed global contract. Any alternative (`page`/`pageSize`/`cursor`) breaks reusable client pagination layers and forces adapters on the frontend. A mismatch between the request side and the response envelope (see [[response-pagination-envelope]]) makes the contract inconsistent.

## Good example

```yaml
parameters:
  - name: limit
    in: query
    schema: { type: integer, default: 20 }
  - name: offset
    in: query
    schema: { type: integer, default: 0 }
```

## Anti-example

```yaml
parameters:
  - name: page
    in: query
    schema:
      type: integer
      default: 1
  - name: pageSize
    in: query
    schema:
      type: integer
      default: 20
```

Fix: rename `page` → `offset` (skip semantics, `default: 0`), `pageSize` → `limit` (`default: 20`), or extract both into `components/parameters/Limit` and `components/parameters/Offset`; align the response envelope so it returns the same `limit`/`offset`, not `page`/`pageSize`.

## Related patterns

- [[response-pagination-envelope]] — request parameters must match the response envelope.
- [[request-sort-by-and-dir]] — sorting usually lives in the same group of query parameters.
- [[request-optional-list-default]] — other optional query parameters with defaults have their own rules.

## Reviewer notes

- The business default for `limit` varies per endpoint (20, 50). That is fine — what matters is that it exists and matches the UI.
- If an endpoint returns a fixed short list without pagination (e.g. the last N items), `limit`/`offset` are unnecessary and the `{ data, limit, offset, total }` envelope does not apply.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/011_playlists_api/01_songs_playlists.yaml` — shared `components/parameters/Limit` (`default: 20`) and `components/parameters/Offset` (`default: 0`) used via `$ref` across the playlists and karaoke-queue list endpoints
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `$ref: '#/components/parameters/Limit'` and `$ref: '#/components/parameters/Offset'` referenced at the end of the parameter list on every paginated endpoint
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml` — `limit` and `offset` alongside date-range and status filters on `GET /api/v1/events/users/{userId}`
