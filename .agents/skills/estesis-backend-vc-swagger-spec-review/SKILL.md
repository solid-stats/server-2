---
name: estesis-backend-vc-swagger-spec-review
description: >
  Pedantic review of OpenAPI specifications against a shared pattern library. Use when asked
  to review, audit, validate, or check a spec or stage YAML file. Read-only by default —
  does not edit files, create branches, or commit unless explicitly asked to fix findings.
  Pairs with backend-vc-swagger-spec-write and shares its core pattern library.
  Triggers: "review spec", "audit spec", "validate spec", "check yaml", "review postanovka",
  "проверь постановку", "ревью постановки", "проверь yaml", "проверь спецификацию", "посмотри постановку".
---

# Reviewing OpenAPI specifications

**This skill builds on the [`estesis-process-review-standards`](../estesis-process-review-standards/SKILL.md) skill — read it first.**
That skill owns the review philosophy, the severity buckets (🔴🟠🟡🔵 — severity only, no "Good" section), the output format with
continuous numbering, and the verdict rules. It must be installed (globally or locally) alongside
this skill. This skill adds the OpenAPI-specific gate: what to check in a spec and how to run the
parallel specialists.

This skill runs a maximally pedantic review: it catches contract blockers, structural problems, naming/enum issues, wording, cross-iteration inconsistencies, and YAML cosmetics. Findings are reported in the shared emoji-bucket format with continuous numbering; each finding carries the pattern slug it maps to as its convention reference.

Review is **read-only by default**: do not edit files, create branches, or commit unless the user explicitly asks you to fix what you find.

The companion `backend-vc-swagger-spec-write` skill writes specs by the same rules this skill checks. They share one pattern library, so "how we write" and "what we check" never diverge.

## Mandatory reading on first run

1. `estesis-process-review-standards` — the shared severity buckets, output format, numbering, and verdict rules.
2. `workflows/run-review.md` — the step-by-step review process, specialist spawning, finding aggregation.
3. `references/severity-matrix.md` — the spec-specific severity calibration, mapped onto the shared buckets.
4. `references/output-format.md` — how the spec report applies the shared format (pattern slug, checked-context, summary).
5. `references/subagent-prompts.md` — templates for per-review specialists.

## Rule sources

The rules live in two layers; read both before asserting a spec is correct:

- **Core (universal):** `.agents/skills/backend-vc-swagger-spec-write/patterns/core/` and its `INDEX.md`, plus the normative summary `.agents/skills/backend-vc-swagger-spec-write/references/core-conventions.md`.
- **Estesis profile (bundled):** `.agents/skills/backend-vc-swagger-spec-write/references/estesis-profile.md` (output language, error shape, naming registry, folder workflow, registry/docs locations), `.agents/skills/backend-vc-swagger-spec-write/references/wording-registry.md`, and `.agents/skills/backend-vc-swagger-spec-write/patterns/profile/` with its `INDEX.md` (domain features, locale wording, project-specific security). Profile patterns override core only when they say so explicitly.

## External sources of truth

On every review also consult, via the project root (current working directory):

- `registry/services/<service>/SWAGGER.md` — deployed swagger URL per service; resolve local source via `registry/local-paths.json`.
- The product/acceptance docs and saved external contracts the profile points to.
- The project's iteration catalog/index, when present.
- The relevant microservice code in the workspace, when available.

The pattern library is a compacted, checkable base of empirical observations; it complements but does not replace the core conventions and the project profile.

## Review flow on one page

1. **Collect context.** Read the target stage YAML, the iteration's supporting docs, the profile, relevant product docs, registry links, and related iterations referenced by the index.
2. **Scope.** Describe which services, features, and cross-cutting aspects the review touches. Pick the applicable pattern slugs from the core `INDEX.md` and the profile `INDEX.md`.
3. **Spawn specialists.** Run parallel per-review agents by aspect (contract, structure, naming, wording, consistency, plus feature-specific). Templates are in `references/subagent-prompts.md`.
4. **Cross-cutting checks yourself.** The main reviewer checks stage dependencies, ordering, supersedes, iteration ownership, and synchronization of the supporting docs with the YAML.
5. **Aggregate.** Gather findings, dedupe by root cause, sort into the shared buckets 🔴 → 🟠 → 🟡 → 🔵, number continuously from 1.
6. **Final report.** Use `references/output-format.md` with `estesis-process-review-standards` §D–§E. Don't drop unique 🔴/🟠 findings for brevity; group only identical 🔵.
7. **Close.** Summarize readiness. Write the report in the profile's output language. If the user asked for fixes, propose or apply them as a separate step.

## Hard rules

- **Clarifying questions:** if the review target is ambiguous (unclear which YAML, which iteration, which scope), ask before reading. Use a questions UI (AskUserQuestion, Codex Questions, or equivalent) if available. Max 3 questions per turn.
- Don't claim a spec is correct unless you read the required context (the profile, the target YAML and its supporting docs, relevant docs/, registry).
- Don't validate YAML with external tools, and don't claim it's valid unless verified an allowed way.
- Don't invent backend behavior, roles, statuses, enum values, or business rules without grounding in the spec, registry, or code.
- Don't require extra statuses, parameters, or fields "just in case".
- Don't raise a finding based only on personal preference unconnected to a rule, risk, or inconsistency.
- Don't edit files during review without an explicit request.
- Don't rewrite old iterations to fix a finding; propose a new iteration and link it per the profile's workflow.
