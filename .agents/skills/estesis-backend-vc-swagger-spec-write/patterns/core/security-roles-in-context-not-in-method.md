---
name: security-roles-in-context-not-in-method
title: Describe roles in the shared context, not in per-method descriptions
category: security
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any spec with a role model
related:
  - security-no-direct-role-checks
source:
  - core-conventions.md
  - empirical
---

# Describe roles in the shared context, not in per-method descriptions

## Rule

Keep a single roles section in the shared context that lists the roles and their contextual capabilities. In OpenAPI method and `403` descriptions, do not duplicate the role model and do not write "Teacher can create items" as part of the contract — describe only the concrete permission checks or ownership/purchase rules.

## When it applies

- A spec with more than one role (e.g. Student/Teacher/Admin).
- The shared context already has a roles section.

## How to detect a violation

- Open the shared context. It should have a roles section (a table or bulleted list) describing each role's contextual capabilities, and a note that role information is context only and protection happens via permission checks (see [[security-no-direct-role-checks]]).
- In the operations: method and `403` descriptions must not duplicate the role list. They should reference either the permission-check endpoint or an ownership relation.

## Severity and risk

MEDIUM: duplicating role definitions dilutes the source of truth and causes contract drift between the shared context and the operations. When the role model changes it is easy to miss a copy. It does not block the implementer but makes maintenance and review harder.

## Good example

```yaml
# shared context
## Roles
# - Student — buys and consumes content.
# - Teacher — authors content when permission checks allow it.
# - Admin — manages content across authors.
# Role information is context only; protection is via permission checks.

# operation
/api/v1/items:
  post:
    description: Create an item.
    responses:
      '403':
        description: |
          Returned when the current user cannot create the item.
          See the project's permission-check endpoint with the required permission code.
```

## Anti-example

```yaml
# in an operation
/api/v1/items:
  post:
    description: |
      Roles overview:
      - Student: cannot create items.
      - Teacher: can create items when permissions allow.
      - Admin: can create items for any author.
    responses:
      '403':
        description: Forbidden.
```

Fix: remove the "Roles overview" from the method description (it belongs in the shared context). Keep only a concise operation description, and describe the permission payload in the `403`.

## Related patterns

- [[security-no-direct-role-checks]] — why role checks must not live in per-method descriptions.

## Reviewer notes

- For a short single-method spec, a full role table is not required — roles are implied through permission codes.
- If a method has exactly one permission check, a short human-readable phrase (e.g. "Available to an administrator with the `READ_ALL` permission") is acceptable in the description, but the real contract lives in the `403` response with the explicit payload.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/017_programs_resources/CONTEXT.md` — the `## Roles` section lists Student, Teacher, and Admin with contextual descriptions, followed by: "Role information is context only. The `resources` service must not implement direct role checks for program access." Per-method descriptions in the stage YAMLs reference permission codes, not roles.
- `changes/016_lessons_resources/CONTEXT.md` — identical pattern: roles are described once in the shared context table; per-method `403` descriptions in the stage YAMLs cite the permission-check endpoint payload rather than naming roles as access conditions.
- `changes/017_programs_resources/03_resources_programs_admin.yaml` — `getAdminPrograms` `403` description references only the permission payload `{ "permissions": ["READ_ALL_RESOURCES"], "requireAll": true }` with no role name in the operation contract.
