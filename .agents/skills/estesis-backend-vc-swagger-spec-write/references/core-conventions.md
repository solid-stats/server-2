# Core OpenAPI conventions

The universal contract rules this skill enforces. They are independent of any domain or language. Project-specific overrides and additions live in the project profile (see `project-profile-loading.md`); where a rule says "profile-defined", read the exact value from the loaded profile.

Each rule maps to a pattern in `patterns/core/` with detection cues and examples. This file is the normative summary; the pattern files are the detail.

## Versioning and JSON Schema

- New specs use `openapi: 3.1.0` and JSON Schema 2020-12 style.
- Do not introduce `nullable: true`. Express nullable values with `anyOf` including `{ type: 'null' }`.
- For a query enum schema that needs a `default`, wrap the `$ref` in `allOf` rather than placing `default` as a sibling of `$ref` (a sibling `$ref` + `default` makes parsers reject `Property $ref is not allowed`).
- Do not rewrite older specs to a newer version just for the version, unless explicitly asked.

## Pagination

- Page through collections with `limit` and `offset` query parameters — never `page`/`pageSize`/`cursor`.
- Any endpoint that accepts `limit`/`offset` returns an envelope object with exactly four required fields:

  ```json
  { "data": [ ], "limit": 10, "offset": 0, "total": 100 }
  ```

  `data` is an array; `limit`, `offset`, `total` are integers. Do not return a bare array, do not move pagination into headers, do not rename fields (`items`/`count`/`nextCursor`/`hasMore`).
- `offset` beyond `total` returns the same object with `data: []`, not a 404.

## Sorting and search

- Sort with `sortBy` (string enum of allowed fields) and `sortDir` (`asc` | `desc`).
- Search with a single generic `search` parameter. Add field-specific search only when there is a real need to target one field.

## Optional query parameters

- **List** parameter: `default: []`, and state in the description that an empty list means "all elements, filter not applied".
- **Non-list with a business default**: put the default in `schema.default`.
- **String or string-enum**: do not add a `null` variant or `default: null` unless `null` carries distinct business meaning.
- **Other non-list without a business default**: `anyOf` with the main type and `{ type: 'null' }`, plus `default: null`.

## Status codes

- Non-empty successful response: `200` (not `201`).
- Empty successful response: `204`.
- Declare only statuses the API can actually emit. Never add a status "just in case".
- Describe error conditions and edge cases in the `description` of the specific status response, not at method or file level.

## Identifiers and naming

- All ids are numeric, not strings.
- Field and parameter names are `camelCase`.
- New string-enum values are `camelCase` (single-word values are plain lowercase).
- Do not rename existing backend/domain enum values or external dictionaries for style. Preserve baseline naming.

## Schema design

- Use `anyOf`/`oneOf` for polymorphism rather than a discriminating enum + optional fields.
- For a property that allows exactly one literal value, use `const`, not a single-element `enum`.
- Do not add field-validation keywords (`minLength`, `maxLength`, `pattern`, `minimum`, `format` for validation, etc.). Schemas describe shape, not validation.
- When extending a schema, keep Liskov substitutability: the extended schema must remain usable wherever the base is expected. State explicitly in the extension's `description` which fields it adds.
- Keep schemas self-contained. No external `$ref` into planning files, stage files, or anything the developer may not have. All needed schemas, fields, edge cases, and constraints must be fully described in the current document.

## Descriptions

- Put each detail in the most specific place: field detail on the schema property; query/path detail on the parameter; error/edge-case detail on the specific status response. Don't hoist field/parameter/status detail to the whole-method or whole-file description unless it is genuinely shared context.
- In a `description: |` block, a new paragraph in the rendered UI requires a blank line (two newlines). A single newline is only source-file readability and must not imply a new paragraph.
- Don't duplicate a value in the description if the schema already states it via `default`/`enum`/type.
- Keep prose concise and informative; cut filler.

## Security and access

- An endpoint that **requires** a bearer token declares both a `security` clause and the matching `securitySchemes`.
- An endpoint with an **optional** bearer token (public, but behaves differently when authenticated) gets **no** `security` clause — not `security: [{}]`, not `security: [{ bearerAuth: [] }]`. Either makes Swagger UI present it as auth-required. Describe the optional-token behavior in the method/parameter/field description instead.
- Do not hardcode direct role checks (e.g. `student`/`teacher`/`admin`) into protected methods. Express authorization through permission checks or ownership relations. Keep the role model in shared context, not duplicated in each method description.

## Errors

- Use one shared error-payload shape across the API. The exact fields are **profile-defined** (commonly `httpStatus` / `errorCode` / `message` / `details`).
- `401` = no/invalid token; `403` = authenticated but lacking rights. Keep them distinct.
- `404` = resource does not exist; also use `404` in place of `403` when revealing existence would leak information.
- `409` = business state conflict (duplicate, illegal transition, already exists).

## Multipart

- For `multipart/form-data`, send only flat fields: `string`, `integer`, `number` (`float`/`double` ok), `boolean`, `null`, or a file (`type: string`, `format: binary`). No arrays, nested objects, or JSON structures via `$ref` in form-data. If you need complex data, use a JSON endpoint, a separate method, or separate flat fields.
- A profile may grant one "main backend"-type service an exception that allows richer multipart bodies; this exception is **profile-defined**.
