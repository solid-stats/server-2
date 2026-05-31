# Workflow: write-spec

The canonical authoring process. Follow the steps in order. Do not start writing YAML until step 1 is genuinely closed.

## Step 0. Read the rules

On first run (or after a long gap) read `references/core-conventions.md`, `references/project-profile-loading.md`, `patterns/INDEX.md`, and skim `patterns/profile/INDEX.md`.

## Step 1. Clarify before writing

Scan the request for ambiguity in: goal and scope, affected services, roles/access/ownership, backward compatibility, payload and response shape, edge cases, stage/endpoint ordering, and naming. For each ambiguity, ask whether a different reasonable answer would change the contract. If yes, ask the user.

- Group related questions; ask the highest-leverage ones first. Max 3 per turn.
- Use a questions UI (AskUserQuestion, Codex Questions, or equivalent) if available; ask in text otherwise.
- Prefer concrete options over open questions when the options are known.
- Do not substitute a guess for a question just to move faster. If you can safely proceed on an explicit assumption, state the assumption and continue; if a wrong assumption would produce an incompatible contract, stop and wait.

## Step 2. Load context

- Read `references/project-profile-loading.md` (bundled Estesis profile). Adopt Russian for prose, the Estesis error shape, wording registry, and folder workflow.
- For each affected service: read `registry/services/<service>/SWAGGER.md` and resolve its local source via `registry/local-paths.json`; read the relevant code when available.
- Read product/acceptance docs the profile points to, and any existing baseline specs this change touches or supersedes.

## Step 3. Locate the spec

Decide where the new spec and its supporting documents go, per the profile's folder workflow. If there is no profile, ask. Never invent a location that leaks into the developer-facing contract.

## Step 4. Design the contract

Apply, in this order of authority: profile pattern overrides → core conventions → core patterns → profile domain patterns.

- Model entities with self-contained schemas; reuse via `$ref` within the document.
- Prefer `anyOf`/`oneOf` for polymorphism; `const` for single literals.
- Pagination envelope, status codes, optional-parameter defaults, nullability, ids, naming — per core conventions.
- Authorization via permissions/ownership, not hardcoded roles. Required vs optional bearer per the security rules.
- Keep schemas substitutable (LSP) when extending; state added fields in the extension's description.

## Step 5. Write the prose

- Put each detail in its most specific place (property / parameter / status response).
- Write developer-facing prose in the profile's output language; keep identifiers exact.
- Use blank lines for real UI paragraphs; don't duplicate schema-stated values in prose; stay concise.
- Leave developer notes in `description` where behavior would otherwise surprise the implementer.

## Step 6. Record decisions

Record every agreed contract/naming/payload/ordering/access/edge-case decision in the profile's change-log convention, not just in the chat. If a decision changes a previously agreed one, mark the prior decision superseded — never silently revert it.

## Step 7. Self-review

Before handing off, run the spec against the `backend-vc-swagger-spec-review` rules: pagination envelope, status codes, nullability, ids, naming, security clause correctness, self-containment, description placement, and any active profile patterns. Fix what you find. Then state what a developer still needs to confirm, if anything.
