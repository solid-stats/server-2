# Estesis spec-authoring profile

This profile configures the `backend-vc-swagger-spec-write` and `backend-vc-swagger-spec-review` skills for the Estesis project. It is bundled inside the write skill — there is no separate `spec-profile/` directory to load from the project. Universal OpenAPI rules come from the skills' core library (`references/core-conventions.md` and `patterns/core/`); this file adds everything Estesis-specific and supplies the values the core marks "profile-defined".

Domain and locale patterns live in `patterns/` (see `patterns/INDEX.md`). They extend the core; where one overrides a core rule it says so explicitly.

## Output language

- Developer-facing prose (`title`, `summary`, `description`, markdown, comments) is written in **Russian**.
- English stays only where the contract must be technically exact: paths, `operationId`, field names, enum values, `$ref`, HTTP/status semantics, payload examples, OpenAPI `tags`.
- Avoid unnecessary English in human-readable text. Write service names in Russian prose — "сервис Календаря", "сервис Ресурсов", "сервис Авторизации"; use service ids (`calendar`, `resources`, `auth`) only in code, paths, registry links, `$ref`, and file names.
- Write the domain word "студия" lowercase in ordinary prose.
- Mandatory term-replacement registry: see `wording-registry.md`.

## Review report labels

When `backend-vc-swagger-spec-review` writes its report, render it in Russian with these labels:

- Findings table headers: `# | Severity | Где | Проблема | Риск | Как исправить | Pattern`
- Section titles: `Findings`, `Детали по findings`, `Open Questions`, `Проверенный Контекст`, `Итог`
- The no-findings line: `Блокирующих и существенных проблем не найдено.`

## Shared error payload shape

The project's single error shape (fills the core `errors-shared-shape` rule). All four fields required:

```yaml
type: object
required: [httpStatus, errorCode, message, details]
properties:
  httpStatus: { type: integer }
  errorCode: { type: string, enum: [<snake_case codes>] }
  message: { type: string }
  details: { type: object }
```

`errorCode` values are an existing baseline enum in `snake_case` (e.g. `invalid_status`, `status_change_not_allowed`) — do not restyle them to camelCase (see `patterns` and the core `naming-preserve-baseline-enums`). Baseline defined in `changes/001_shared_status_errors`.

## Multipart exception service

`mainBackend` may carry richer `multipart/form-data` bodies (arrays, nested objects, JSON via `$ref`). Every other service is restricted to flat fields only, per the core `request-multipart-flat-fields` rule.

## Authorization model

- Permission-driven endpoints check access via the `mainBackend` endpoint `/api/v3/permissions/check`; declare the expected payload in the `403` response. See `patterns/security-permission-driven-endpoints.md` and `patterns/feature-permissions-endpoints.md`.
- Do not hardcode direct `student`/`teacher`/`admin` role checks into protected methods (core `security-no-direct-role-checks`).
- Describe the role model in the iteration's shared context (`CONTEXT.md`), not per-method (core `security-roles-in-context-not-in-method`).
- Ownership/purchase access is expressed as `403` via the relation, without `permissions/check` (core `auth-ownership-based-access`).

## Folder and iteration workflow

Specs live in `changes/XXX_name/`, one immutable business iteration per folder. Related YAML for different services can share a folder.

- `XXX` is a global 3-digit historical index across all of `changes/`, strictly contiguous, incremented by exactly 1, no gaps. It reflects historical order, not dependency order.
- A folder contains: `CONTEXT.md` (shared knowledge for the iteration's stage YAML — roles, business rules, shared schemas, stage numbering), `INDEX.md` (change map: goal, touched services, registry links, depends-on, supersedes, stage map, changed baselines), `CHANGES.md` (log of agreed contract decisions), and stage YAML.
- Stage YAML: `XX_<scope>_<slug>.yaml`. Parallel sub-stages: `XX_YY_<scope>_<slug>.yaml` (same `XX`, different `YY`, mutually independent). `<scope>` is usually the service name; use `shared` for cross-service schemas/examples.
- Each stage assumes all earlier stages of the same iteration are implemented.
- Do not rewrite old iteration folders. If a new spec changes an old one, create a new numbered folder and link it via `INDEX.md` (`Depends On`, `Supersedes`, `Changed Baselines`). `Depends On` matters more than the folder number.
- Record every agreed change in the iteration's `CHANGES.md` before/with editing stage YAML; mark superseded decisions explicitly, never silently revert.
- Root `CATALOG.md` is the navigation across iterations and services.
- The required content of `CONTEXT.md` / `INDEX.md` / `CHANGES.md` and stage numbering is defined by the `iteration-*` patterns in `patterns/`.
- Keep the developer-facing OpenAPI contract free of bare local file/folder names, iteration folders, and stage YAML names, and never use external `$ref` to such files (core `schema-self-contained-no-external-ref`). To point the contract at another repo file, use a full GitLab blob URL `https://git.estesis.tech/VocalClub/swagger/-/blob/master/<path>` — see profile `wording-spec-file-links-gitlab-url`. Supporting docs (`INDEX.md` / `CONTEXT.md` / `CHANGES.md`) may reference files freely, including bare local paths.

## Registry and source code

- `registry/services/<service>/SWAGGER.md` holds the deployed swagger URL. Absent/empty → the service isn't deployed yet or the link is unknown; treat as an assumption, don't invent.
- Resolve a service's local source repo via `registry/local-paths.json` (gitignored, per-user) using `registry/local-paths.example.json` (committed template + repo URLs). Read the code when available.
- `docs/` holds source product and technical context. Always cross-check `docs/product-acceptance-criteria.md` for criteria in scope. `docs/calendar-service-openapi.json` fixes the current calendar-service contract; honor it when a spec uses or bypasses that service.

## Behavioral defaults

- Ask clarifying questions by default before producing a contract; use the Codex Questions UI, max 3 grouped questions at a time.
- Do not create branches or commits. Do not validate YAML with external tools.
