---
name: request-sort-by-and-dir
title: Sorting uses sortBy and sortDir
category: request
kind: core
severity_when_violated: HIGH
applies_to:
  - any list endpoint with sorting
related:
  - request-pagination-params
  - request-string-enum-default-allof
  - naming-enum-value-style
source:
  - core-conventions.md
  - empirical
---

# Sorting uses `sortBy` and `sortDir`

## Rule

For list sorting use exactly two query parameters: `sortBy` (a string enum of sort fields) and `sortDir` (a string enum with values `asc` and `desc`). Do not use `orderBy`, `sortField`, `sortOrder`, `sort=field:asc`, comma-separated lists, or a single `sort` parameter. If only one sort field is allowed, use `const`, not an `enum` of one element.

## When it applies

- The endpoint returns a list and supports choosing the sort field and direction.
- `parameters` contains `name: sortBy` or `name: sortDir`.
- The method description mentions sorting or ordering.

## How to detect a violation

- `sortBy` is declared as a query parameter; its `schema` is a string enum (via `$ref` to a dedicated `<Domain>SortBy` schema).
- `sortDir` is declared as a query parameter; its `schema.enum: [asc, desc]` (via `$ref` to a shared `SortDir`).
- Both parameters have a `default` in the schema (typically `sortBy: <field>`, `sortDir: desc` for time-ordered feeds, `asc` for schedules).
- If there is only one sort field (e.g. `completedAt`), `sortBy` uses `type: string`, `const: <field>`, not `enum: [<field>]`.
- Red flags: `orderBy`, `sortField`, `sortOrder`; merging into a single string `sort=field:dir`; `sortDir` with three or more values; no enum schema for `sortBy` (values inlined); `sortBy` without an enum and `default`.

## Severity and risk

HIGH: `sortBy`/`sortDir` are normative names. Alternative names or formats break shared client list layers and provoke ad-hoc parsing on the frontend. A missing enum schema for `sortBy` loses the contract of allowed sort fields and leads to silent drift.

## Good example

```yaml
- name: sortBy
  in: query
  schema:
    default: rating
    allOf:
      - $ref: '#/components/schemas/ItemSortBy'
- name: sortDir
  in: query
  schema:
    default: desc
    allOf:
      - $ref: '#/components/schemas/SortDir'
```

## Anti-example

```yaml
- name: orderBy
  in: query
  schema:
    type: string
    enum: [rating, price, views]
- name: sortOrder
  in: query
  schema:
    type: string
    enum: [ASC, DESC]
```

Fix: rename `orderBy` → `sortBy`, `sortOrder` → `sortDir`, values `ASC`/`DESC` → `asc`/`desc`. Extract the sort-field enum into `components/schemas/<Domain>SortBy` and `sortDir` into a shared `SortDir`. Add a `default` for both parameters.

## Related patterns

- [[request-pagination-params]] — sorting usually ships alongside `limit`/`offset`.
- [[request-string-enum-default-allof]] — a `default` over a `$ref` is written via an `allOf` wrapper, not as a sibling.
- [[naming-enum-value-style]] — enum values for new `sortBy` schemas follow camelCase / lowercase.

## Reviewer notes

- It is fine to have several domain-specific `SortBy` schemas (`ResourceSortBy`, `ScheduleSortBy`, `TeacherSortBy`) — as long as they are enum schemas.
- `SortDir` is usually a single shared schema with values `asc`/`desc`. Do not multiply copies without reason.
- For endpoints with a deterministic default sort, it is worth documenting the tie-breaker in the parameter `description` (e.g. `id`).

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `sortBy` with `default: rating` and `allOf: [$ref: ResourceSortBy]`, `sortDir` with `default: desc` and `allOf: [$ref: SortDir]` on the library lessons list
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml` — `sortBy` with `default: startAt` and `allOf: [$ref: CalendarEventSortBy]`, `sortDir` with `default: asc` and `allOf: [$ref: SortDir]` on the calendar events list
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml` — `sortBy` and `sortDir` with the same `allOf` + `$ref` + `default` structure using a domain-specific `ResourceSortBy` enum
