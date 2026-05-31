---
name: wording-description-not-method-level
title: Put detail in the most specific description, not at method level
category: wording
kind: core
severity_when_violated: LOW
applies_to:
  - any spec YAML file
  - '`info.description` and the `description` of methods, parameters, schemas, statuses'
related:
  - wording-laconic-style
  - wording-no-default-duplication
source:
  - core-conventions.md
  - empirical
---

# Put detail in the most specific description, not at method level

## Rule

Describe each detail where it applies:

- field semantics belong in the `description` of that schema property;
- query/path parameter behavior belongs in the parameter's `description`;
- errors and edge cases belong in the `description` of the specific response status.

Do not hoist field, parameter, or status detail into the method-level `description` or `info.description`, unless it is genuinely shared context for the whole method or file.

## When it applies

- Any method with several parameters, fields, or statuses.
- Especially methods that already describe those parameters/fields/statuses individually.

## How to detect a violation

- Read the method `description` and `info.description`. If they enumerate specifics of fields or statuses that are (or should be) described in the `properties[*].description` or `responses[*].description`, that is a violation.
- A method `description` that says "returns 400 if ..." should move that edge case into `responses['400'].description` instead of duplicating it at the top.
- A field explained in `info.description` while the field itself sits in the schema is detail living at the wrong level.
- A short narrative that connects several parameters/statuses into one flow may stay at method level — as long as it does not duplicate the per-item descriptions.

## Severity and risk

LOW. Duplicated description causes contract drift: a later edit fixes the text in one place and forgets the other. It also bloats the file and hurts readability.

## Good example

```yaml
parameters:
  - name: startAt
    in: query
    description: Returns schedule items that start at this date-time or later.
    schema: { type: string, format: date-time }
responses:
  '403':
    description: The program does not belong to the current user.
  '404':
    description: The program was not found.
```

Each parameter and status carries its own detail; the method `description` stays general.

## Anti-example

```yaml
get:
  summary: Get the schedule
  description: |
    Returns the user's schedule. `startAt` filters items by start time.
    `hasExercise` accepts true/false/null. Returns 400 if more than two
    program ids are passed, and 403 if a program is not owned by the user.
  parameters:
    - name: startAt
      description: ''
    - name: hasExercise
      description: ''
  responses:
    '400': { description: Bad request. }
    '403': { description: Forbidden. }
```

Fix: fill the empty parameter and status descriptions with their own detail, and leave the method `description` with only the general context of the method.

## Related patterns

- [[wording-laconic-style]] — the general rule against bloated text.
- [[wording-no-default-duplication]] — a specific case: do not restate `default` in a `description`.

## Reviewer notes

- It is not a violation when `info.description` tells a coherent non-trivial flow (multiple methods, cross-service interaction, a shared invariant) — that is the legitimate "shared context".
- A cross-method invariant that matters to the developer (e.g. "every method here requires a bearer token") may be repeated at file level even if it also appears on each method.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — each endpoint (`setVideoLessonPublication`, `setLessonPublication`, etc.) carries its own multi-paragraph `description`; edge cases like "unpublish of already-unpublished resource" and 400/403/404 semantics live on the individual response statuses, not duplicated at file level
- `changes/023_music_label_display_drafts/01_musicLabels_label_display_drafts.yaml` — `getMusicLabels` method description lists display rules in a bullet form at method level only because they govern the whole list shape; individual field semantics (`isApproved`, `appealId`) are described on the properties themselves
- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — `ResourceVoiceRange` schema description explains cross-field invariants (`notesRange` and `voiceTimbreTypes` are always returned together); property-level descriptions on `notesRange.min` and `notesRange.max` carry the per-field boundary semantics separately
