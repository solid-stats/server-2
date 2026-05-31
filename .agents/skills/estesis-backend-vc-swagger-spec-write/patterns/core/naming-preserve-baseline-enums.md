---
name: naming-preserve-baseline-enums
title: Don't rename baseline backend enum values
category: naming
kind: core
severity_when_violated: HIGH
applies_to:
  - enum schemas inherited from existing services and external reference data
  - category-style enums that mirror an existing backend reference list
related:
  - naming-enum-value-style
  - naming-camelcase-fields
source:
  - core-conventions.md
  - empirical
---

# Don't rename baseline backend enum values

## Rule

Don't rename existing backend/domain enum values or external reference lists for the sake of style. snake_case values like `vocal_warmup` or `second_category` stay as-is when they're already used in backend services and deployed APIs.

The camelCase rule ([[naming-enum-value-style]]) applies only to *new* enum values that don't yet exist in the system.

## When it applies

- A spec introduces a local enum that mirrors an already-existing reference list.
- The shared context references a legacy enum.
- You spot a smell: a long snake_case enum in a brand-new spec.

## How to detect a violation

- Compare the enum values against existing services and other specs. If the same values appear across multiple places, they're baseline and must not be renamed.
- Before renaming, confirm:
  - whether the value is used by a backend service;
  - whether the value is used elsewhere in the spec set;
  - whether there's an explicit, recorded decision in the shared context permitting the rename.

## Severity and risk

HIGH: renaming a backend enum value is a breaking change. Existing clients, deep links, analytics, localization, and data migrations are tied to the exact strings. A silent rename without backend/frontend agreement causes runtime errors and data loss.

## Good example

```yaml
ItemCategory:
  type: string
  enum:
    - vocal_warmup      # baseline value, preserved as-is
    - articulation_dev  # baseline value, preserved as-is
    - sound_production
```

## Anti-example

```yaml
ItemCategory:
  type: string
  enum:
    - vocalWarmup       # renamed from vocal_warmup
    - articulationDev   # renamed from articulation_dev
```

Fix: restore the baseline snake_case. If a backend enum genuinely needs renaming, record the decision in the shared context first and coordinate with the backend.

## Related patterns

- [[naming-enum-value-style]] — new values use camelCase.
- [[naming-camelcase-fields]] — fields and parameters stay camelCase even when their values are baseline snake_case.

## Reviewer notes

- Smell indicator: a mixed enum where different values of the same enum use different styles (e.g. `classicalTeacher` next to `vocal_coach`). Clarify with the author which one is baseline.
- If a spec adds a *new* value to an existing enum, it should follow the style of the surrounding values — i.e. a new value in a snake_case enum is also snake_case.
- Don't confuse this with [[naming-enum-value-style]]: they work together, and baseline preservation outranks style consistency.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — `ExerciseCategory` preserves backend snake_case values (`vocal_warmup`, `articulation_dev`, `sound_production`, `range_expansion`, `intonation_dev`). `LessonCategory` and `ProgramCategory` preserve long snake_case lists (`classical_teacher`, `vocal_coach`, `vocal_repetiteur`, etc.) unchanged.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — `ExerciseCategory` and `LessonCategory` lists carry the same preserved snake_case values as `019`, confirming the values span multiple specs without renaming.
- `changes/004_user_profile_v3/01_mainBackend_get_profiles.yaml` — `WorkExperience` enum preserves legacy baseline snake_case values (`less_than_a_year`, `one_to_two_years`, `three_to_five_years`, etc.); `Specialization` and `MusicGenre` enums similarly preserve hundreds of backend snake_case reference values without renaming.
