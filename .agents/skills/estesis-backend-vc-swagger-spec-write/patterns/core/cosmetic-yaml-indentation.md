---
name: cosmetic-yaml-indentation
title: Consistent YAML indentation — 2 spaces, no tabs
category: cosmetic
kind: core
severity_when_violated: NIT
applies_to:
  - any spec YAML file
related:
  - cosmetic-yaml-key-order
  - cosmetic-yaml-blank-lines
source:
  - core-conventions.md
  - empirical
---

# Consistent YAML indentation — 2 spaces, no tabs

## Rule

Use 2-space indentation per nesting level. Do not use tabs. Do not mix 2- and 4-space indentation in one file. List items (`- `) are indented one level from their parent key.

## When it applies

- A spec YAML file is being edited.
- An auto-formatter (e.g. `yamlfmt`) is run on the file.
- The file was copied from an external source with its own indentation style.

## How to detect a violation

- Search for tabs: a U+0009 character in YAML is a violation.
- Search for indentation jumps: if sibling keys at the same level have a different number of leading spaces, that is a violation.

## Severity and risk

NIT. It does not affect the developer-facing contract, but it reduces readability and complicates later edits. YAML with tabs or 4-space indentation breaks diff tools and can conflict with a formatter the reviewers intend to run.

## Good example

```yaml
paths:
  /api/v1/items:
    get:
      operationId: getItems
      responses:
        '200':
          description: OK
```

## Anti-example

```yaml
paths:
    /api/v1/items:
        get:
          operationId: getItems   # nesting switched from 4 to 2 spaces
```

Fix: bring every level to a uniform 2-space step.

## Related patterns

- [[cosmetic-yaml-key-order]] — a consistent key order complements consistent indentation.
- [[cosmetic-yaml-blank-lines]] — indentation works together with blank-line conventions.

## Reviewer notes

- Most editors normalize indentation on save. For a large edit, run a formatter up front.
- Do not fix cosmetics only: if the main task is a contract change, isolate cosmetic fixes into a separate commit.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — all 23 operations, their parameters, request bodies, and response schemas use consistent 2-space indentation throughout; no tabs, no mixed 2/4-space levels
- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — deeply nested schemas (`FullExerciseModel` with `anyOf` inside `properties`) maintain 2-space indentation at every level without deviation
- `changes/011_playlists_api/01_songs_playlists.yaml` — a 480-line file with multiple schemas and operations; 2-space indentation is consistent from top-level keys down to the deepest nested `items` and `properties` blocks
