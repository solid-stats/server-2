# Workflow: run-review

The canonical review process. The main reviewer runs the steps in order. Steps 3 and 4 run in parallel. Step 5 is the synchronous aggregation point.

## Step 0. Confirm the input

- The user must point to a specific iteration/folder or specific stage YAML files.
- If the entry point is ambiguous, ask before reading. Don't scan random folders.
- If the user asked you to fix what you find, record that explicitly. Review is read-only by default.

## Step 1. Collect required context

Read:

1. The target stage YAML (everything the user pointed to, plus other YAML in the same iteration if they affect scope).
2. The iteration's supporting docs (shared context, change map, change log) per the profile's folder workflow.
3. The change log, if present — its active decisions are mandatory to honor.
4. From the change map: for each dependency, supersede, or changed-baseline link, read the corresponding supporting docs of the related iterations. Read their YAML selectively, only when compatibility is in scope.
5. `registry/services/<service>/SWAGGER.md` for each affected service; resolve local source via `registry/local-paths.json`. An absent/empty file → record as an assumption, don't invent.
6. Relevant product/acceptance docs the profile points to, and saved external contracts when the spec uses or bypasses an existing external service.
7. The microservice code in the workspace, when available. If not, record an assumption.

Also load the rule layers:

- Core: `.agents/skills/backend-vc-swagger-spec-write/patterns/core/INDEX.md` and `references/core-conventions.md`.
- Profile (bundled): `.agents/skills/backend-vc-swagger-spec-write/references/estesis-profile.md`, `references/wording-registry.md`, `patterns/profile/INDEX.md`.

Don't assert a spec is correct if any required source went unread.

## Step 2. Determine review scope

State internally (not to the user):

- Affected services (from the change map and YAML).
- Iteration type: baseline / addition / supersedes / cleanup.
- Applicable feature patterns from the profile `INDEX.md`.
- Applicable core category patterns (request, response, schema, naming, ids, errors, security, auth, wording, cosmetic).
- Special risks: cross-iteration consistency, backward compatibility, baseline migration, security.

Record the list of pattern slugs to be checked. It feeds the specialist prompts.

## Step 3. Spawn specialists (parallel)

Run as many per-review agents in parallel as makes sense. Base set:

- `contract-checker` — request/response/error/security contract.
- `structure-checker` — schema structure, `$ref`, LSP, `anyOf`/`oneOf`/`const`, duplicate fields, description placement.
- `naming-checker` — camelCase, enum style, baseline consistency.
- `wording-checker` — output language, locale wording registry, default duplication, paragraph breaks.
- `consistency-checker` — cross-iteration consistency (does the spec fall out of the established style).
- `cosmetic-checker` — indentation, key order, line length. Low priority; can fold into naming/wording.
- `feature-<X>` — for each relevant profile feature pattern: drafts, lifecycle, calendar-events, multipart-uploads, ownership-and-roles, etc.

Prompt templates are in `references/subagent-prompts.md`. Every prompt must contain: the exact pattern slugs (with their absolute or project-relative paths), the exact YAML files to check, the required structured findings format, and an out-of-scope list.

Specialists return findings in a strict table format suitable for aggregation. Don't let them write the final user report.

## Step 4. Cross-cutting checks by the main reviewer

In parallel with specialists, the main reviewer personally checks:

- Goal coverage: the stage YAML actually delivers the iteration goal.
- Synchronization of the iteration's supporting docs with the YAML.
- Preservation of active change-log decisions. Any silent revert without an explicit supersede is a BLOCKER.
- Stage ordering: each stage assumes only earlier stages of the same iteration; parallel sub-stages are genuinely independent.
- Cross-service links (from the change map).
- Acceptance criteria from the product docs that fall in scope.
- Conformance to a recorded external contract, when the spec touches one.
- Developer readiness: after reading the spec, a developer can implement it without further questions about roles, access, states, edge cases, payloads, or compatibility.

## Step 5. Aggregate findings

1. Gather findings from all specialists and your own checks.
2. Dedupe: the same problem seen from multiple aspects becomes one entry; list all locations, keep the primary line.
3. Group identical NIT/LOW into one finding listing the locations.
4. Never drop unique BLOCKER/HIGH.
5. Sort into the shared buckets 🔴 → 🟠 → 🟡 → 🔵 (`estesis-process-review-standards` §C); within a bucket, by `path:line`.
6. Number findings continuously from 1 to N across all buckets — the count does not reset per bucket.
7. Attach the pattern slug to each finding as its convention reference where one applies; prefer the narrower profile slug when both a core and a profile pattern cover the finding.

## Step 6. Final report

Use `references/output-format.md` together with `estesis-process-review-standards` §D–§E. Write it in the profile's output language. Base structure: severity buckets (🔴 → 🟠 → 🟡 → 🔵) with continuous numbering → open questions (only if blocking) → checked context → verdict (APPROVE / REQUEST CHANGES / BLOCK) with the severity count. No "Good" section. Don't hide blockers in the verdict or open questions; don't open with a general impression.

## Step 7. Close

- If fixes were requested, propose or apply them as a separate step, preserving the finding numbering.
- If not, leave the spec and tell the user how to reference findings (`finding #N`).
- If the review surfaced problems that need a new iteration, propose that explicitly; don't rewrite old iterations.
