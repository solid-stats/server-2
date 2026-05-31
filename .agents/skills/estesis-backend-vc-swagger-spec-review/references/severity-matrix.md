# Severity matrix

Use this when classifying each finding. Don't inflate severity for personal preference; don't deflate it when there is real risk.

These spec-specific tiers map onto the canonical buckets in `estesis-process-review-standards` §C:
**BLOCKER → 🔴**, **HIGH → 🟠**, **MEDIUM → 🟡**, **LOW and NIT → 🔵**. The final report uses the
emoji buckets with continuous numbering; this file is the calibration for which spec problem
belongs in which bucket.

## 🔴 Blockers — BLOCKER

The spec cannot be safely handed to development. Building from it yields an API that doesn't work or is incompatible with neighboring contracts/services. Examples:

- Contradiction between the iteration's supporting docs and the YAML.
- Wrong stage dependency: a stage relies on an undescribed stage, or parallel sub-stages actually depend on each other.
- A critical endpoint, schema, or role is missing without which the scenario can't be implemented.
- Authorization/ownership undescribed where the business requires it.
- Incompatibility with the current backend (e.g. the contract promises a field the service never returns).
- Violation of a mandatory core rule: pagination without `data/limit/offset/total`, missing numeric `id`, `201` instead of `200`, a security clause on a public endpoint, and the like.
- A silent revert of an active change-log decision without an explicit supersede.
- Requirements that objectively prevent a developer from determining correct behavior.

## 🟠 High — contract & structure

The implementation will almost certainly be wrong or incompatible, but the problem is local and fixable without reworking the iteration. Examples:

- Wrong request/response shape that doesn't fit the shared patterns.
- Missing realistically-possible critical error statuses (e.g. `409` on conflict).
- Enum/status/schema conflict with a baseline without a supersede.
- A limited-scope security/privacy risk.
- Wrong service boundary: an endpoint placed in the wrong service.
- A field/parameter in the wrong place (e.g. a business filter in the path instead of query).

## 🟡 Medium — material findings

The spec is implementable but contains a material ambiguity or inaccuracy. Examples:

- Incomplete edge-case description (empty list, duplicate, conflict) left unstated.
- A field description living on the schema or method instead of the specific property.
- Weak synchronization between the supporting docs and the YAML: meaning holds, details diverge.
- A limited-impact naming/enum problem.
- Cross-iteration consistency: the spec departs from the established style without violating a mandatory rule.
- A `$ref` could have replaced inline duplication.

## 🔵 Low — wording & cosmetics (readability)

Doesn't change the contract, but hurts readability or maintenance. Examples:

- Wording: heavy phrasing, poor paragraph structure, an unnecessary foreign-language term.
- Description duplicates what the schema already states (`default`, `enum`, types).
- A redundant method-level description duplicating property-level text.
- A weak slug in the change map.

## 🔵 Low — wording & cosmetics (editorial / NIT)

Purely editorial — also lands in 🔵, but keep it distinct from a 🔴/🟠 contract problem on the same line. Examples:

- Cosmetic YAML: indentation, key order, extra blank lines, inconsistent quoting.
- A typo in a comment or description that doesn't change meaning.
- Insignificant enum value ordering.
- A long line that could be split.

## Rules

- One finding, one severity. If a problem has layers (e.g. a 🔴 contract issue plus a 🔵 wording issue on the same field), that's two findings pointing at the same location.
- On ambiguity, pick the higher severity. Better to explain why a 🔴 could later be downgraded to 🟠 than to miss a blocker.
- 🔴 and 🟠 are never grouped. 🟡 may be grouped carefully; 🔵 freely.
- Severity reflects risk, not the cost to fix.
