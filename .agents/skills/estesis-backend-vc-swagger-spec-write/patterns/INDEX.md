# Pattern registry

Two layers: **core** (universal, English, synthetic examples) and **profile** (Estesis-specific, Russian, real `changes/` citations). Both are bundled in this skill. `backend-vc-swagger-spec-review` checks against both layers.

Every file is one rule; the template is [`_TEMPLATE.md`](_TEMPLATE.md). The `Severity` column is `severity_when_violated`. Slugs are stable — add patterns, never rename or delete existing ones. When a finding is covered by both a core and a profile pattern, cite the narrower profile slug. Profile patterns may override a core rule, but only explicitly.

**Profile patterns** (Estesis domain features, iteration workflow, locale wording, project security): [`profile/INDEX.md`](profile/INDEX.md).

## Request contracts (7)

| Slug | Severity | Rule |
| --- | --- | --- |
| `request-pagination-params` | `HIGH` | Pagination uses `limit`/`offset`, not `page`/`pageSize`/`cursor` |
| `request-sort-by-and-dir` | `HIGH` | Sorting uses `sortBy` (string enum) and `sortDir` (`asc`/`desc`) |
| `request-string-enum-default-allof` | `MEDIUM` | Query enum with `default` wraps `$ref` in `allOf` |
| `request-optional-list-default` | `MEDIUM` | Optional list query params: `default: []`, empty == all |
| `request-optional-non-list-null` | `MEDIUM` | Optional non-list params: `anyOf` with `{ type: 'null' }` + `default: null` |
| `request-multipart-flat-fields` | `HIGH` | `multipart/form-data` carries only flat fields (profile may grant one service an exception) |
| `request-search-vs-filters` | `MEDIUM` | Prefer a generic `search` over per-field filters |

## Response contracts (4)

| Slug | Severity | Rule |
| --- | --- | --- |
| `response-pagination-envelope` | `HIGH` | Pagination returns `{ data, limit, offset, total }` |
| `response-list-shape` | `MEDIUM` | Non-paginated collections |
| `response-status-200-vs-201` | `MEDIUM` | Non-empty success is `200`, not `201` |
| `response-status-204-empty` | `MEDIUM` | Empty success is `204` |

## Errors (6)

| Slug | Severity | Rule |
| --- | --- | --- |
| `errors-shared-shape` | `HIGH` | One shared error payload shape (exact fields profile-defined) |
| `errors-edge-case-in-status-description` | `HIGH` | Edge cases described in the specific status response |
| `errors-401-vs-403` | `HIGH` | `401` (no token) vs `403` (no rights) kept distinct |
| `errors-404-not-found` | `MEDIUM` | `404` for missing resource, incl. as a `403` replacement |
| `errors-409-conflict` | `MEDIUM` | `409` for business state conflict |
| `errors-no-extra-status` | `MEDIUM` | Don't declare statuses "just in case" |

## Schema design (11)

| Slug | Severity | Rule |
| --- | --- | --- |
| `schema-self-contained-no-external-ref` | `BLOCKER` | Self-contained spec; no external `$ref` to planning files |
| `schema-anyof-nullability` | `HIGH` | Nullable via `anyOf` with `{ type: 'null' }` |
| `schema-no-nullable-true` | `HIGH` | No `nullable: true` in new specs |
| `schema-ref-and-lsp` | `HIGH` | `$ref` and Liskov substitutability when extending schemas |
| `schema-allof-with-default` | `HIGH` | `allOf` wrapper around `$ref` for query enum with `default` |
| `schema-anyof-oneof-for-polymorphism` | `MEDIUM` | `anyOf`/`oneOf` for polymorphism |
| `schema-const-vs-enum-of-one` | `MEDIUM` | `const` instead of single-element `enum` |
| `schema-no-validation-keywords` | `MEDIUM` | No field-validation keywords in schemas |
| `schema-description-on-property` | `MEDIUM` | Descriptions on the specific property |
| `schema-no-default-duplication-in-description` | `LOW` | Don't duplicate `default` in `description` |
| `schema-openapi-310` | `MEDIUM` | OpenAPI 3.1.0 / JSON Schema 2020-12 for new specs |

## Naming (3)

| Slug | Severity | Rule |
| --- | --- | --- |
| `naming-camelcase-fields` | `HIGH` | `camelCase` for field and parameter names |
| `naming-preserve-baseline-enums` | `HIGH` | Don't rename baseline backend enum values |
| `naming-enum-value-style` | `MEDIUM` | `camelCase` for new string-enum values |

## IDs (1)

| Slug | Severity | Rule |
| --- | --- | --- |
| `ids-numeric-not-string` | `HIGH` | All ids are numeric, not strings |

## Security (4)

| Slug | Severity | Rule |
| --- | --- | --- |
| `security-bearer-required-declaration` | `HIGH` | Required bearer token declares `security` + `securitySchemes` |
| `security-do-not-add-security-clause-for-optional-auth` | `HIGH` | No `security` clause on optional-bearer public endpoints |
| `security-no-direct-role-checks` | `HIGH` | Don't hardcode direct role checks in protected methods |
| `security-roles-in-context-not-in-method` | `MEDIUM` | Keep the role model in shared context, not per-method |

## Auth / access (3)

| Slug | Severity | Rule |
| --- | --- | --- |
| `auth-ownership-based-access` | `HIGH` | Ownership/purchase access expressed as `403` via relation |
| `auth-public-read-private-write` | `MEDIUM` | Public read + private write on one path |
| `auth-redacted-fields-by-relation` | `MEDIUM` | Redacted public fields via `oneOf`/`anyOf`, not `null` |

## Wording (5)

| Slug | Severity | Rule |
| --- | --- | --- |
| `wording-no-internal-paths-leak` | `MEDIUM` | No local file/folder names leak into developer-facing text |
| `wording-description-not-method-level` | `LOW` | Detail in the most specific description (prose angle) |
| `wording-no-default-duplication` | `NIT` | Don't duplicate `default` in `description` (prose angle) |
| `wording-paragraph-empty-line` | `NIT` | A new description paragraph needs a blank line |
| `wording-laconic-style` | `NIT` | Concise, informative descriptions |

## Cosmetic YAML (3)

| Slug | Severity | Rule |
| --- | --- | --- |
| `cosmetic-yaml-indentation` | `NIT` | Consistent 2-space indentation, no tabs |
| `cosmetic-yaml-key-order` | `NIT` | Consistent key order for operations and schemas |
| `cosmetic-yaml-blank-lines` | `NIT` | Blank lines between major sections, no trailing whitespace |

## Using the registry

1. When authoring, consult the rules for the contract areas you touch; when reviewing, mark the applicable slugs as in-scope.
2. The review skill passes these slugs to per-review specialists and cites them in the findings table.
3. Profile patterns (in `patterns/profile/`) are layered on top; when a finding is covered by both a core and a profile pattern, cite the narrower profile slug.

## Overlapping angles

Some rules are covered from two angles on purpose:

- `schema-no-default-duplication-in-description` (`LOW`, structural) vs `wording-no-default-duplication` (`NIT`, prose).
- `schema-description-on-property` (`MEDIUM`, structural) vs `wording-description-not-method-level` (`LOW`, prose).
- `schema-self-contained-no-external-ref` (`BLOCKER`, structural `$ref`) vs `wording-no-internal-paths-leak` (`MEDIUM`, names leaking into prose).
