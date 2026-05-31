# Changelog — estesis-backend-vc-swagger-spec-review

## 2026-05-29 — Align with revised review standard
- Switched report headers from topic-primary (`Contract & Structure`, `Material Findings`,
  `Wording & Cosmetics`) to the standard's severity-primary `Blockers / High / Medium / Low`, with
  the spec topic kept as a hint and an inline `[topic]` tag. Same change applied to
  `references/severity-matrix.md`.
- Removed the "Good 👍" section from `references/output-format.md` and `workflows/run-review.md`.

## 2026-05-28 — Adopt shared review foundation
- Hard-requires the new `estesis-process-review-standards` skill for the review philosophy,
  severity buckets, output format + numbering, and verdict rules.
- Switched the final report from the standalone BLOCKER..NIT findings table to the shared
  emoji-bucket format (🔴🟠🟡🔵👍) with continuous numbering and an APPROVE / REQUEST CHANGES /
  BLOCK verdict; the pattern slug is now the per-finding convention reference.
- Re-labelled `references/severity-matrix.md` onto the shared buckets (BLOCKER→🔴, HIGH→🟠,
  MEDIUM→🟡, LOW & NIT→🔵), keeping the spec-specific calibration examples.
- Updated `references/output-format.md`, `references/subagent-prompts.md`, `workflows/run-review.md`,
  and `DESIGN.md` to the shared severity vocabulary. The parallel specialist architecture is
  unchanged.

## 2026-05-28 — Transferred to estesis-skills repo
- Moved from global `~/.agents/skills/review-spec` into the shared company skills repository.
- Updated cross-skill references to `backend-vc-swagger-spec-write` from `$HOME/.agents/skills/backend-vc-swagger-spec-write/` to `.agents/skills/backend-vc-swagger-spec-write/` for local-install compatibility.
- Pre-publication cleanup: dropped the stale `review-spec` name; fixed the two specialist prompt templates in `references/subagent-prompts.md` that still pointed at a project-side `spec-profile/` directory, so they read the bundled profile from `.agents/skills/backend-vc-swagger-spec-write/references/`. Rewrote `DESIGN.md` to match the bundled-profile architecture.
