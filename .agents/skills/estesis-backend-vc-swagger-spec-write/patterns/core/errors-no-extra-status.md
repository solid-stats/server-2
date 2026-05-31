---
name: errors-no-extra-status
title: Don't declare response statuses "just in case"
category: errors
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any `responses:` block in an OpenAPI operation
related:
  - errors-edge-case-in-status-description
  - response-status-204-empty
  - response-status-200-vs-201
source:
  - core-conventions.md
  - empirical
---

# Don't declare response statuses "just in case"

## Rule

In `responses:`, list only the statuses the operation can actually return. Don't add `500`/`503` "just in case", don't duplicate `400`/`422`/`409` without a real cause, and don't leave placeholder responses with no description.

## When it applies

- Any OpenAPI operation with an explicit `responses:` block.
- Especially new operations copied from a template that asks "could X happen here?" without an explicit decision.

## How to detect a violation

- For each `4xx`/`5xx`, check the description against the operation's actual business logic:
  - Does the `description` state the concrete scenario that triggers this error?
  - A generic "Server error." or "Bad request." with no edge case is a smell.
- A typical private-operation set is: `'401'` (Unauthorized), `'403'` only if there's a permission/access check, `'404'` for a path id, `'409'` for a business conflict, `'422'` for validation detail. If the operation's code can't reach a situation for a given status, remove it.
- `'500'`/`'503'` are usually not declared: infrastructure generates them.
- A gateway status like `'502'` is declared only when the service explicitly depends on an external call that can fail and that semantics matters to the client.

## Severity and risk

MEDIUM: spurious statuses give the implementer a false signal that those scenarios must be handled in code, tests, and UI. On the client this produces dead handling logic and hurts the readability of the spec.

## Good example

```yaml
get:
  operationId: listPlaylists
  responses:
    '200': { description: OK }
    '401': { description: Unauthorized. }
```

## Anti-example

```yaml
get:
  operationId: listPlaylists
  responses:
    '200': { description: OK }
    '400': { description: Bad request }
    '401': { description: Unauthorized }
    '403': { description: Forbidden }
    '404': { description: Not Found }
    '500': { description: Server error }
    '503': { description: Service Unavailable }
```

Fix: for a GET with no path id and no access check, only `200` and `401` remain. `403` only if there's a permission check; `500`/`503` are infrastructural, so they're not declared.

## Related patterns

- [[errors-edge-case-in-status-description]] — describe the concrete edge case in the status description.
- [[response-status-204-empty]] — choosing 204 for empty responses.
- [[response-status-200-vs-201]] — choosing 200 for non-empty responses.

## Reviewer notes

Older specs may list `'500'` for historical reasons; don't churn them solely for that, but require new specs to drop it. If a developer insists on 500, ask for the concrete scenario in which this specific operation should return 500 with special semantics; otherwise it's an infrastructural fallback and not part of the contract.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — the list endpoints (`getPurchasedExercises`, `getPurchasedLessons`, etc.) declare exactly two statuses — `'200'` and `'401'` — with no defensive `'500'` or spurious `'404'`, matching the minimal-status rule for GET-all endpoints with no path id.
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — publication `POST` endpoints declare only `'204'`, `'401'`, `'403'`, and `'404'`, each justified by a concrete condition; `'500'` is absent, and `'400'`/`'422'` appear only on the lesson variant where a real validation precondition exists.
- `changes/015_teacher_profile_drafts/01_appeals_teacher_profile_outbox.yaml` — the `reopenAppeal` operation omits `'400'` and `'422'` (no independent validation path) and only declares `'401'`, `'403'`, `'404'`, and `'409'`, each with a real business trigger.
