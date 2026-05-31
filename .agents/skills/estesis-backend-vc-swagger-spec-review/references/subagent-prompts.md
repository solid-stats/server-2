# Per-review subagent prompts

Templates for the specialists the main reviewer spawns each review. Each specialist is isolated: it doesn't see other reviews, the final report, or the other specialists. Prompts must be self-contained.

**Paths are placeholders.** The main reviewer substitutes them at spawn time:

- `<PROJECT_ROOT>` → the current working directory (the project being reviewed).
- `<CORE_PATTERNS>` → `.agents/skills/backend-vc-swagger-spec-write/patterns/core` (the universal core library).
- `<PROFILE_PATTERNS>` → `.agents/skills/backend-vc-swagger-spec-write/patterns/profile` (the bundled Estesis profile patterns).
- `<YAML_FILES>` → the exact list of stage YAML files to check.

Never hardcode a specific user's home path. Use `$HOME`/the placeholders so the prompt works in any checkout.

## Common prompt structure

Every specialist prompt contains:

1. **Project facts** — `<PROJECT_ROOT>`, the core normative summary `.agents/skills/backend-vc-swagger-spec-write/references/core-conventions.md`, the bundled Estesis profile at `.agents/skills/backend-vc-swagger-spec-write/references/estesis-profile.md`, the pattern paths, and the target YAML.
2. **Scope** — the aspect under review and the exact pattern slugs to apply.
3. **Out of scope** — what NOT to check (so the specialist stays in its lane).
4. **Method** — read core-conventions (relevant sections) and the profile, then the applicable pattern files, then the YAML, then cross-checks.
5. **Output format** — a structured findings table.
6. **Hard rules** — don't edit files, don't validate YAML externally, cite real `path:line`.

## Specialist output format

The specialist returns findings as one markdown table with fixed columns:

```md
| Severity | Location | Problem | Risk | Fix | Pattern |
| --- | --- | --- | --- | --- | --- |
```

`Severity` uses the shared emoji buckets 🔴 / 🟠 / 🟡 / 🔵 (`estesis-process-review-standards` §C; spec mapping BLOCKER→🔴, HIGH→🟠, MEDIUM→🟡, LOW & NIT→🔵). No `#` column — the main reviewer numbers continuously. `Pattern` is the slug or `—`.

If no findings: exactly one line, `No findings.`

The specialist does NOT write a summary, does NOT ask the user questions. If unsure, it either includes a finding with severity and a `(confirm)` note, or passes the question to the main reviewer in a trailing `Notes for main` section.

## Template 1. contract-checker

```
You are a per-review specialist for the `backend-vc-swagger-spec-review` skill. Scope: REQUEST / RESPONSE / ERROR / SECURITY contracts.

Project root: <PROJECT_ROOT>
Core conventions: .agents/skills/backend-vc-swagger-spec-write/references/core-conventions.md
Estesis profile (bundled): .agents/skills/backend-vc-swagger-spec-write/references/estesis-profile.md (exact error shape, output language, any multipart-exception service) and .agents/skills/backend-vc-swagger-spec-write/patterns/profile/INDEX.md

Pattern files you MUST consult:
- <CORE_PATTERNS>/request-*.md
- <CORE_PATTERNS>/response-*.md
- <CORE_PATTERNS>/errors-*.md
- <CORE_PATTERNS>/security-*.md
- <CORE_PATTERNS>/auth-*.md
- <CORE_PATTERNS>/ids-numeric-not-string.md
- any <PROFILE_PATTERNS>/*.md the main reviewer lists for security/auth specifics

YAML files to check:
- <YAML_FILES>

Iteration folder: <PROJECT_ROOT>/<iteration>. Also read its supporting docs (shared context, change map, change log) if present.

What to find:
- Pagination request shape (limit/offset, defaults). Pagination response envelope { data, limit, offset, total }.
- Status codes 200 vs 201, 204 for empty, never declaring statuses "just in case".
- Required vs optional bearer token; no security clause on optional-auth public endpoints.
- Error codes only when really emitted; edge cases in the specific status description, not method-level. Error payload uses the profile-defined shared shape.
- Numeric ids; camelCase field names.
- Optional query parameters: defaults per core conventions (default: [] for lists with "empty == all", anyOf with null for non-list non-string without a business default, allOf wrapper for string-enum query with default).
- multipart/form-data: flat fields only, except the profile's multipart-exception service.

Out of scope:
- Wording style, enum value naming style, schema structure beyond contract, iteration folder structure, feature-level patterns.

Method:
1. Read the relevant core-conventions sections and the profile.
2. Read all listed pattern files.
3. Read the iteration's supporting docs.
4. Read each target YAML.
5. Emit one finding row per violation.

Output: a markdown table with columns Severity | Location | Problem | Risk | Fix | Pattern. Sorted by severity then path:line. No commentary outside the table except an optional `Notes for main` section.

Hard rules:
- Cite real path:line (use grep -n).
- Do not modify files. Read-only.
- Do not invent backend behavior, roles, statuses, enum values.
- Do not require extra statuses "just in case".
- Severity buckets: 🔴 / 🟠 / 🟡 / 🔵 (BLOCKER→🔴, HIGH→🟠, MEDIUM→🟡, LOW & NIT→🔵).
```

## Template 2. structure-checker

Scope: schema design, `$ref` usage, LSP, `anyOf`/`oneOf`/`const`, duplicate fields across schemas, description placement at the structural level.

Pattern files: `<CORE_PATTERNS>/schema-*.md`.

Out of scope: prose/wording, enum value naming style, request/response contract semantics (contract-checker), iteration structure.

Note: structure-checker and contract-checker can overlap on `anyOf`-nullability — structure-checker owns "is nullability formed correctly", contract-checker owns "is it applied correctly to a specific request param". Otherwise same common structure as Template 1.

## Template 3. naming-checker

Scope: camelCase for fields and parameters, enum value style, baseline consistency.

Pattern files: `<CORE_PATTERNS>/naming-*.md`, `<CORE_PATTERNS>/ids-numeric-not-string.md` (naming angle only).

Note: on a suspected baseline conflict, check the neighboring iterations referenced by the change map. Don't propose renaming existing backend/domain enum values.

## Template 4. wording-checker

Scope: output language and where foreign-language terms are allowed; the profile's wording/replacement registry; description placement and paragraph breaks; default duplication.

Pattern files: `<CORE_PATTERNS>/wording-*.md` and the profile's locale wording patterns `<PROFILE_PATTERNS>/wording-*.md`.

Note: most findings are LOW or NIT. Group identical violations. The output-language and term-registry rules are profile-defined — read `.agents/skills/backend-vc-swagger-spec-write/references/wording-registry.md`.

## Template 5. consistency-checker

Scope: cross-iteration consistency — the spec falls out of the established style of prior iterations.

Pattern files: `<PROFILE_PATTERNS>/feature-*.md` (recurring features), the profile `patterns/INDEX.md` (iteration map), and the relevant neighboring `<iteration>` supporting docs.

Note: cite which iteration did it differently and why "different" is a violation here. Severity usually MEDIUM, sometimes HIGH, rarely LOW.

## Template 6. cosmetic-checker

Scope: indentation, key order, line length, blank lines, quoting.

Pattern files: `<CORE_PATTERNS>/cosmetic-*.md`.

Note: severity is always NIT (rare exception when the YAML breaks). Group aggressively: one row per violation type listing the locations.

## Template 7. feature-<X>-checker (as needed)

Spawned when a specific recurring feature is recognized in the iteration (drafts, publish-lifecycle, calendar-events, multipart-uploads, ownership-and-roles, etc.).

Pattern files: `<PROFILE_PATTERNS>/feature-<X>.md` plus its `[[slug]]` relations.

Note: checks that the feature's specifics hold (e.g. for drafts — that a draft is a separate entity, the status lifecycle matches, the required endpoints exist).

## What the main reviewer does with the results

1. Collect the specialists' tables.
2. Merge and dedupe by `path:line + problem` (the same finding from multiple specialists → one row).
3. Number `#`.
4. Apply `output-format.md`.
5. If a specialist returned `Notes for main`, resolve the escalation or raise an additional question.
