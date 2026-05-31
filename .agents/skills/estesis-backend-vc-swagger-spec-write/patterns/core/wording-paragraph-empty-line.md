---
name: wording-paragraph-empty-line
title: A new rendered paragraph needs a blank line in description blocks
category: wording
kind: core
severity_when_violated: NIT
applies_to:
  - 'any multiline `description: |` block'
  - '`info.description` and the `description` of methods, schemas, parameters, statuses'
related:
  - wording-laconic-style
source:
  - core-conventions.md
  - empirical
---

# A new rendered paragraph needs a blank line in description blocks

## Rule

In a `description: |` block a new paragraph in the rendered docs is created only by a blank line (two newlines). A single newline is just source readability and does not start a new paragraph in the UI. Do not rely on a single line break when you want a visible paragraph break.

## When it applies

- Any multiline `description: |`.
- Especially methods and `info.description` that walk through several flow steps or edge cases.

## How to detect a violation

- In a `description: |`, check whether logical blocks are separated by a blank line. Two sentences joined by a single newline will collapse into one paragraph in the rendered docs.
- A long passage broken with single newlines purely for source readability is legitimate — but confirm it really is one paragraph in meaning, not two that got merged.
- When several visual paragraphs are intended, a blank line must sit between them.
- Markdown lists (`- item`) inside `description: |` do not need a blank line between items, but they do need a blank line before the list when it follows a normal paragraph.

## Severity and risk

NIT. The contract is not broken; only readability in the rendered docs suffers. It is easy to miss when reviewing YAML directly and only shows up on render.

## Good example

```yaml
description: |
  Sets the publication status of the lesson.

  When `isPublished` is true, the source lesson becomes published.

  When `isPublished` is false and the source lesson is currently published,
  the service performs a soft delete.
```

Three paragraphs, each separated by a blank line.

## Anti-example

```yaml
description: |
  Sets the publication status of the lesson.
  When `isPublished` is true, the source lesson becomes published.
  When `isPublished` is false and the source lesson is published, the service soft-deletes it.
```

This renders as one long paragraph with no visible breaks. Fix: insert a blank line between the logical paragraphs.

## Related patterns

- [[wording-laconic-style]] — shorter text needs paragraph breaks less often.

## Reviewer notes

- For short single-line `description` values the rule is not relevant.
- When a markdown list appears inside `description: |`, its indentation and the blank line before the list are a separate aspect; this pattern is only about paragraphs.
- For large specs with dozens of `description: |` blocks, render at least the key methods to confirm the paragraphs did not merge.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — `setVideoLessonPublication`, `setExercisePublication`, and `setLessonPublication` each use a four-paragraph `description: |` with blank lines separating the general statement, the `isPublished=true` branch, the `isPublished=false` branch, and the idempotent case
- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — `ResourceVoiceRange` schema has a six-paragraph description block where each paragraph covers a distinct scope (the invariant, exercises, lessons, programs, the null case); all separated by blank lines
- `changes/008_karaoke_queue/01_songs_membership.yaml` — `createCurrentKaraokeQueue` uses a four-line `description: |` where each logical statement is on its own line but intentionally forms one paragraph; compare with the correctly blank-line-separated multi-paragraph descriptions in the publish lifecycle spec
