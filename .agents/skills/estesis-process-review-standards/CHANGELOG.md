# Changelog — estesis-process-review-standards

## 2026-05-29 — Clarity, severity-only buckets, scope discipline (developer feedback)
- **Buckets are now one axis — severity.** Renamed to `Blocker / High / Medium / Low` (🔴🟠🟡🔵)
  and removed the topic-flavored names. The old `Architectural / High` vs `Code Findings / Medium`
  read like categories and confused developers ("isn't an architectural violation also a code
  finding?"). Topic now travels as an inline `[topic]` tag on each finding, kept separate from
  severity (§C, §D).
- **Removed the "Good 👍" section** from the output format and verdict rules — a review is what to
  change, not what to praise. The narrow case for noting a correct-but-surprising decision moved to
  Non-Findings Checked (§D).
- **Added scope discipline (§B).** Numbered findings must point at changed lines or pre-existing
  code the change directly relies on; unrelated pre-existing issues go in a new unnumbered
  "Out of scope (pre-existing)" note. Addresses reports of findings disconnected from the change.
- **Added a "Be direct — no filler" principle (§A)** and tightened the per-finding shape to cut
  preamble, hedging, and praise padding.

## 2026-05-28 — Initial version
- Extracted the shared review foundation from `estesis-backend-vc-code-review` (the reference
  reviewer): review philosophy, scope establishment, the 🔴🟠🟡🔵👍 severity buckets, the
  continuous-numbering output format, the APPROVE / REQUEST CHANGES / BLOCK verdict rules, the
  test-file rule, the noise filter, and the read-only / fix-on-request policy.
- Added a mapping from the older `CRITICAL/HIGH/MEDIUM/LOW` and `BLOCKER..NIT` scales onto the
  canonical emoji buckets so the four reviewers converge on one severity language.
- Documented the optional per-finding convention/pattern reference and the table rendering
  allowed for spec-style reviews.
- Hard-required by `estesis-backend-vc-code-review`, `estesis-frontend-react-vc-code-review`,
  `estesis-frontend-react-counterparty-code-review`, and `estesis-backend-vc-swagger-spec-review`.
