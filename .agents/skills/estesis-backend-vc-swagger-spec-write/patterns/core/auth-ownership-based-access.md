---
name: auth-ownership-based-access
title: Ownership/purchase access — describe as a relation-based 403, no permission check
category: auth
kind: core
severity_when_violated: HIGH
applies_to:
  - owner-facing reads (e.g. a personal library)
  - any method where access depends on a purchase/library/author relation
related:
  - auth-public-read-private-write
  - security-no-direct-role-checks
  - errors-401-vs-403
source:
  - core-conventions.md
  - empirical
---

# Ownership/purchase access — describe as a relation-based 403, no permission check

## Rule

When access to an endpoint is determined by the current user's purchase/library/author relation rather than by permission codes, the `403` description must state two things explicitly:

1. Which relation the refusal is based on (e.g. "user has not purchased the resource", "user is not the resource author", "user has no library relation").
2. That the method does not call the project's permission-check endpoint and does not do direct role checks.

This kind of `403` is distinct from permission-driven refusals and must not reference a permission payload.

## When it applies

- A personal-library read: access only if the user purchased the resource or is the author.
- A review-creation method: access requires a purchase plus the constraint that the user is not the author.
- Any method where the shared context describes purchase/library/author ownership rules.

## How to detect a violation

- Find the `403` whose description mentions "purchased", "author", "library relation", or "caller has no access".
- Confirm the description explicitly lists the refusal conditions (as bullets or one phrase).
- The description should contain a phrase like "This method does not use direct role checks and does not call the permission-check endpoint" or equivalent. Otherwise it is unclear whether the refusal is permission-driven or relation-driven.
- Permission-driven and ownership-driven refusals may coexist on one endpoint; if both apply, the description must cover both branches.

## Severity and risk

HIGH: confusing permission-driven with ownership-driven refusals makes the implementer call the permission-check endpoint where it is not needed (over-permissive), or treat the relation as sufficient when a permission check is also required (over-restrictive). The frontend also cannot tell what to show the user on a `403`.

## Good example

```yaml
/api/v1/library/items/{id}:
  get:
    security:
      - bearerAuth: []
    responses:
      '200': { description: Item from the current user's library. }
      '401': { description: Unauthorized. }
      '403':
        description: |
          Returned when the item is neither purchased by the current user
          nor created by the current user.

          For free items, a zero-price purchase/access record is still required
          unless the current user is the author.

          This method does not call the permission-check endpoint; access is
          based on the current user's library relation.
```

## Anti-example

```yaml
/api/v1/library/items/{id}:
  get:
    security:
      - bearerAuth: []
    responses:
      '403':
        description: |
          Returned when the permission-check endpoint returns false.   # <- wrong
          Payload: { "permissions": ["READ_MY_RESOURCES"], "requireAll": true }
```

Fix: drop the permission-check reference and keep a relation-based description that names the missing relation and states no permission check is performed.

## Related patterns

- [[auth-public-read-private-write]] — the common pattern where a public read is anonymous and ownership is checked on a library route.
- [[security-no-direct-role-checks]] — ownership checks are not role checks and stay in the service.
- [[errors-401-vs-403]] — choosing the status for ownership-based access.

## Reviewer notes

- Some endpoints combine both mechanisms: a method may first check a permission and then check ownership/availability. If both participate, the description must cover both branches.
- Free resources still require a purchase/access record (zero price) — an important subtlety. Do not treat "free" as equivalent to "anonymous".

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/017_programs_resources/02_01_resources_programs_shop_library.yaml` — `getLibraryProgram` `403` description: "Returned when the program is neither purchased by the current user nor created by the current user. For free programs, a zero-price purchase/access record is still required unless the current user is the author. Этот метод не вызывает `/api/v3/permissions/check`; доступ основан на library relation текущего пользователя."
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `getLibraryLesson` `403` description similarly states the library-relation refusal condition and explicitly says the method does not call the permission-check endpoint.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — studio schedule and program endpoints (`createStudioScheduleItem`, `startStudioProgram`, etc.) produce `403` with ownership-based descriptions ("купленная программа не принадлежит текущему пользователю") and no reference to the permission-check endpoint.
