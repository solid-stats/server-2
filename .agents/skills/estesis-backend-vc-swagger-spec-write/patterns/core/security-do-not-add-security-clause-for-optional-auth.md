---
name: security-do-not-add-security-clause-for-optional-auth
title: No security clause on endpoints with optional bearer token
category: security
kind: core
severity_when_violated: HIGH
applies_to:
  - public endpoints that behave differently when a bearer token is present
related:
  - security-bearer-required-declaration
  - auth-public-read-private-write
source:
  - core-conventions.md
---

# No `security` clause on endpoints with optional bearer token

## Rule

An endpoint that is public but optionally reacts to a bearer token gets no `security` clause — not `security: [{}]`, not `security: [{ bearerAuth: [] }]`. Either form makes Swagger UI present the endpoint as authentication-required. Describe the optional-token behavior in the method, parameter, or response-field description instead.

## When it applies

- A read endpoint is reachable anonymously but returns extra/different data when authenticated (e.g. ownership flags, personalized fields).
- The description says "if authenticated…" / "for the current user…".

## How to detect a violation

- The operation has `security: [{}]` or `security: [{ bearerAuth: [] }]` yet the prose says the endpoint is public/optional-auth.
- Conversely, an endpoint that truly **requires** a token must declare `security` — see [[security-bearer-required-declaration]]. The violation here is specifically *optional* auth carrying a security clause.

## Severity and risk

HIGH: a wrong `security` clause makes Swagger UI demand a token, so anonymous clients (and integrators reading the contract) believe the public endpoint is closed. It misrepresents the access model.

## Good example

```yaml
/api/v1/items/{id}:
  get:
    operationId: getItem
    description: |
      Public. With a bearer token, the response additionally includes
      `isOwned` for the current user.
    responses:
      '200': { description: ... }
```

(no `security` on the operation; global `security` does not force it either)

## Anti-example

```yaml
/api/v1/items/{id}:
  get:
    operationId: getItem
    security:
      - bearerAuth: []   # wrong: endpoint is public, token is optional
```

Fix: remove the `security` clause; document the optional-token behavior in `description`.

## Related patterns

- [[security-bearer-required-declaration]] — when a token is genuinely required, declare it.
- [[auth-public-read-private-write]] — public read paired with protected write.

## Reviewer notes

- If a global `security` is set at the document level, an optional-auth operation must override it with `security: []` only if that is the agreed way to mark it public; prefer documenting rather than relying on an empty override. Confirm the project's convention in the profile.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `getShopLessons` (`GET /api/v1/shop/lessons`) has no `security` clause; optional-token behavior is documented in the `200` description: "When a valid bearer token is provided, current-user fields … are resolved for that user. When the bearer token is absent or invalid, the request is treated as anonymous."
- `changes/017_programs_resources/02_01_resources_programs_shop_library.yaml` — `getShopPrograms` and `getShopProgram` carry no `security` clause and document optional-token personalization in the `200` response description instead.
- `changes/017_programs_resources/02_01_resources_programs_shop_library.yaml` — `getShopProgramDayLesson` description reads: "Этот метод публичный и не требует авторизации. Валидный optional bearer token заполняет поля текущего пользователя в ответе урока." — no `security` block present.
