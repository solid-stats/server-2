---
name: errors-409-conflict
title: 409 for a business state conflict
category: errors
kind: core
severity_when_violated: MEDIUM
applies_to:
  - idempotent operations (repeat purchase, repeat start)
  - state-machine transitions that violate the rules
  - operations that require a specific precondition (status, ownership)
related:
  - errors-edge-case-in-status-description
  - errors-no-extra-status
  - errors-shared-shape
source:
  - core-conventions.md
  - empirical
---

# 409 for a business state conflict

## Rule

Return `'409'` only for a business conflict between the resource's current state and the requested operation: a repeat purchase, restarting an already-running job, modifying an already-completed item, or an action requiring a different status. The 409 `description` must enumerate the concrete scenarios. Do not use 409 for:
- "not found" — that is 404;
- payload validation — that is 422 or 400;
- a permission denial — that is 403.

## When it applies

- The operation is invoked on an entity whose state makes it inapplicable ("already purchased", "already running", "already completed").
- An idempotent create endpoint detects a duplicate by a uniqueness key.
- A state machine: cannot `complete` without `start`, cannot `withdraw` without an active draft.

## How to detect a violation

- The 409 `description` must reference a concrete state condition (a status, an existing record, a stored result, etc.).
- If a 409 is declared and described as just "Conflict" / "Already exists" with no detail — flag it.
- 409 and 404 must not overlap: 404 means "the resource doesn't exist", 409 means "it exists but is in the wrong state".
- If the operation has no meaningful state that a transition could conflict with, 409 should not be declared.

## Severity and risk

MEDIUM: a wrong 409 (e.g. in place of 404) throws off client retry logic and backend metrics. A too-generic 409 with no description forces the client to parse `message`.

## Good example

```yaml
responses:
  '409':
    description: |
      The source item is already purchased: the current user already
      holds a purchase record for this source.
```

## Anti-example

```yaml
responses:
  '409':
    description: Conflict
```

Fix: add the concrete scenario — "The requested operation is incompatible with the current state of X: <condition1>; <condition2>.".

```yaml
post:
  operationId: createPlaylist
  responses:
    '409':
      description: Playlist not found
```

That is a 404, not a 409. 409 is for a state conflict, not a missing resource.

## Related patterns

- [[errors-edge-case-in-status-description]] — the detailed scenario goes in the status description.
- [[errors-no-extra-status]] — don't add 409 without a real state conflict.
- [[errors-shared-shape]] — if 409 returns a body, use the shared error shape.

## Reviewer notes

- For a repeat idempotent operation that must not create a new object (repeat subscription/purchase), 409 is the correct choice precisely because the resource's state blocks creation.
- For conditional updates, prefer 409 with a concrete description over 412 Precondition Failed unless the profile specifies otherwise.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — the `buyExercise` operation returns `'409'` with a detailed description: "Source resource already purchased. Returned when the current user already has a common purchased-resource record for this source exercise." — a canonical idempotent-create conflict.
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — mutation endpoints (update, delete, document) on a published source resource return a shared `'409'` (via `$ref: PublishedResourceLocked`) whose description explains that the state (published/immutable) is what makes the operation invalid, not a missing resource.
- `changes/015_teacher_profile_drafts/01_appeals_teacher_profile_outbox.yaml` — the `createAppeal` operation uses `'409'` for duplicate appeal detection ("Appeal with this `id` already exists, or the user already has an active appeal of the same type."), a uniqueness-key conflict distinct from 404.
