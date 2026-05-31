---
name: request-search-vs-filters
title: Free-text search uses a single search parameter
category: request
kind: core
severity_when_violated: MEDIUM
applies_to:
  - listing endpoints with free-text search or per-field filters
related:
  - request-optional-list-default
  - request-optional-non-list-null
source:
  - core-conventions.md
  - empirical
---

# Free-text search uses a single `search` parameter

## Rule

For free-text search over a list use a query parameter named `search` (`type: string`). Do not use `query`, `q`, `keyword`, `term`, or `filter`. Per-field search parameters (`name`, `email`, `artist`) are allowed only when the business scenario requires searching that field separately from the general search and the two are not covered by a single `search`.

## When it applies

- The endpoint returns a list and supports substring search.
- `parameters` contains a string query parameter for free-text filtering.

## How to detect a violation

- Find the string query parameter that is semantically "free-text search" — it must be named `search`.
- The parameter `description` should state which fields the search applies to ("Free-text search by name", "Search by name and description").
- Red flags:
  - `name: query`, `name: q`, `name: keyword`, `name: term`, `name: filter` in the role of free-text search;
  - both `name: search` and `name: nameSearch` without a clear business distinction;
  - three or more per-field search parameters that could be merged into one `search`.
- Cross-check with the method `description`: if it says "search by name/description/tags", the parameter should be `search`, not three separate ones.

## Severity and risk

MEDIUM: a naming mismatch breaks the unified search UI in the client (one search-input component routed across endpoints). Per-field parameters where a single `search` would suffice cause contract-surface bloat and incomplete backend implementations.

## Good example

```yaml
- name: search
  in: query
  description: Free-text search by name and artist.
  schema:
    type: string
```

## Anti-example

```yaml
- name: query
  in: query
  description: Free-text search.
  schema:
    type: string
- name: nameFilter
  in: query
  schema:
    type: string
- name: artistFilter
  in: query
  schema:
    type: string
```

Fix: keep a single `search` with a `description` listing the search fields ("Free-text search by name, artist"). `nameFilter` / `artistFilter` are justified only if the business scenario requires phrase-match on an exact field separately from the general search.

## Related patterns

- [[request-optional-non-list-null]] — `search` is usually a single string parameter; if a null variant is needed, express it via `anyOf` with `{ type: 'null' }` (though a plain `type: string` is usually enough).
- [[request-optional-list-default]] — enum-value filters (category, status) are separate list parameters, not part of `search`.

## Reviewer notes

- If search has non-standard semantics (fulltext rank, fuzzy, synonyms), record it in the parameter `description`. The name still stays `search`.
- `searchByField` as a parameter name is an anti-pattern; split into `search` (free-text) and separate filter parameters with meaningful domain names.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `name: search` (`type: string`, description "Free-text search by name") sits alongside separate `category` and `difficulty` array filters, cleanly separating free-text from enum-value filtering
- `changes/016_lessons_resources/03_resources_lessons_admin.yaml` — admin lesson list uses `name: search` for free-text and `authorId` / `isPublished` / `category` / `difficulty` as separate field-specific filters
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml` — same split on the exercises shop list: single `search` string plus distinct `category` and `difficulty` list filters
