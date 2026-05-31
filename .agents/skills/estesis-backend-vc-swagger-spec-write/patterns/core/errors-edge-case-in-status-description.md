---
name: errors-edge-case-in-status-description
title: Describe edge cases in the specific status description
category: errors
kind: core
severity_when_violated: HIGH
applies_to:
  - 4xx/5xx responses with non-obvious triggering conditions
  - operations where one status has several distinct causes (e.g. 404 for different entities)
related:
  - errors-no-extra-status
  - errors-404-not-found
  - errors-409-conflict
  - schema-description-on-property
source:
  - core-conventions.md
  - empirical
---

# Describe edge cases in the specific status description

## Rule

Describe the conditions under which an error occurs in the `description` of that specific `'4xx'`/`'5xx'` response — not in the operation's `summary`/`description` and not in a file-wide section. If one status covers several causes (e.g. "label not found or license does not exist"), list all of them in that status's description.

## When it applies

- The operation returns a 4xx/5xx whose cause is not obvious from the standard meaning of the status.
- The operation `description` already contains "Returned when…" or similar phrasing — that belongs on the specific status instead.
- Several distinct business causes resolve to the same status.

## How to detect a violation

- Each 4xx/5xx must carry a meaningful `description:`, not just "Bad request." or "Forbidden.".
- If the operation `description` (under `operationId`) explains "when 404 / 409 is returned", that is a violation: move it to the status description.
- If two statuses of one operation share a word-for-word description, check whether both are needed or it's a duplicate.
- Multi-line `description: |` is encouraged for enumerating several causes.

## Severity and risk

HIGH: the right place for an edge case is the backbone of the developer contract. If causes scatter into the operation description or shared context, the implementer misses cases, the client gets unpredictable behavior, and every review has to reconstruct the edge-case map by hand.

## Good example

```yaml
post:
  operationId: buyItem
  description: Purchases an item for the current user.
  responses:
    '200': { description: OK }
    '404':
      description: Source item not found, unpublished, or already deleted.
    '409':
      description: |
        The source item is already purchased: the current user already
        holds a purchase record for it.
```

## Anti-example

```yaml
post:
  operationId: buyItem
  description: |
    Buys an item. Returns 404 if item not found, 409 if already purchased,
    400 if it cannot be purchased.
  responses:
    '200': { description: OK }
    '400': { description: Bad request }
    '404': { description: Not found }
    '409': { description: Conflict }
```

Fix: move the concrete conditions out of the operation `description` into the matching status descriptions. Keep the operation description about the business intent (what it does), not the list of outcomes.

## Related patterns

- [[errors-no-extra-status]] — don't list spurious statuses; a clear description justifies each one.
- [[errors-404-not-found]] — what to write in a 404 description.
- [[errors-409-conflict]] — what to write in a 409 description.

## Reviewer notes

If a status description repeats a phrase from the operation description verbatim, fix inline: keep the detailed version on the status and remove it from the operation.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — the `buyExercise` operation keeps its `description` to the business intent ("Buys a published source exercise…") and places all triggering conditions on the matching status: `'400'` lists why purchase is blocked, `'404'` names the missing resource, `'409'` explains the already-purchased state.
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — the lesson publication `POST` puts a multi-line `'422'` description ("Publication не разрешен, пока lesson не содержит playable content item…") directly on the status rather than in the operation description, keeping the operation description focused on the happy path.
- `changes/006_video_lessons/01_resources_create_delete.yaml` — update and delete operations carry multi-line `'403'` descriptions enumerating per-role denial conditions (Student / Teacher / Admin), demonstrating that several causes belonging to one status are listed there, not scattered in the operation body.
