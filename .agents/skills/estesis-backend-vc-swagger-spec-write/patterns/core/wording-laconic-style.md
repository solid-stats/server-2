---
name: wording-laconic-style
title: Keep descriptions concise and informative
category: wording
kind: core
severity_when_violated: NIT
applies_to:
  - any `description` block in the spec
  - '`info.description` and the `description` of methods, fields, parameters, statuses'
related:
  - wording-no-default-duplication
  - wording-description-not-method-level
  - wording-paragraph-empty-line
source:
  - core-conventions.md
  - empirical
---

# Keep descriptions concise and informative

## Rule

Descriptions must be concise and informative. Drop marketing phrases, generic preambles ("This endpoint is used to..."), restatements of what the schema already shows, and repeats of what is already said at an adjacent level. If a sentence can be removed without losing meaning, remove it.

## When it applies

- Any `description` block.
- First of all `info.description` and method descriptions, which tend toward "summary" preambles.

## How to detect a violation

- Read the method/field description and ask: "what does the developer learn that the schema did not already show?" If the answer is "nothing", the description is redundant.
- Filler markers:
  - "This endpoint is used to..." / "This method is intended for...";
  - "Returns data about..." instead of concrete behavior;
  - restating the default (see `wording-no-default-duplication`);
  - listing fields that the schema already describes;
  - long preambles before the actual content.
- A long description is fine when every sentence carries concrete business logic, an edge case, or a relationship between calls. Concise does not mean short at any cost.

## Severity and risk

NIT. A style note. In a large file, accumulating filler makes it harder to navigate to the important information and lengthens review.

## Good example

```yaml
get:
  summary: List schedule items
  description: Returns the current user's schedule items, each enriched with a short card of the purchased session under `resource`.
```

One sentence; it states what the method does and the one non-obvious enrichment, nothing more.

## Anti-example

```yaml
get:
  summary: List schedule items
  description: |
    This endpoint is used to get a list of schedule items. The list of
    schedule items contains the user's schedule items. Each schedule item
    represents a planned user action.

    The method supports pagination via limit and offset. This lets the
    client fetch large lists in chunks.
```

The first paragraph says the same thing three times; the second restates the pagination contract that is already visible from the parameters. Fix: collapse to one informative sentence (see the Good example).

## Related patterns

- [[wording-no-default-duplication]] — a specific kind of filler: duplicating the default.
- [[wording-description-not-method-level]] — another source of bloat: duplicating field/parameter detail at the top level.
- [[wording-paragraph-empty-line]] — after trimming, do not forget the paragraph breaks.

## Reviewer notes

- Concise does not mean one-word `description: ok` / `description: data`. If a `400` has several causes, list them explicitly — that is informative, not filler.
- Descriptions of cross-service flows can look long but be substantive; leave them as is.
- Concrete numbers and conditions in edge-case descriptions ("more than two program ids", "endAt later than the current server time") are useful specifics, not filler.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/014_exercises_resources/01_resources_exercises_create_delete.yaml` — `createExerciseDraft` method description is three sentences, each carrying a distinct constraint; there is no preamble like "This endpoint is used to create a draft"
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — `updateVideoLessonPublishedGuard` uses a single-sentence description ("Existing update method. This fragment documents only the new published-source conflict branch."); every word is load-bearing
- `changes/018_music_label_appeal_drafts/01_musicLabels_appeal_drafts.yaml` — `getAdminMusicLabelsByAppeals` description is a full paragraph listing read rules; long but each bullet states a concrete behavior, no padding sentences
