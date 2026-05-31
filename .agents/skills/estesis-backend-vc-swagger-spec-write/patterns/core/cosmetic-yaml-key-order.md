---
name: cosmetic-yaml-key-order
title: Consistent key order for operations and schemas
category: cosmetic
kind: core
severity_when_violated: NIT
applies_to:
  - any spec YAML file
related:
  - cosmetic-yaml-indentation
source:
  - core-conventions.md
  - empirical
---

# Consistent key order for operations and schemas

## Rule

Inside an operation object under `paths`, keys usually run in the order:

1. `operationId`
2. `summary`
3. `description`
4. `tags`
5. `security`
6. `parameters`
7. `requestBody`
8. `responses`

Inside `responses`, statuses run in ascending order (`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `500`, ...). Inside component schemas keys usually run as `type`, `required`, `properties`, `description`, or as `allOf`/`anyOf`/`oneOf` then `description`, `example`. This order is a convention, not a strict standard; keep one order consistent within a file.

## When it applies

- An operation or schema is being edited.
- A code generator reordered keys.
- A merge conflict shifted the key order.

## How to detect a violation

- Check the key order inside an operation against the convention above.
- Check that statuses inside `responses` run in ascending order.
- Check that schema `properties` follow a logical order (id → business fields → metadata), without zig-zags.

## Severity and risk

NIT. It does not affect the OpenAPI contract itself, but it eases reading and diffing: a reviewer finds the expected operation keys (e.g. `security` or `requestBody`) faster. With many operations, an unexpected key order slows review.

## Good example

```yaml
paths:
  /api/v1/items:
    get:
      operationId: getItems
      summary: Get items
      description: Return a list of items.
      tags: [items]
      security:
        - bearerAuth: []
      parameters: []
      responses:
        '200': { description: OK }
        '401': { description: Unauthorized }
```

## Anti-example

```yaml
paths:
  /api/v1/items:
    get:
      responses:           # responses before summary
        '200':
          description: OK
      operationId: getItems
      summary: Get items
```

Fix: reorder keys to `operationId → summary → ... → responses`. Same for schemas: `type → required → properties` (or the equivalent for `allOf`/`anyOf`/`oneOf`).

## Related patterns

- [[cosmetic-yaml-indentation]] — consistent indentation complements key order.

## Reviewer notes

- There is no hard normative key order — the convention is derived from existing files. If a file deliberately follows another agreed style (e.g. always `tags` before `summary`), do not change it purely for uniformity.
- Inside `properties`, a logical business order beats alphabetical: `id` → `name` → `description` → `createdAt` → `updatedAt`, not `createdAt` → `description` → `id`.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/023_music_label_display_drafts/01_musicLabels_label_display_drafts.yaml` — every operation follows `operationId → summary → description → tags → security → parameters → responses`; response statuses run in ascending order (`200`, `401`, `403`, `404`)
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — all 23 operations consistently open with `operationId → summary → description → tags → security → parameters`; within `components.schemas`, properties run in a logical domain order (`id` before business fields before metadata)
- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — schema blocks use `description → type → required → properties` ordering; inside `FullExerciseModel.properties` the order is `id → name → description → ... → voiceRange → fragments`, following business significance rather than alphabetical order
