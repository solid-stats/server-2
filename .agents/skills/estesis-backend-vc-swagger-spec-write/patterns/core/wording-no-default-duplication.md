---
name: wording-no-default-duplication
title: Do not restate the default value in the description
category: wording
kind: core
severity_when_violated: NIT
applies_to:
  - parameters and schema properties that already declare a `default`
  - query parameters for pagination, sorting, filtering
related:
  - wording-laconic-style
  - wording-description-not-method-level
  - schema-no-default-duplication-in-description
source:
  - core-conventions.md
  - empirical
---

# Do not restate the default value in the description

## Rule

If a value is already declared in `schema.default`, do not repeat it in the `description` with wording like "Defaults to X". The default is already visible in the rendered docs from the schema itself. Keep in the `description` only the behavioral meaning that cannot be derived from the `default`.

## When it applies

- Query parameters with `schema.default`.
- Schema properties that declare a `default`.
- Especially `limit`, `offset`, `sortBy`, `sortDir`, and boolean flags.

## How to detect a violation

- Find every place that declares `default:`. For each, read its `description`.
- A phrase like "Defaults to X", "Default: X", or "if omitted, X" duplicates `schema.default`.
- Exception: when `null` carries distinct business meaning that must be spelled out ("`null` means the filter is not applied", "an empty list means all items"), that text explains semantics, not the default — keep it.
- It is also fine to describe what a specific non-empty value means (e.g. a date format), as long as you do not repeat the literal value already in `default`.

## Severity and risk

NIT. It does not break the contract or mislead the developer, but it adds redundant text and invites contract drift: change the `default` later and someone forgets to update the prose, so the two disagree.

## Good example

```yaml
- name: resourceTypes
  in: query
  description: An empty list means all supported resource types; no filter is applied.
  schema:
    type: array
    items: { type: string }
    default: []
```

The description explains the semantics of the empty default rather than restating "defaults to empty".

## Anti-example

```yaml
- name: limit
  in: query
  description: Maximum number of items. Defaults to 20.
  schema:
    type: integer
    default: 20
```

The rendered docs already show `default: 20` plus the text "Defaults to 20" — redundant. Fix: `description: Maximum number of items.` (the default comes from the schema). If you truly need to say more about `limit`, describe bounds instead ("Between 1 and 100; out-of-range values return 400") — that is not a duplicate of `default`.

## Related patterns

- [[schema-no-default-duplication-in-description]] — the schema-level statement of the same rule.
- [[wording-laconic-style]] — general conciseness.
- [[wording-description-not-method-level]] — field detail lives at the field level, not higher.

## Reviewer notes

- When `default: null` and the field has non-trivial semantics (`null` means "filter not applied", "unset", "all items by default"), spell it out in `description` — that is explaining meaning, not duplicating the default.
- Text about boundary values, validation, or edge-case behavior stays in `description` and is out of scope for this pattern.
- If a description formally mentions the default but is semantically necessary (otherwise the developer would not understand the behavior), treat it as an exception and do not report it.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/023_music_label_display_drafts/01_musicLabels_label_display_drafts.yaml` — `Limit` and `Offset` parameters declare `default: 20` and `default: 0` in the schema; their `description` fields say only "Number of items to return" / "Number of items to skip" without restating "Defaults to 20"
- `changes/011_playlists_api/01_songs_playlists.yaml` — pagination parameters follow the same clean pattern: `default` lives in the schema, descriptions carry only semantic meaning
