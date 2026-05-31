---
name: naming-camelcase-fields
title: camelCase for all field and parameter names
category: naming
kind: core
severity_when_violated: HIGH
applies_to:
  - request and response schema properties
  - query/path parameters
  - field names in multipart/form-data
related:
  - naming-enum-value-style
  - naming-preserve-baseline-enums
  - ids-numeric-not-string
source:
  - core-conventions.md
  - empirical
---

# camelCase for all field and parameter names

## Rule

Use camelCase for field and parameter names everywhere — request body, response body, query parameters, multipart form-data fields, and schema property names. snake_case and kebab-case are not allowed in new field names.

Exception: enum *values* inherited from an existing backend/domain layer (see [[naming-preserve-baseline-enums]]).

## When it applies

- Any new schema property (`purchasedAt`, `sourceId`, `scheduleItemId`).
- Query parameters (`sortBy`, `sortDir`, `hasVideo`).
- Multipart form-data field names (`audioFile`, `coverImage`).
- Path parameters (`{programId}`, `{id}`).

## How to detect a violation

- Find every `properties:` block and check each key matches `^[a-z][a-zA-Z0-9]*$` (optionally with `.` for dotted form-data keys).
- Find every `parameters: - name:` and check the same.
- Any `_` or `-` in a new name is a violation.

## Severity and risk

HIGH: field names are part of the HTTP contract and feed code generation. Mismatched styles break auto-mapping in most serializers (especially TypeScript/Kotlin), cause silent serialization bugs, and diverge from the style already adopted in the codebase.

## Good example

```yaml
properties:
  purchasedAt: { type: string, format: date-time }
  scheduleItemId: { type: integer }
```

## Anti-example

```yaml
properties:
  purchased_at:
    type: string
  schedule-item-id:
    type: integer
```

Fix: rename to `purchasedAt`, `scheduleItemId`.

## Related patterns

- [[naming-enum-value-style]] — the format of enum values.
- [[naming-preserve-baseline-enums]] — when snake_case is allowed (only legacy enum values).
- [[ids-numeric-not-string]] — id fields additionally require a numeric type.

## Reviewer notes

- A dotted multipart key (e.g. `parent.child`) must be camelCase in both segments. This is multipart-specific and does not make it a nested object (see [[request-multipart-flat-fields]]).
- Don't touch already-deployed field names of external services or domain models, even if they're snake_case. This rule applies to new names in the spec.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — all schema properties use camelCase throughout: `purchasedAt`, `sourceId`, `priceAtPurchase`, `commentsCount`, `reviewsCount`, `isCreatedByMe`, `imageUrl`; query parameters `sortBy`, `sortDir`.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — camelCase in both request fields (`resourceId`, `scheduleItemId`, `systemMark`, `vocalAudioFile`, `audiogramFile`) and response fields (`resourceSourceId`, `startAt`, `endAt`, `completedAt`).
- `changes/004_user_profile_v3/01_mainBackend_get_profiles.yaml` — camelCase query parameters on the teacher search endpoint: `minPrice`, `maxPrice`, `minRating`, `hasReviews`, `hasFreeSlots`, `lessonLocations`, `workExperience`, `sortBy`, `sortDir`.
