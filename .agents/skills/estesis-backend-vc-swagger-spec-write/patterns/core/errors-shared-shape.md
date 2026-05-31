---
name: errors-shared-shape
title: Use one shared error payload shape
category: errors
kind: core
severity_when_violated: HIGH
applies_to:
  - 4xx/5xx responses that carry a JSON error body
  - validation errors (e.g. 422) that need a machine-readable domain code
related:
  - errors-edge-case-in-status-description
  - errors-no-extra-status
  - schema-anyof-oneof-for-polymorphism
source:
  - core-conventions.md
  - empirical
---

# Use one shared error payload shape

## Rule

When an error returns a JSON body, use a single shared error shape across the spec. The exact field set is profile-defined (it is fixed once per project, not per endpoint); a common illustrative shape is:

```
{
  httpStatus: integer,
  errorCode: string (enum value naming this specific error),
  message: string,
  details: object
}
```

Whatever the profile's fields are, they apply uniformly. `errorCode` must be a narrow `enum`/`const` naming *this* error, not a generic `"validation_error"`. If one status covers several distinct `errorCode`s, wrap the alternatives in `anyOf`.

## When it applies

- A validation error (commonly 422) maps to a clear domain condition (e.g. `invalidStatus`, `statusChangeNotAllowed`).
- Any 4xx/5xx whose body must let clients distinguish causes programmatically.
- A status declared without a `content` block stays body-less — for it the status `description` alone is enough; no error schema is needed.

## How to detect a violation

- The error schema's `required` must list exactly the profile's shared error fields (e.g. `[httpStatus, errorCode, message, details]`).
- `errorCode` is a `string` with an `enum` of exactly one value per error type (or a `const`, see [[schema-const-vs-enum-of-one]]).
- If one status has multiple possible causes, the response schema is an `anyOf` of several error schemas.
- Red flags: ad-hoc bodies like `{ error, fields }` or `{ code, msg }` that differ from the shared shape; a generic `errorCode` reused for unrelated failures.

## Severity and risk

HIGH: errors without a machine-readable `errorCode` force the client to parse `message`. If the error shape diverges across services, a shared client-side error handler is impossible and every consumer re-implements parsing.

## Good example

```yaml
'422':
  description: The supplied status is not valid for this resource.
  content:
    application/json:
      schema:
        type: object
        required: [httpStatus, errorCode, message, details]
        properties:
          httpStatus: { type: integer }
          errorCode: { type: string, enum: [invalidStatus] }
          message: { type: string }
          details: { type: object }
```

## Anti-example

```yaml
'422':
  description: Validation failed
  content:
    application/json:
      schema:
        type: object
        properties:
          error: { type: string }
          fields: { type: array }
```

Fix: switch to the profile's shared error shape; set a narrow `errorCode` (`enum: [invalidStatus]`). If several causes share the status, use `anyOf` of specialized error schemas.

## Related patterns

- [[errors-edge-case-in-status-description]] — describe the triggering condition in the status `description`.
- [[errors-no-extra-status]] — don't declare a body-bearing status with no real cause.
- [[schema-anyof-oneof-for-polymorphism]] — modeling multiple errors under one status via `anyOf`.

## Reviewer notes

- If a status has no `content`, no error schema is needed. Don't force a body where the status plus `description` already tells the client everything.
- Older specs may carry inconsistent error shapes; don't churn them solely for that, but require new specs to use the shared shape, especially for validation errors and domain conflicts.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/001_shared_status_errors/01_shared_status_single_error.yaml` — the canonical single-error schema definition: `required: [httpStatus, errorCode, message, details]` with a narrow `errorCode: enum: [invalid_status]`, exactly one value per error type.
- `changes/001_shared_status_errors/01_shared_status_multiple_errors.yaml` — demonstrates the `anyOf` pattern for a status with two distinct domain codes (`invalid_status` / `status_change_not_allowed`), each a full shared-shape object, so the client can branch on `errorCode` without parsing `message`.
