# Output format

The spec review reports findings in the **shared format** defined by `estesis-process-review-standards`
§D (severity buckets, continuous numbering) and §E (verdict). This file covers only what is
specific to a spec review. Deviate only if the user explicitly asks for another format.

## Language

Write the report in the project profile's output language (with no profile, match the language the
user is using). Keep file names, endpoints, statuses, enum values, schema fields, slugs, and code
values exactly as in the sources.

## Report structure

In this order:

1. **Severity buckets** with findings (🔴 → 🟠 → 🟡 → 🔵), continuous numbering across all buckets
2. **Open questions** — only if the spec can't be accepted without an answer
3. **Checked context** — what was read and what couldn't be verified
4. **Verdict** — APPROVE / REQUEST CHANGES / BLOCK, plus the severity count

There is no "Good" section (`estesis-process-review-standards` §D) — the report is what to change.

Don't open with a general impression. Don't hide blockers in the summary or open questions.

## Findings

Use the shared severity-only buckets with continuous numbering (`estesis-process-review-standards`
§C–§D). The buckets are one axis — severity; the spec topic is a hint, not the header. For a spec
review the tiers carry these typical topics:

- 🔴 **Blockers** — the spec cannot be safely handed to development (see severity-matrix).
- 🟠 **High** — contract & structure: almost certainly wrong/incompatible, but local and fixable.
- 🟡 **Medium** — material findings: implementable but with a real ambiguity or inaccuracy.
- 🔵 **Low** — wording & cosmetics: readability, maintenance, YAML cosmetics, typos.

Each finding follows: `` `path/to/stage.yaml:line` `` → `[topic]` → the concrete violation (no
long YAML quotes) → the practical risk → the concrete fix → the **pattern slug** as the convention
reference (core or profile, in `` `code` ``; use `—` when no pattern applies). The pattern slug is
this skill's equivalent of the §-section reference the code reviewers use.

```markdown
## Blockers 🔴
1. `iteration/stage_2.yaml:120` [contract] — pagination response missing the `{data,limit,offset,total}` envelope — clients can't page; breaks the shared list contract — wrap the items in the standard envelope — `response-pagination-envelope`
2. ...

## High 🟠
3. `iteration/stage_2.yaml:64` [structure] — business filter placed in the path instead of query — wrong request shape, won't match neighbouring endpoints — move `status` to a query parameter — `request-filters-in-query`

## Medium 🟡
_none_

## Low 🔵
4. `iteration/index.md:14` [wording] — heavy phrasing duplicated across 6 descriptions — harder to maintain — tighten to one sentence; also at lines 22, 31, 40 — `wording-concise-descriptions`
```

**Grouping** (per `estesis-process-review-standards` §A): 🔴 and 🟠 are never grouped — each
violation is its own numbered finding. 🟡 group carefully by root cause. 🔵 group freely (22
instances of one wording issue → one finding, primary line plus "also at lines …"). Note in the
verdict line if lower-severity findings were grouped.

If there are no findings at all, the buckets section is one line: "no blocking or material
problems found" (in the output language), and the verdict is APPROVE.

## Open questions

Only if the spec can't be accepted or completed without an answer. Each question states why it
matters and what decision depends on it. Don't ask preference questions — those are 🟡/🔵 findings
with a proposed fix.

## Checked context

A short list of what was read: target YAML, the iteration's supporting docs, related iterations,
`registry/services/<svc>/SWAGGER.md` per affected service (or its explicit absence), relevant
product docs, backend code if read. State explicitly anything you couldn't verify and the residual
risk. Don't mask gaps. (This is the spec-review form of the shared "Non-Findings Checked" and
"Validation Gaps" sections.)

## Verdict

Apply `estesis-process-review-standards` §E, then add the severity count on the same line:

> **BLOCK** — 1 🔴, 3 🟠, 7 🟡, 4 🔵. Lower-severity findings grouped by root cause.

A missing required source you couldn't read, or any 🔴, blocks acceptance. No "make it nicer"
recommendations beyond what's already in the findings.
