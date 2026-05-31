---
name: errors-401-vs-403
title: Separate 401 (no token) from 403 (no permission)
category: errors
kind: core
severity_when_violated: HIGH
applies_to:
  - 'private endpoints declaring `security: bearerAuth`'
  - endpoints that perform an authorization check (ownership, role)
related:
  - errors-edge-case-in-status-description
  - errors-404-not-found
  - security-bearer-required-declaration
source:
  - core-conventions.md
  - empirical
---

# Separate 401 (no token) from 403 (no permission)

## Rule

- `'401'` — the token is missing, expired, or invalid. Description: a short "Unauthorized.".
- `'403'` — the token is valid but the user lacks permission on this resource/action. The description states the concrete reason for the authorization denial.
- Do not declare `'403'` if the endpoint has no permission check at all (e.g. "get my own profile" has no 403 — someone else's profile is fetched through a different endpoint).
- Do not use `'403'` as a fallback for "not found" — use `'404'` for a missing resource (see [[errors-404-not-found]]).

## When it applies

- Any operation with `security: bearerAuth`.
- Especially operations on owned entities (resource owner) or gated by a role.

## How to detect a violation

- Each private operation should have a `'401'` described as "Unauthorized.".
- `'403'` only makes sense if the operation has a "no permission" business condition: the operation `description` should reference an owner / role / access concept.
- A 403 description must not be just "Forbidden." — it must explain the specific denial (e.g. "Caller has no access to this resource").
- If a 403 is declared but its description matches the 401, fold it into 401 — it is not a separate case.

## Severity and risk

HIGH: confusing 401 and 403 breaks client logout logic. The client must read 401 as "redirect to login" and 403 as "show a no-permission state". If both mean the same thing, the UI behavior becomes arbitrary.

## Good example

```yaml
responses:
  '401':
    description: Unauthorized.
  '403':
    description: Caller has no access to this resource.
```

## Anti-example

```yaml
responses:
  '401':
    description: Forbidden
  '403':
    description: Unauthorized
```

Fix: 401 is "Unauthorized." (missing/invalid token); 403 carries the concrete permission reason. Don't swap the descriptions.

```yaml
responses:
  '403':
    description: User cannot view this profile.
```

If the endpoint fetches another user's profile by id and the caller isn't allowed to see it, return 404 (the profile "doesn't exist" for them), not 403, so you don't leak enumeration facts. See [[errors-404-not-found]].

## Related patterns

- [[errors-edge-case-in-status-description]] — put the concrete 403 reason in the status description.
- [[errors-404-not-found]] — when to return 404 instead of 403.
- [[security-bearer-required-declaration]] — the `security` block expected on private endpoints.

## Reviewer notes

- For "own resource" endpoints (`/my/...`, `/me/...`) a 403 is usually unneeded: there's no other id, so access either exists or the token is invalid.
- If one operation has both an ownership check and a role check, prefer a single 403 with a multi-line description listing both cases over duplicating statuses.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — each publication endpoint declares `'401': Не авторизован.` (unauthenticated) and a separate `'403'` naming the concrete ownership reason (e.g. "Текущий пользователь не может manage publication для этого video lesson"), demonstrating the clean split.
- `changes/006_video_lessons/01_resources_create_delete.yaml` — the update and delete operations carry `'401': Unauthorized.` alongside a multi-line `'403'` that enumerates role-specific denial reasons (Student / Teacher / Admin), showing how several permission cases collapse into one `403` description.
- `changes/013_label_public_songs/01_musicLabels_license_rules.yaml` — read and write license endpoints each pair `'401': Ошибка авторизации.` with `'403': У вызывающей стороны нет доступа к этому лейблу.`, a concise ownership-based 403 that does not bleed into a "not found" case.
