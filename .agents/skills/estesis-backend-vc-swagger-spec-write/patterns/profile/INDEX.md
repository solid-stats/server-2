# Estesis profile pattern registry

Estesis-specific and locale patterns that extend the universal core library (`backend-vc-swagger-spec-write/patterns/core/`). Bundled in the `backend-vc-swagger-spec-write` skill. Pattern bodies are in Russian to match the team and the specs being authored/reviewed; the core library stays English.

`Severity` is `severity_when_violated`. A slug equals its file name without `.md`. When a finding is covered by both a core and a profile pattern, cite the narrower profile slug. A profile pattern overrides a core rule only when it says so explicitly.

Config that these patterns rely on lives in [`../../references/estesis-profile.md`](../../references/estesis-profile.md) and [`../../references/wording-registry.md`](../../references/wording-registry.md).

## Domain features (15)

Apply a feature pattern when its business feature is recognized in the iteration.

| Slug | Severity | About |
| --- | --- | --- |
| `feature-drafts-flow` | `HIGH` | Moderated drafts: a separate entity with `pending → accepted/rejected` lifecycle |
| `feature-publish-lifecycle` | `HIGH` | Published source immutability and unpublish-as-recreate |
| `feature-resource-ownership` | `HIGH` | Owner vs admin permission check, ownership errors |
| `feature-purchased-content` | `HIGH` | Direct purchase and shared purchased-resources registry |
| `feature-shop-vs-studio` | `MEDIUM` | Shop, library, and studio are three separate surfaces |
| `feature-calendar-generic-events` | `HIGH` | Generic event contract of the calendar service |
| `feature-multipart-uploads` | `HIGH` | Multipart/form-data with flat fields only (domain view) |
| `feature-pagination-list-endpoints` | `MEDIUM` | Cross-cutting paginated list endpoints (domain view) |
| `feature-permissions-endpoints` | `HIGH` | Permission check via mainBackend `/api/v3/permissions/check` |
| `feature-appeals-flow` | `HIGH` | Appeals service contract and outbox-driven sync |
| `feature-baseline-changes` | `HIGH` | Changing a baseline via a new iteration with `CHANGES.md` + `Supersedes` |
| `feature-music-labels` | `HIGH` | Music labels: baseline + licensing + display drafts |
| `feature-exercises-lessons-programs` | `HIGH` | Three resource types in the resources service — shared iteration shape |
| `feature-karaoke-queue` | `MEDIUM` | One active queue per user, ordered songs, SSE events |
| `feature-voice-range` | `MEDIUM` | Atomic `voiceRange` object with `notesRange` and `voiceTimbreTypes` |

## Iteration workflow (13)

How the `changes/XXX_name` iteration structure must hold. See [`../../references/estesis-profile.md`](../../references/estesis-profile.md) "Folder and iteration workflow".

| Slug | Severity | Rule |
| --- | --- | --- |
| `iteration-no-rewriting-old-folders` | `HIGH` | Don't rewrite old iteration folders — create a new one |
| `iteration-changes-md-required` | `HIGH` | `CHANGES.md` required for agreed contract changes |
| `iteration-changes-md-supersedes-no-silent-revert` | `HIGH` | Active `CHANGES.md` decisions aren't reverted without explicit supersede |
| `iteration-acceptance-criteria-coverage` | `HIGH` | Don't lose acceptance criteria in stage YAML |
| `iteration-docs-cross-check` | `HIGH` | Cross-check with `docs/`, especially `product-acceptance-criteria.md` |
| `iteration-folder-naming` | `MEDIUM` | Folder name = global 3-digit contiguous index |
| `iteration-stage-numbering` | `MEDIUM` | Stage numbering within an iteration |
| `iteration-parallel-stages-xx-yy` | `MEDIUM` | Parallel `XX_YY` sub-stages must be independent |
| `iteration-index-md-content` | `MEDIUM` | Required `INDEX.md` content |
| `iteration-context-md-content` | `MEDIUM` | Required `CONTEXT.md` content |
| `iteration-changed-baselines-link` | `MEDIUM` | `Changed Baselines` link new iterations to baseline contracts |
| `iteration-depends-on-not-numeric` | `MEDIUM` | `Depends On` matters more than the folder number |
| `iteration-registry-swagger-link` | `MEDIUM` | Registry `SWAGGER.md` required per affected service |

## Locale and wording (6)

Russian-language house rules, plus developer-facing wording conventions. See [`../../references/wording-registry.md`](../../references/wording-registry.md).

| Slug | Severity | Rule |
| --- | --- | --- |
| `wording-russian-default` | `LOW` | Human-readable text defaults to Russian |
| `wording-replacement-registry` | `LOW` | Mandatory term replacements in human-readable text |
| `wording-service-names` | `LOW` | Service names in Russian in human-readable text |
| `wording-english-where-allowed` | `MEDIUM` | Where English stays mandatory |
| `wording-studio-lowercase` | `NIT` | "студия" lowercase in ordinary text |
| `wording-spec-file-links-gitlab-url` | `MEDIUM` | File references in the contract use a full GitLab blob URL (overrides core `wording-no-internal-paths-leak`) |

## Project security / auth (2)

| Slug | Severity | Rule |
| --- | --- | --- |
| `security-permission-driven-endpoints` | `HIGH` | Permission check via mainBackend `/api/v3/permissions/check` payload in `403` |
| `auth-anonymous-shop-response` | `HIGH` | Field behavior on an anonymous request to a public shop endpoint |

## Adding patterns

New pattern → add the file using the core `_TEMPLATE.md` and record it here. Slugs are stable; reviews reference them. Don't rename or delete existing slugs.
