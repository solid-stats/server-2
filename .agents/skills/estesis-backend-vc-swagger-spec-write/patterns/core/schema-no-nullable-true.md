---
name: schema-no-nullable-true
title: No nullable true in new specs
category: schema
kind: core
severity_when_violated: HIGH
applies_to:
  - any new OpenAPI 3.1.0 spec
  - edits in contexts where shared context declares the OpenAPI 3.1.0 style
related:
  - schema-anyof-nullability
  - schema-openapi-310
source:
  - core-conventions.md
  - empirical
---

# No `nullable: true` in new specs

## Rule

The keyword `nullable: true` must not be used in new OpenAPI 3.1.0 specs. It is an OpenAPI 3.0 / JSON Schema 2019-09 remnant that is silently ignored by JSON Schema 2020-12 parsers. Describe every nullable value with `anyOf` that includes `{ type: 'null' }`.

## When it applies

- The spec starts with `openapi: 3.1.0`.
- The shared context declares a move to OpenAPI 3.1.0.
- Any new schema edit, even when the file inherited an older style.

## How to detect a violation

- Search for `nullable: true` — every match in a 3.1.0 spec is a violation.
- Open the spec and check `openapi:` in the header. If it is `3.1.0`, any `nullable: true` is a violation.

## Severity and risk

HIGH: `nullable: true` is silently ignored under JSON Schema 2020-12. In practice the backend and frontend get a type without `null`, and runtime validation stops accepting `null` where the business meaning requires it. The contract mismatch produces API bugs with no parser warning.

## Good example

```yaml
imageUrl:
  anyOf:
    - { type: string }
    - { type: 'null' }
```

## Anti-example

```yaml
imageUrl:
  type: string
  nullable: true
```

Fix: rewrite as `anyOf: [ { type: string }, { type: 'null' } ]`. If the field is optional and `null` is a meaningful "empty", add `default: null`.

## Related patterns

- [[schema-anyof-nullability]] — the positive form of the same rule.
- [[schema-openapi-310]] — the shared applicability boundary.

## Reviewer notes

- Specs already pinned to `openapi: 3.0.x` may contain `nullable: true`; do not rewrite them just for style without an explicit request.
- In mixed edits (a new file and an old file together), confirm the new file follows OpenAPI 3.1.0 rules even when its neighbors use the old style.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- Anti-example (violation): `changes/006_video_lessons/01_resources_create_delete.yaml` — uses `nullable: true` on multiple fields (lines 305, 343, 351, 423, 426); this file is `openapi: 3.0.2` where the keyword was valid, but any new edits should switch to `anyOf`.
- Anti-example (violation): `changes/007_song_edit/01_songs_edit_song.yaml` — `openapi: 3.0.3` file with `nullable: true` (lines 153, 187); demonstrates legacy style that must not be copied into new specs.
- Good example: `changes/021_resource_voice_range/01_resources_voice_range.yaml` — `openapi: 3.1.0` file with no `nullable: true` anywhere; all nullable fields use `anyOf: [ ..., { type: 'null' } ]`.
