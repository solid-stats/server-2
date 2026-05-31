# backend-vc-swagger-spec-write — design

Source of truth for this skill's structure and behavior. Change only in step with the implementation.

## Goal

Turn a feature request into a developer-ready OpenAPI specification that can be implemented without follow-up questions. The skill bundles the universal OpenAPI conventions, a shared pattern library, and the Estesis project profile.

## Two skills, one pattern library

`backend-vc-swagger-spec-write` and `backend-vc-swagger-spec-review` are peers that share one set of rules. This skill is the canonical home of the **core** pattern library and the bundled **Estesis profile**; `backend-vc-swagger-spec-review` reads both from here by a project-relative path. This guarantees "how we write" and "what we check" never drift.

When both skills are installed into a project (via `npx skills`), they sit side by side under the project's `.agents/skills/`:

```
.agents/skills/
├── backend-vc-swagger-spec-write/        ← canonical rules + core patterns + bundled Estesis profile
│   ├── SKILL.md
│   ├── DESIGN.md                         (this file)
│   ├── CHANGELOG.md
│   ├── workflows/write-spec.md
│   ├── references/
│   │   ├── core-conventions.md           universal contract rules (normative summary)
│   │   ├── project-profile-loading.md    how the bundled profile is loaded
│   │   ├── estesis-profile.md            bundled Estesis profile (language, error shape, workflow)
│   │   └── wording-registry.md           Russian house wording rules
│   ├── templates/
│   │   └── openapi-skeleton.yaml         convention-correct starting point
│   └── patterns/
│       ├── _TEMPLATE.md
│       ├── INDEX.md                      core pattern map
│       ├── core/<slug>.md                one universal rule per file
│       └── profile/<slug>.md             Estesis-specific rules (+ profile/INDEX.md)
└── backend-vc-swagger-spec-review/       ← reads ../backend-vc-swagger-spec-write/{references,patterns}
```

The review skill reaches the rules via the project-relative path `.agents/skills/backend-vc-swagger-spec-write/...`, so both skills must be installed together for review to function.

## Core vs profile

- **Core (universal, English):** versioning, nullability, pagination, sorting/search, optional-parameter defaults, status codes, ids, naming, schema design, descriptions, security/access, generic errors, multipart. Any team can adopt these unchanged.
- **Profile (Estesis, bundled, Russian):** output language, domain feature shapes, the exact error-payload fields, locale/wording registries, the folder/iteration workflow, service registry layout, multipart exception service. Bundled in this skill at `references/estesis-profile.md`, `references/wording-registry.md`, and `patterns/profile/` — there is no separate `spec-profile/` directory in the consuming project.

A profile pattern may override a core rule, but only explicitly. The core never depends on a specific project; another team adopting these skills would supply its own profile layer in place of the Estesis one.

## Pattern files

- One file = one clearly bounded rule. Slug = file name without `.md`.
- Frontmatter: `name`, `title`, `category`, `kind`, `severity_when_violated`, `applies_to`, `related`, `source`. Body: rule, when it applies, how to detect a violation, severity/risk, good example, anti-example, related patterns. Quote any frontmatter value that contains a colon, a leading backtick, or other YAML-reserved characters so the block parses as strict YAML.
- Examples cite a real spec with `path:line` rather than copying large fragments. When no real violation is on record, use a minimal synthetic anti-example.
- Slugs are stable: reviews and specs reference them. Add patterns; don't rename or delete existing slugs.

## Sharing

The `estesis-skills` repository is shared across teams. Both skills ship together from this repo, so the project-relative reference from `backend-vc-swagger-spec-review` to `backend-vc-swagger-spec-write/{references,patterns}` holds in any checkout where both are installed under `.agents/skills/`. The core stays free of project-specific content; the Estesis specifics live entirely in the bundled profile layer.
