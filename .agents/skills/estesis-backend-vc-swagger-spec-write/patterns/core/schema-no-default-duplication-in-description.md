---
name: schema-no-default-duplication-in-description
title: Do not duplicate default in the description
category: schema
kind: core
severity_when_violated: LOW
applies_to:
  - schema properties with a `default`
  - query/path parameters with a `default`
related:
  - schema-description-on-property
  - request-optional-list-default
source:
  - core-conventions.md
  - empirical
---

# Do not duplicate `default` in the `description`

## Rule

If the default is already declared in the schema via `default`, do not repeat it in the `description`. The description should explain behavior and semantics, not restate machine-readable metadata.

## When it applies

- A schema property with `default: ...`.
- A query parameter with `default: 20`, `default: []`, `default: null`.
- Any place where the author writes "Defaults to X" while the schema already has `default: X`.

## How to detect a violation

- Find every `default:` and compare it with the adjacent `description`. Phrases like "Defaults to `20`", "Default is `null`", "If not provided, defaults to `desc`" are a violation when `default: 20/null/desc` is already present.
- This shows up most often in pagination parameters (`limit`, `offset`) and `sortDir`.

## Severity and risk

LOW: the duplication adds noise and risks drift between the description and the actual `default`. Swagger UI already shows `default` separately, so repeating it is redundant.

## Good example

```yaml
- name: sortDir
  in: query
  description: Sort direction.
  schema:
    default: desc
    allOf:
      - $ref: '#/components/schemas/SortDir'
```

## Anti-example

```yaml
- name: sortDir
  in: query
  description: Sort direction. By default `desc`.
  schema:
    default: desc
    allOf:
      - $ref: '#/components/schemas/SortDir'
```

Fix: drop "By default `desc`" from the description, keeping only the semantics ("Sort direction.").

## Related patterns

- [[schema-description-on-property]] — descriptions live on the property, but without duplicating metadata.
- [[request-optional-list-default]] — rules for choosing default values for query parameters.

## Reviewer notes

- It is acceptable to keep the meaning of `null` in the description when it carries distinct business semantics, e.g. "An empty list means all types; the filter is not applied." — that describes the behavior of `default: []` without repeating the value.
- If the default is not obvious from the name, a minimal hint is fine, but without the exact value: "Sorted by purchase date, newest first." is semantics, not a duplicate.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/006_video_lessons/02_01_resources_shop_library.yaml` — Anti-example (violation): `includePurchased` parameter (line 157) says "Defaults to `true`" in the description while `default: true` is already declared in the schema (line 160); the phrase should be dropped.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — Good example: `sortBy` and `sortDir` parameters (lines 38–49) carry short semantic descriptions ("Sort field.", "Sort direction.") without repeating the `default` value that the schema already declares.
