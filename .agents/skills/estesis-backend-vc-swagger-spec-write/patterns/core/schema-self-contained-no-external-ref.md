---
name: schema-self-contained-no-external-ref
title: The spec is self-contained, no external $ref to files the developer may not have
category: schema
kind: core
severity_when_violated: BLOCKER
applies_to:
  - any developer-facing OpenAPI spec
  - schemas tempting to reuse via `$ref` into neighboring files
related:
  - schema-ref-and-lsp
source:
  - core-conventions.md
  - empirical
---

# The spec is self-contained, no external `$ref` to files the developer may not have

## Rule

Do not name local files as part of the contract, and do not use external `$ref` that points at other files. The developer may not have those files; every schema, field, edge case, and constraint must be described self-contained within the current spec.

## When it applies

- Temptation to factor a shared schema into another file and reference it via `$ref: '../other/file.yaml#/components/...'`.
- A field description that points the reader at a file name instead of describing the contract here.
- A method that references another service's endpoint as "as described in file X" instead of stating the contract inline.

## How to detect a violation

- Search for any `$ref:` whose value contains a relative path (`./`, `../`) or a file name with an extension — every match is a violation.
- A `description` that mentions a file name (`see 01_foo.yaml`) as the place where a schema or field is defined.
- Cross-file checks: confirm every `$ref` resolves to `#/components/...` inside the same document.

## Severity and risk

BLOCKER: the developer receives a single spec file. If it references another file they cannot access, the contract is unusable. External `$ref` also breaks Swagger UI and most code generators, which do not resolve cross-file references by relative path from arbitrary directories.

## Good example

```yaml
components:
  schemas:
    Lesson:
      type: object
      required: [id, title]
      properties:
        id: { type: integer }
        title: { type: string }
```

Everything the schema needs is defined inline; any reuse is via `$ref: '#/components/schemas/...'` within the same file.

## Anti-example

```yaml
components:
  schemas:
    Lesson:
      $ref: '../purchased-content/01_content.yaml#/components/schemas/ShortLesson'
```

Fix: copy `ShortLesson` in full into the current spec so the contract is equivalent and self-contained.

## Related patterns

- [[schema-ref-and-lsp]] — internal `$ref` is correct and encouraged, but only within the same file.

## Reviewer notes

- Mentioning another service's name and path endpoint in a `description` (e.g. "calls `POST /api/v1/events/bulk`") is allowed — that is part of the API contract, not a cross-file reference.
- If two related specs genuinely duplicate one schema, that is acceptable: each file must stay self-contained. Consistency is maintained through shared context, not through cross-file `$ref`.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/021_resource_voice_range/01_resources_voice_range.yaml` — all 27 `$ref` values resolve to `#/components/schemas/...` within the same file; no external paths or sibling-file references appear.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml` — large multi-endpoint spec where every schema (`PurchasedResourceHistorySortBy`, `SortDir`, `ResourceAuthor` variants, etc.) is defined inline in `components/schemas`; no cross-file `$ref` is used despite reusing author shapes that appear in other iteration files.
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — spec references paths from other services in `description` text (allowed) but contains zero `$ref` values pointing at other files.
