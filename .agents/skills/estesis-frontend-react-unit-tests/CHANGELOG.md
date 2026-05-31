# Changelog — estesis-frontend-react-unit-tests

## 2026-05-28 — Fix YAML frontmatter so the skill is discoverable
- Converted the single-line `description` to a block scalar (`>`). The inline `Triggers: `
  (colon + space) made the plain scalar invalid YAML, so `npx skills` silently skipped the skill.

## 2026-05-28 — Initial import
- Imported from `~/.agents/skills/unit-tests-philosophy` into the shared Estesis skills repo.
- Renamed to `frontend-react-unit-tests` to reflect the primary usage context.
