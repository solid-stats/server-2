---
name: auth-redacted-fields-by-relation
title: Redacted fields in public responses — express via oneOf/anyOf, not null
category: auth
kind: core
severity_when_violated: MEDIUM
applies_to:
  - public profiles and cards
  - schema fields hidden from non-privileged viewers
  - sensitive contact data (exact addresses, phone numbers)
related:
  - security-do-not-add-security-clause-for-optional-auth
  - auth-public-read-private-write
  - schema-anyof-oneof-for-polymorphism
  - schema-anyof-nullability
source:
  - core-conventions.md
  - empirical
---

# Redacted fields in public responses — express via `oneOf`/`anyOf`, not `null`

## Rule

When some fields in a public response are hidden depending on the viewer-to-resource relation (e.g. "only a student of this teacher sees the address"), express it through a structural union (`oneOf`/`anyOf`) or an explicit enum marker such as `"restricted"` — not through `null` or dropping the field. The structural approach makes the contract explicit and self-documenting.

## When it applies

- A public profile with a private part (e.g. an address visible only to a related viewer).
- Search endpoints where not every card field is available to an anonymous viewer.
- Any response with two distinct representations of one field depending on the viewer's relation.

## How to detect a violation

- Find response-schema fields whose description contains "hidden", "visible to ...", "restricted", "redacted", or "only for owner/admin/student".
- Confirm they are described via `oneOf` with explicit variants:
  - one variant — the filled value (object or string);
  - another variant — a restriction marker (`type: string, const: restricted`) or another explicit shape.
- A silent `nullable: true` (or `anyOf` with only `{ type: 'null' }`) or dropping the field from the response without declaring a variant is not acceptable.

## Severity and risk

MEDIUM: with a silent nullable and no structural marker, the frontend cannot tell "field hidden for privacy" from "field simply absent". This breaks UX (wrong messages like "no data" instead of "available to students only") and complicates testing. Not a security blocker, but a contract-clarity issue.

## Good example

```yaml
TeacherAddresses:
  oneOf:
    - type: string
      const: restricted
      description: User is not a student of this teacher; addresses are hidden.
    - type: object
      description: Addresses visible to students of this teacher.
      properties:
        studioAddress:
          anyOf:
            - { type: string }
            - { type: 'null' }
        teacherPlaceAddress:
          anyOf:
            - { type: string }
            - { type: 'null' }

FullTeacherProfile:
  type: object
  properties:
    addresses:
      $ref: '#/components/schemas/TeacherAddresses'
```

## Anti-example

```yaml
FullTeacherProfile:
  type: object
  properties:
    studioAddress:
      type: string
      nullable: true
      description: Visible only to students of this teacher.   # <- implicit redaction
    teacherPlaceAddress:
      type: string
      nullable: true
      description: Visible only to students of this teacher.
```

Fix: move the redacted fields into a structural union that explicitly describes both states — a `restricted` marker variant and a filled-value variant.

## Related patterns

- [[security-do-not-add-security-clause-for-optional-auth]] — redaction usually lives on an endpoint with an optional bearer token.
- [[auth-public-read-private-write]] — a public profile may partially reveal data when a relation exists.
- [[schema-anyof-oneof-for-polymorphism]] — the general rule for `oneOf`/`anyOf` unions.
- [[schema-anyof-nullability]] — for a single field use `anyOf` with `{ type: 'null' }`, not `nullable: true`.

## Reviewer notes

- If a field can also be `null` for an authorized viewer (e.g. the teacher simply has no address), that is ordinary nullable semantics, not redaction. Combining (`oneOf` redaction + nullable value inside) is fine.
- For admin/cross-author endpoints redaction is usually not needed — the admin sees all fields.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/004_user_profile_v3/01_mainBackend_get_profiles.yaml` — `TeacherAddresses` is a `oneOf` with two variants: `{ type: string, enum: [restricted], description: "User is not a student of this teacher, address hidden." }` and an object with `studioAddress`/`teacherPlaceAddress` fields visible to students. `FullTeacherProfile.addresses` uses this schema, making the redaction explicit and self-documenting.
- _No second project example yet — pattern enforced going forward._
