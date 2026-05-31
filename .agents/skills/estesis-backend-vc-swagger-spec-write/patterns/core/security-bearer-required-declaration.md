---
name: security-bearer-required-declaration
title: Required bearer token — security clause and securitySchemes
category: security
kind: core
severity_when_violated: HIGH
applies_to:
  - any endpoint that requires authentication
  - all mutation methods, admin endpoints, owner-facing reads
related:
  - security-do-not-add-security-clause-for-optional-auth
  - auth-ownership-based-access
  - errors-401-vs-403
source:
  - core-conventions.md
  - empirical
---

# Required bearer token — security clause and securitySchemes

## Rule

If a method requires an authenticated user, the operation must declare `security: - bearerAuth: []`. A `bearerAuth` scheme must exist under `components.securitySchemes` with value `{ type: http, scheme: bearer, bearerFormat: JWT }`. The name `bearerAuth` is used as the canonical scheme identifier across the whole spec.

## When it applies

- Mutation methods (POST/PATCH/PUT/DELETE) that change state on behalf of the user.
- Owner-facing reads (e.g. "my content", admin endpoints).
- Any method for which `401 Unauthorized` is listed under `responses` as a genuinely reachable response.

## How to detect a violation

- For each authenticated operation, check that it carries the block:
  ```yaml
  security:
    - bearerAuth: []
  ```
- Under `components.securitySchemes`, find `bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }`. `bearerFormat: JWT` is the standardized form but is optional.
- If `responses` lists `401` but the operation has no `security` block, that is a violation for a private method.
- A different scheme name (`HTTPBearer`, `bearer`, `JWT`) is a smell: name the scheme `bearerAuth` in new specs.

## Severity and risk

HIGH: a missing `security` clause on a private endpoint means Swagger UI and codegen clients do not know a token is required. It breaks discoverability, makes clients call without auth and get a 401 on every request, breaks integration tests, and breaks generated SDKs.

## Good example

```yaml
paths:
  /api/v1/items:
    post:
      operationId: createItem
      summary: Create item
      security:
        - bearerAuth: []
      responses:
        '200': { description: Item created. }
        '401': { description: Unauthorized. }

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

## Anti-example

```yaml
paths:
  /api/v1/items:
    post:
      summary: Create item
      # security clause missing
      responses:
        '401':
          description: Unauthorized.
```

Fix: add `security: - bearerAuth: []` and register `bearerAuth` under `components.securitySchemes`.

## Related patterns

- [[security-do-not-add-security-clause-for-optional-auth]] — the inverse rule for public methods with an optional token.
- [[auth-ownership-based-access]] — ownership-driven `403` on a private method.
- [[errors-401-vs-403]] — which status to pick for an unauthenticated vs forbidden request.

## Reviewer notes

- Do not confuse `security: []` (disabling auth for a specific method when a global `security` exists) with a missing block. If the spec has no document-level `security`, a missing block on an operation simply means the method is public.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/003_permissions_api/01_mainBackend_permissions.yaml` — `POST /api/v3/permissions/check` declares `security: - bearerAuth: []` and registers `bearerAuth` under `components.securitySchemes` with `type: http, scheme: bearer, bearerFormat: JWT`. Responses include `401 Unauthorized`.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — all purchase history endpoints (`getPurchasedExercises`, `getPurchasedLessons`, etc.) and buy endpoints (`buyExercise`, `buyLesson`, etc.) each carry `security: - bearerAuth: []`, with `bearerAuth` registered in `components.securitySchemes`.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml` — every studio mutation (`saveStudioResult`, `createStudioScheduleItem`, `clearStudioSchedule`, `startStudioProgram`, `cancelStudioProgram`) and every owner-facing read declares `security: - bearerAuth: []` with a matching `401` response.
