---
name: errors-404-not-found
title: 404 for a missing resource, including in place of 403
category: errors
kind: core
severity_when_violated: MEDIUM
applies_to:
  - endpoints with a path id or input `*Id` fields
  - bulk lookup endpoints that resolve ids partially
related:
  - errors-401-vs-403
  - errors-edge-case-in-status-description
  - response-list-shape
source:
  - core-conventions.md
  - empirical
---

# 404 for a missing resource, including in place of 403

## Rule

- Use `'404'` when a resource is not found by a path id, an input `*Id` field, or a `(scope, id)` combination.
- If several ids take part in the route (e.g. `labelId` and `licenseId`), the 404 `description` states which resource may be missing.
- For bulk lookup, do not return 404 on partial matches. Report unresolved ids inside the `200` body via a `missing*` array (e.g. `missingIds`).
- For "fetch someone else's resource by id that I'm not allowed to see", prefer 404 over 403 (protection against enumeration).

## When it applies

- The path contains `{id}`/`{...Id}`, or the body carries fields like `sourceId`.
- The operation targets an owned resource whose owner is not the current user.
- The operation `description` says "returns X by id" — there must be a 404 for a missing X.

## How to detect a violation

- Each `*Id` parameter should yield a `'404'` whose description names the resource it refers to.
- If the route spans several entities, the 404 description must enumerate all possible causes.
- For bulk lookup, confirm a `missing*` field in the response is used instead of 404, and the status stays `200`.
- If there's a `'403'` described as "resource does not belong to you", consider replacing it with 404.

## Severity and risk

MEDIUM: misusing 404 vs 403 leads to enumeration leaks and unpredictable "not found" handling in the UI. A bulk lookup that returns 404 on the first miss breaks batch flows: the client loses already-resolved ids.

## Good example

```yaml
get:
  parameters:
    - { name: labelId, in: path, schema: { type: integer } }
    - { name: licenseId, in: path, schema: { type: integer } }
  responses:
    '404':
      description: Music label or license not found.
```

## Anti-example

```yaml
get:
  parameters:
    - { name: labelId, in: path, schema: { type: integer } }
    - { name: licenseId, in: path, schema: { type: integer } }
  responses:
    '404':
      description: Not Found
```

Fix: the 404 description must explicitly enumerate what may be missing ("Music label or license not found.").

```yaml
post:
  responses:
    '404':
      description: One of the requested ids does not exist
```

If this is a bulk lookup, move unresolved ids into a `missing*` field under `200`. Keep 404 only when none of the ids exist (or skip it entirely for bulk).

## Related patterns

- [[errors-401-vs-403]] — why 404 is preferable to 403 for someone else's resource.
- [[errors-edge-case-in-status-description]] — concrete causes go in the status description.
- [[response-list-shape]] — bulk lookup envelope with a `missing*` field.

## Reviewer notes

- If a resource exists but is soft-deleted, return 404 for public endpoints; internal endpoints may still return it provided the behavior is documented explicitly.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — each publication `POST` names the specific missing resource in its `'404'` description (e.g. "Video lesson не найден.", "Exercise не найден или deleted."), including the soft-deleted case.
- `changes/013_label_public_songs/01_musicLabels_license_rules.yaml` — endpoints with two path ids (`labelId` + `licenseId`) enumerate both possible missing entities in a single `'404'` description (e.g. "Музыкальный лейбл или принятая активная лицензия не найдены."), showing multi-resource 404 phrasing.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — the `buyExercise` `POST` carries `'404': Source exercise not found.` as a separate status from `'409'`, confirming that "resource doesn't exist" stays 404 while "already purchased" goes to 409.
