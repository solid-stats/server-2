---
name: cosmetic-yaml-blank-lines
title: Blank lines between major YAML sections and trailing whitespace
category: cosmetic
kind: core
severity_when_violated: NIT
applies_to:
  - any spec YAML file
related:
  - cosmetic-yaml-indentation
  - cosmetic-yaml-key-order
source:
  - core-conventions.md
  - empirical
---

# Blank lines between major YAML sections and trailing whitespace

## Rule

Use one blank line between major top-level sections (`info`, `tags`, `paths`, `components`) and between adjacent endpoint blocks in `paths` for readability. Do not leave more than one consecutive blank line. Do not leave trailing whitespace at line ends. The file ends with a single final newline (`\n`). Inside a `description: |` block a blank line denotes a new paragraph in the UI; do not use stray blank lines inside multiline descriptions.

## When it applies

- A spec YAML file is being edited.
- The diff shows double blank lines or trailing whitespace.
- A multiline description (`description: |`) contains extra blank lines.

## How to detect a violation

- Look for consecutive blank lines (`grep -n "^$" file.yaml`, then check none are doubled).
- Confirm there is one blank line between `tags:` and `paths:`, and between `paths:` and `components:`.
- Confirm adjacent endpoint blocks inside `paths` are separated by exactly one blank line.
- Look for trailing whitespace: `grep -nE " +$" file.yaml`.
- Confirm the file ends with a single newline and no extra blank lines.

## Severity and risk

NIT. It does not affect the developer-facing contract, but it affects readability and diffs. Trailing whitespace and double blank lines can conflict with formatters and break diff tools. Extra blank lines inside `description: |` break paragraphs in Swagger UI.

## Good example

```yaml
tags:
  - name: items

paths:
  /api/v1/items:
    get:
      operationId: getItems
      responses:
        '200': { description: OK }

  /api/v1/items/{id}:
    get:
      operationId: getItem
      responses:
        '200': { description: OK }
```

## Anti-example

```yaml
paths:


  /api/v1/items:           # double blank line before the endpoint
    get:
      operationId: getItems
      summary: Get items   ⎵⎵   # trailing whitespace at line end

```

Fix: remove the double blank line before `/api/v1/items`, strip the trailing whitespace on `summary`, and keep a single final newline at the end of the file.

## Related patterns

- [[cosmetic-yaml-indentation]] — indentation complements blank-line conventions.
- [[cosmetic-yaml-key-order]] — the two rules work together for readability.

## Reviewer notes

- Inside `description: |` a blank line denotes a new paragraph in the UI — that is a normative rule, not cosmetic. This pattern only concerns cosmetic excess.
- Do not fix cosmetics in the same commit as large content edits: isolate cosmetics into a separate commit to ease review.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — a large multi-operation file (23 operations); top-level sections (`tags`, `paths`, `components`) and adjacent path blocks are each separated by exactly one blank line, with no double blank lines anywhere
- `changes/023_music_label_display_drafts/01_musicLabels_label_display_drafts.yaml` — `info`, `tags`, `paths`, and `components` blocks are each separated by a single blank line; within `paths` each operation group is cleanly spaced
- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — a schema-only file; each top-level `components.schemas` entry is separated by a single blank line; multi-paragraph `description: |` blocks use blank lines only for paragraph breaks, with no stray blank lines inside property lists
