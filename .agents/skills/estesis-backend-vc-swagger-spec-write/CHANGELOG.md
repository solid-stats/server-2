# Changelog — estesis-backend-vc-swagger-spec-write

## 2026-05-28 — Transferred to estesis-skills repo
- Moved from global `~/.agents/skills/author-spec` into the shared company skills repository.
- Pre-publication cleanup: dropped the stale `author-spec` name and all references to a project-side `spec-profile/` directory. The Estesis profile is bundled in this skill (`references/estesis-profile.md`, `references/wording-registry.md`, `patterns/profile/`); updated `DESIGN.md`, `patterns/INDEX.md`, `references/estesis-profile.md`, and the `source:` citations in profile patterns to match. Quoted pattern frontmatter values so every pattern file parses as strict YAML.
- New profile rule `wording-spec-file-links-gitlab-url`: referencing another swagger-repo file from the developer-facing contract is now allowed, but only via a full GitLab blob URL (`https://git.estesis.tech/VocalClub/swagger/-/blob/master/<path>`); bare local paths in the contract stay a violation, the `$ref` self-containment BLOCKER is unchanged, and supporting docs may still reference files freely. Refined core `wording-no-internal-paths-leak`, `references/estesis-profile.md`, and the SKILL.md hard rule accordingly.
