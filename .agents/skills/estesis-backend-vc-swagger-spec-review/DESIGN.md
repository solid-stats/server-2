# backend-vc-swagger-spec-review — design

Source of truth for this skill's structure and behavior. Change only in step with the implementation.

## Goal

Review OpenAPI specifications as pedantically as possible: catch blockers, contract violations, structural problems, naming/enum issues, wording, cross-iteration inconsistencies, and YAML cosmetics. The final report stays readable and actionable.

## Two skills, one pattern library

`backend-vc-swagger-spec-review` does not own the rules. The canonical **core** pattern library and the bundled **Estesis profile** both live in the peer `backend-vc-swagger-spec-write` skill; this skill reads them. Author writes by these rules; review checks by them — they cannot drift.

When both skills are installed into a project (via `npx skills`), they sit side by side under the project's `.agents/skills/`:

```
.agents/skills/
├── backend-vc-swagger-spec-write/
│   ├── references/
│   │   ├── core-conventions.md           normative rule summary
│   │   ├── estesis-profile.md            bundled Estesis profile
│   │   └── wording-registry.md           Russian house wording rules
│   └── patterns/{INDEX.md, core/*.md, profile/INDEX.md, profile/*.md}
└── backend-vc-swagger-spec-review/       ← this skill
    ├── SKILL.md
    ├── DESIGN.md                         (this file)
    ├── CHANGELOG.md
    ├── workflows/run-review.md
    └── references/
        ├── severity-matrix.md            spec calibration → shared 🔴🟠🟡🔵 buckets
        ├── output-format.md              how the spec report applies the shared format
        └── subagent-prompts.md           per-review specialist templates
```

This skill reaches the rules via the project-relative path `.agents/skills/backend-vc-swagger-spec-write/...`; it is non-functional unless `backend-vc-swagger-spec-write` is installed alongside it.

It also **hard-requires `estesis-process-review-standards`** for the review philosophy, severity buckets, output format with continuous numbering, and verdict rules — installed globally or locally.

## Rule sources at review time

| Source | What it holds |
| --- | --- |
| `.agents/skills/backend-vc-swagger-spec-write/references/core-conventions.md` | Universal normative contract rules |
| `.agents/skills/backend-vc-swagger-spec-write/patterns/core/` | Universal patterns with detection cues |
| `.agents/skills/backend-vc-swagger-spec-write/references/estesis-profile.md` | Output language, error shape, naming registry, folder workflow, doc/registry locations |
| `.agents/skills/backend-vc-swagger-spec-write/references/wording-registry.md` | Russian term-replacement registry |
| `.agents/skills/backend-vc-swagger-spec-write/patterns/profile/` | Domain features, locale wording, project-specific security/auth |
| `registry/services/<svc>/SWAGGER.md` + `local-paths.json` (in the project) | Deployed swagger + local source |
| Product/acceptance docs the profile points to | Acceptance criteria, external contracts |

The main reviewer must consult the relevant sources every review. Patterns are a compacted empirical base; they complement, not replace, the core conventions and the profile.

## Subagent strategy

Per review, the main reviewer spawns N specialists by aspect (contract, structure, naming, wording, consistency, cosmetic, and feature-specific). Each specialist reads its assigned pattern slugs (core and/or profile) and the target YAML, then returns a findings table. The main reviewer aggregates, numbers, sorts, dedupes, and writes the single final report. Specialist prompt templates use path placeholders, not hardcoded user paths, so they work in any checkout.

## Severity

The shared buckets 🔴 / 🟠 / 🟡 / 🔵 from `estesis-process-review-standards` §C are canonical. The
spec calibration ladder `BLOCKER / HIGH / MEDIUM / LOW / NIT` maps onto them
(BLOCKER→🔴, HIGH→🟠, MEDIUM→🟡, LOW & NIT→🔵) — see `references/severity-matrix.md`. Each pattern
records its `severity_when_violated`.

## Report

- Findings in the shared emoji buckets (🔴 → 🟠 → 🟡 → 🔵) with continuous numbering from 1 across
  all buckets, then by `path:line`; verdict APPROVE / REQUEST CHANGES / BLOCK with the severity
  count (`estesis-process-review-standards` §D–§E).
- Each finding carries: location, problem, risk, fix, and the pattern slug as its convention
  reference.
- If there are no findings: one explicit "no blocking or material problems found" line and an
  APPROVE verdict.
- The report is written in the profile's output language; identifiers stay exact.

## Output language

Skill chrome (this repo) is English so it can be shared across teams. The review report itself follows the project profile's output language (Russian for the Estesis team). With no profile, match the language the user is using.
