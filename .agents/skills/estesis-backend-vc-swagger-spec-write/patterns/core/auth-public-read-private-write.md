---
name: auth-public-read-private-write
title: Public read + private write — a pair of operations on one path
category: auth
kind: core
severity_when_violated: MEDIUM
applies_to:
  - public read methods (catalogs, profiles, reviews)
  - the related write methods (POST/PATCH/PUT/DELETE)
related:
  - security-do-not-add-security-clause-for-optional-auth
  - security-bearer-required-declaration
  - auth-ownership-based-access
source:
  - core-conventions.md
  - empirical
---

# Public read + private write — a pair of operations on one path

## Rule

When one path serves both a public read and a private mutation (e.g. `GET /reviews` is public while `POST /reviews` creates a review), declare each operation independently:

- Public read — no `security` block.
- Private write — `security: - bearerAuth: []`.

Do not declare a single `security` at the path level or at the document root. Each operation describes its own security model.

## When it applies

- A path holds both a `get` and a `post`/`patch`/`delete` with different access semantics.
- A public catalog read.
- Library/owner endpoints — a private read with purchase/ownership checks.
- Admin endpoints — a private read gated by a `READ_ALL_*` permission.
- Review endpoints — a public list read plus a private creation.

## How to detect a violation

- Open a path with multiple operations.
- For a `get` that is public (by its description or path semantics), confirm there is no `security` block.
- For `post`/`patch`/`delete`, confirm `security: - bearerAuth: []` is present.
- Confirm there is no global `security` at the document root.
- Confirm the public read's `responses` do not list a spurious `401`.
- Confirm the private write's responses include `401` and, where applicable, `403`, described correctly via the permission-check endpoint or an ownership relation.

## Severity and risk

MEDIUM: the contract technically works even if both methods carry `security: - bearerAuth: []`. But it violates the base rule that a public method must not appear authentication-required in Swagger UI, which confuses frontend integrators reading the public read.

## Good example

```yaml
/api/v1/items/{id}/reviews:
  get:
    operationId: listReviews
    description: Public. Returns the list of reviews.
    responses:
      '200': { description: Reviews list. }
  post:
    operationId: createReview
    security:
      - bearerAuth: []
    responses:
      '200': { description: Review created. }
      '401': { description: Unauthorized. }
      '403': { description: Returned when the current user may not review this item. }
```

## Anti-example

```yaml
/api/v1/items/{id}/reviews:
  get:
    security:                     # <- wrong, the method is public
      - bearerAuth: []
    responses:
      '200':
        description: Reviews list (public).
      '401':
        description: Unauthorized.   # <- spurious
  post:
    security:                     # <- correct
      - bearerAuth: []
    responses:
      '200':
        description: Review created.
      '401':
        description: Unauthorized.
```

Fix: remove `security` and `401` from the public `get`; keep `security` and `401` on the private `post`.

## Related patterns

- [[security-do-not-add-security-clause-for-optional-auth]] — the specific rule for public endpoints.
- [[security-bearer-required-declaration]] — for the private write.
- [[auth-ownership-based-access]] — `403` on ownership-driven mutations.

## Reviewer notes

- Public + private does not mean splitting by path: a `get` and a `post` on the same path is the normal case. Security is just described per-operation.
- For a public `get` that paginates, also check [[response-pagination-envelope]].

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml` — `getShopLessons` (`GET /api/v1/shop/lessons`) has no `security` block (public); `setLessonPublication` (`POST /api/v1/lessons/{id}/publication`) carries `security: - bearerAuth: []`. Both operate on the lesson resource domain but declare security independently per-operation.
- `changes/017_programs_resources/02_01_resources_programs_shop_library.yaml` — `getShopPrograms` and `getShopProgram` have no `security` clause; `setProgramPublication` and library endpoints are guarded with `bearerAuth`. Public shop reads and private library/management operations coexist across the same spec.
- `changes/017_programs_resources/02_02_resources_programs_reviews.yaml` — the review list `GET` is public (no `security`), while review creation `POST` on the same path declares `security: - bearerAuth: []`.
