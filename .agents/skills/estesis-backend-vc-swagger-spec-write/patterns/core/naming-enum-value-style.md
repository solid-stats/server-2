---
name: naming-enum-value-style
title: camelCase for string enum values
category: naming
kind: core
severity_when_violated: MEDIUM
applies_to:
  - new string enum schemas
  - 'discriminator constants (`type: const: ...`)'
related:
  - naming-camelcase-fields
  - naming-preserve-baseline-enums
  - schema-const-vs-enum-of-one
source:
  - core-conventions.md
  - empirical
---

# camelCase for string enum values

## Rule

Use camelCase for new string enum values. Single-word values are plain lowercase (`student`, `teacher`, `comment`). Don't rename existing backend/domain values or external reference lists for the sake of style.

## When it applies

- Creating a new enum (e.g. `ResourceType`, `ScheduleStatus`).
- Discriminator constants in `type: { const: ... }`.
- Discriminator `mapping` keys in `oneOf` (`mapping: { videoLesson: '#/...' }`).

## How to detect a violation

- Each value of a new enum must match `^[a-z][a-zA-Z0-9]*$`.
- Underscores (`_`) are allowed only when inherited from a baseline backend enum (see [[naming-preserve-baseline-enums]]).
- Discriminator `mapping` keys must match the enum values exactly.

## Severity and risk

MEDIUM: values are part of the HTTP payload and must stay stable. An inconsistent style (some values camelCase, others snake_case) complicates client code and causes bugs when serializing/deserializing discriminator values.

## Good example

```yaml
ResourceType:
  type: string
  enum:
    - exercise
    - lesson
    - program
    - videoLesson   # multi-word value in camelCase
```

## Anti-example

```yaml
ResourceType:
  type: string
  enum:
    - exercise
    - video_lesson  # snake_case in a new enum — violation
    - VideoLesson   # PascalCase — violation
```

Fix: use `videoLesson`.

## Related patterns

- [[naming-camelcase-fields]] — the general style for field and parameter names.
- [[naming-preserve-baseline-enums]] — the exception for legacy backend enums.
- [[schema-const-vs-enum-of-one]] — discriminator constants use the same value style.

## Reviewer notes

- Smell indicator: the same concept spelled two ways across the spec (e.g. `mezzoSoprano` in one file and `mezzo_soprano` in another). Flag it as informational, but don't rename a baseline value for style without coordination.
- A discriminator `mapping` key must match the enum value 1:1. Any mismatch breaks auto-resolution in most code generators.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — `ResourceType` enum uses camelCase for the multi-word value `videoLesson`; single-word values `exercise`, `lesson`, `program` are plain lowercase. `VoiceTimbreType` uses `mezzoSoprano` for a two-word value.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — `ExercisePlaybackPattern` enum: all multi-word values are camelCase (`downUp`, `upDown`, `fromBaseNoteUp`, `fromBaseNoteDown`, etc.). `LessonContentItem` discriminator mapping keys match enum values exactly (`exercise`, `videoLesson`, `comment`).
- `changes/004_user_profile_v3/01_mainBackend_get_profiles.yaml` — `UserRole` uses single-word plain lowercase values `student` and `teacher`; discriminator mapping keys in `getUserProfile` response match these values 1:1.
