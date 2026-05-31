---
name: wording-no-internal-paths-leak
title: Developer-facing text does not leak internal file or folder names
category: wording
kind: core
severity_when_violated: MEDIUM
applies_to:
  - '`info.description` and the `description` of methods, schemas, parameters, statuses'
  - 'markdown context inside `description: |`'
  - '`$ref` references (no external `$ref` into other local files)'
related:
  - wording-description-not-method-level
  - wording-laconic-style
  - schema-self-contained-no-external-ref
source:
  - core-conventions.md
  - empirical
---

# Developer-facing text does not leak internal file or folder names

## Rule

A developer-facing OpenAPI spec must be self-contained. Do not reference local file names, folder names, or planning-document names in any `description`, and do not use external `$ref` that points into other local files. Every schema, field, edge case, and constraint the developer needs must be described inside the current spec itself. Cross-references to authoring or planning artifacts belong in your own bookkeeping, not in the contract handed to the implementer.

## When it applies

- Any spec YAML file delivered to a developer.
- Especially specs that build on top of an earlier one and are tempted to point at it ("see the other file").
- Any method description that pulls context from a sibling file.

## How to detect a violation

- Scan descriptions for path-like or file-like tokens: anything ending in `.yaml`/`.yml`/`.md`, folder names, or "see file X" pointers.
- Look for relative `$ref` paths (`$ref: '../something.yaml#/...'`): an external file reference is always a violation here — the schema must be inlined or restated as a local baseline.
- If a description names a specific source file or folder, rewrite it in self-contained business terms.
- A reference to an abstract domain concept ("the existing purchase record", "the schedule created earlier in this spec") is fine; a reference to a concrete file or folder is not.

## Severity and risk

MEDIUM. External `$ref` breaks contract validation for a developer who does not have the neighboring files. Naming a file or folder in a `description` is confusing: the developer goes looking for an artifact that was never shipped, and the contract reads as incomplete.

## Good example

```yaml
parameters:
  - name: resourceId
    in: path
    required: true
    description: Id of the purchased copy owned by the current user.
    schema:
      type: integer
```

The reference is to a domain concept ("purchased copy"), not to any source file.

## Anti-example

```yaml
description: |
  This method uses the `Purchase` schema defined in
  `19_purchases/01_purchases.yaml`. See `INDEX.md` for shared context.
schema:
  $ref: '../19_purchases/01_purchases.yaml#/components/schemas/Purchase'
```

Fix: inline the `Purchase` schema (or restate it as a local baseline under `components.schemas`), and describe the relationship in business terms ("the purchased copy") with no file name. Keep any links to planning artifacts out of the developer-facing spec.

## Related patterns

- [[schema-self-contained-no-external-ref]] — the structural counterpart: no external `$ref`, inline the schema instead.
- [[wording-description-not-method-level]] — flow detail lives at the right level, not behind a pointer to another file.
- [[wording-laconic-style]] — a concise description needs no "see the other file" pointers.

## Reviewer notes

- A phrase like "stage 01" or "step 1" is a borderline case: it does not name a file but indirectly leans on internal numbering. Prefer a self-contained rewrite; only flag it when the meaning is unclear without the predecessor.
- A relative `$ref` through `../` is always a violation, even when the target lives nearby; restate the schema locally instead.
- References to standard external tooling artifacts must not leak into developer-facing descriptions either; they help the author prepare the spec, not the implementer.
- A profile may explicitly permit referencing another artifact by a full, externally-resolvable URL (e.g. a repository blob URL); a bare local path or filename is still a violation. Check the active profile before flagging a full URL — for Estesis, see `wording-spec-file-links-gitlab-url`.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — schema descriptions reference domain concepts ("committed exercise fragments", "scheduled lesson ranges") only; no folder name, YAML file name, or planning document is mentioned anywhere in the file
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — `info.description` mentions the stage context but correctly avoids file or folder names; individual endpoint descriptions are fully self-contained
- `changes/023_music_label_display_drafts/01_musicLabels_label_display_drafts.yaml` — all cross-service references use service names (`appeals service`) and API paths (`/api/v1/...`), never local file paths or planning artifact names
