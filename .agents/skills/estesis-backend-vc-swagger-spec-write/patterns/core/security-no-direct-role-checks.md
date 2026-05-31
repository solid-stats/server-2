---
name: security-no-direct-role-checks
title: Do not hardcode direct role checks into protected methods
category: security
kind: core
severity_when_violated: HIGH
applies_to:
  - every service except the authorization-owning service
  - all endpoints with auth and role-based restrictions
related:
  - security-roles-in-context-not-in-method
  - auth-ownership-based-access
  - errors-401-vs-403
source:
  - core-conventions.md
  - empirical
---

# Do not hardcode direct role checks into protected methods

## Rule

Services other than the authorization-owning service must not perform a direct check of the user's role (e.g. `student`, `teacher`, `admin`). Express all role-based restrictions through permission codes and calls to the project's permission-check endpoint (profile-defined). The method description or `403` response must not state things like "current user must be a teacher" or "only admins can call this method" as the normative contract.

Roles are mentioned only as background in the shared context.

## When it applies

- The service is not the authorization-owning service.
- The endpoint is protected (`security: - bearerAuth: []`) and documents a `403`.
- The shared context defines a set of roles and how they are used.

## How to detect a violation

- Look in method or `403` descriptions for phrases like:
  - `must be a teacher`, `only teachers`, `only admins`, `requires admin role`, `current user must be student`;
  - `if user.role == "teacher"` or any other direct role check.
- Compare with the shared context: if it states the service must not implement direct role checks, any direct mention of a role as a contractual check is a violation.
- The correct phrasing reads as "If the current user is the resource author" (ownership), or references a permission code (e.g. `UPDATE_MY_RESOURCES`, `READ_ALL_RESOURCES`).

## Severity and risk

HIGH: direct role checks defeat the goal of keeping the authorization model in one place. A downstream service starts duplicating the role model, two sources of truth appear, and when permissions change in the authorization-owning service the downstream service drifts.

## Good example

```yaml
/api/v1/items:
  post:
    summary: Create item
    security:
      - bearerAuth: []
    responses:
      '403':
        description: |
          Returned when the current user cannot create the item.

          For creation permission, call the project's permission-check endpoint
          with `{ "permissions": ["CREATE_RESOURCE"], "requireAll": true }`.
```

## Anti-example

```yaml
/api/v1/items:
  post:
    summary: Create item
    security:
      - bearerAuth: []
    responses:
      '403':
        description: Only teachers can create items.   # <- direct role check
```

Fix: replace the role check with a permission-code check described against the project's permission-check endpoint, or with an ownership relation.

## Related patterns

- [[security-roles-in-context-not-in-method]] — where roles should be described instead.
- [[auth-ownership-based-access]] — ownership/purchase checks stay in the service and are not role checks.
- [[errors-401-vs-403]] — picking the status for an unauthenticated vs forbidden request.

## Reviewer notes

- Exception: the authorization-owning service itself owns the roles and may check a role as a domain operation (e.g. a "become teacher" transition that mutates the role). That is not an authorization role check.
- If a response description mentions a role only to clarify who the user is in the system (e.g. "teacher author"), that is acceptable as context, not as an access check.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/017_programs_resources/03_resources_programs_admin.yaml` — `getAdminPrograms` `403` description reads: "Returned when `/api/v3/permissions/check` with the following payload returns false: `{ "permissions": ["READ_ALL_RESOURCES"], "requireAll": true }`." — no mention of a role (teacher/student/admin) as the access check.
- `changes/017_programs_resources/02_01_resources_programs_shop_library.yaml` — `setProgramPublication` `403` description routes to the permission-check endpoint with `UPDATE_MY_RESOURCES`/`UPDATE_ALL_RESOURCES` codes depending on authorship — role names are absent from the refusal description.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — `403` responses on studio schedule and program endpoints cite ownership ("купленная программа не принадлежит текущему пользователю") — no direct role names used as the access condition.
