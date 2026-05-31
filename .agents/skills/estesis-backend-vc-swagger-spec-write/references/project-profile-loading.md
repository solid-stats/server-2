# Estesis profile

This skill is configured for Estesis. The full project profile is bundled here — there is no separate `spec-profile/` directory to load from the project.

## What the profile contains

- `references/estesis-profile.md` — configuration: output language (Russian for prose, English for identifiers); the Estesis error-payload shape; service name display mapping; folder/iteration workflow (`changes/NNN_name/`); service registry layout; product/acceptance docs locations.
- `references/wording-registry.md` — Russian house wording rules: mandated term replacements, service names in Russian prose, paragraph formatting.
- `patterns/profile/INDEX.md` — 35 Estesis-specific patterns: domain features (drafts, publish lifecycle, music labels, resources, appeals, karaoke, voice range), iteration workflow rules, locale wording rules, project security/auth.

## How to apply

1. Read `references/estesis-profile.md` first. Adopt Russian for all developer-facing prose; keep API identifiers technically exact in English.
2. Load `patterns/profile/INDEX.md` and treat those patterns as active alongside the core library. Profile patterns win on any explicit override.
3. Substitute every "profile-defined" value in `core-conventions.md` (error-payload shape, multipart exception service) with the values in `estesis-profile.md`.
4. Follow `estesis-profile.md`'s folder workflow to place the spec and its supporting documents.

## Service registry and source code

When a spec touches a service:

- Read `registry/services/<service>/SWAGGER.md` in the swagger repository for the deployed swagger URL.
- Resolve the service's local source via `registry/local-paths.json` (gitignored, per-user absolute paths). The template and repo URLs are in `registry/local-paths.example.json`.
- If the local path is missing, fall back to the repository URL and deployed swagger, and note that source wasn't read.
- Never assert compatibility with a service whose contract you couldn't verify; state the residual risk.
