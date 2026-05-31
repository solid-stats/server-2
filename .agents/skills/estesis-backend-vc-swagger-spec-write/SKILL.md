---
name: estesis-backend-vc-swagger-spec-write
description: >
  Authors OpenAPI specifications as complete, developer-ready contracts. Use when creating,
  writing, or editing an OpenAPI/Swagger spec, an API endpoint contract, or a request/response
  schema. Produces self-contained specs a developer can implement without follow-up questions.
  Pairs with backend-vc-swagger-spec-review, which audits specs against the same shared pattern library.
  Triggers: "write spec", "author spec", "create OpenAPI", "write postanovka", "describe endpoint",
  "напиши постановку", "опиши API", "напиши спецификацию", "создай OpenAPI", "опиши эндпоинт".
---

# Authoring OpenAPI specifications

This skill turns a feature request into a precise, developer-ready OpenAPI specification — a spec complete enough to implement without follow-up questions. It carries a universal **core** of OpenAPI conventions, plus the **Estesis profile**: Russian-language prose, domain patterns, iteration workflow, and project security rules. All rules are bundled in the skill.

The companion `backend-vc-swagger-spec-review` skill audits specs against the same pattern library. Author by these rules; review checks by these rules. Keep them in sync.

## Core principle

A spec is done when a developer can build the endpoint without asking anything about roles, access, states, edge cases, payloads, or compatibility. If information is missing, ask clarifying questions before writing. Never invent contract behavior.

## Mandatory reading on first run

1. `references/core-conventions.md` — universal OpenAPI contract rules (versioning, nullability, pagination, status codes, naming, ids, errors, security, schema design, descriptions).
2. `references/project-profile-loading.md` — the bundled Estesis profile: output language, error shape, folder workflow, registry/docs locations, wording registry, domain patterns.
3. `patterns/INDEX.md` — map of the full pattern library (core + Estesis profile); each pattern is one rule with detection cues and examples.
4. `templates/` — a convention-correct OpenAPI skeleton to start from.

**Load the profile (step 2) before writing anything.** It sets the output language, error shape, domain patterns, and where the spec file goes.

## Authoring flow on one page

1. **Clarify first.** Scan for ambiguity in goal, scope, services, roles, access, compatibility, payload/response, edge cases, ordering, and naming. If a plausible answer would change the contract, ask before writing. Group questions; don't guess to save time.
2. **Load context.** Project profile; `registry/services/<svc>/SWAGGER.md` (deployed swagger URL) and the service's local source repo; product/acceptance docs; existing baselines and specs this change touches.
3. **Locate.** Decide where the spec lives, following the profile's folder workflow.
4. **Design the contract.** Apply core conventions + core patterns + profile patterns. Prefer `anyOf`/`oneOf`, self-contained schemas, and Liskov substitutability when extending.
5. **Write descriptions in the most specific place** (property / parameter / status response), in the profile's output language.
6. **Record decisions** per the profile's change-log convention so they survive later edits.
7. **Self-check** against `backend-vc-swagger-spec-review` rules before handing off.

## Hard rules

- **Clarifying questions:** scan for ambiguity in goal, scope, services, roles, access, payload/response, edge cases, stage ordering, and naming. If a different reasonable answer would change the contract, ask before writing. Use a questions UI (AskUserQuestion, Codex Questions, or equivalent) if available — it's easier to answer than plain text. Max 3 questions per turn.
- **Language:** human-readable spec text (descriptions, summaries) in Russian; API identifiers (paths, field names, enum values, `operationId`, `$ref`, HTTP statuses) in English.
- Don't invent backend behavior, roles, statuses, enum values, or business rules without grounding in the request, registry, code, or profile.
- Don't add fields, parameters, or response statuses "just in case".
- Don't add field-validation keywords to schemas.
- Keep specs self-contained: no external `$ref` to planning files; no bare local file/folder names in developer-facing text (reference another repo file from the contract only by a full URL where the profile allows it).
- Don't create branches or commits, and don't validate YAML with external tools, unless explicitly asked.

## When to reload context

- Touching a service you haven't loaded → read its `registry` swagger link and local source.
- Unsure about a rule → open the specific pattern file (`patterns/core/<slug>.md` or `patterns/profile/<slug>.md`).
