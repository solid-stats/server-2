# Phase 19: Contract Freeze - Research

**Researched:** 2026-06-08
**Domain:** OpenAPI contract versioning + CI breaking-change classification (oasdiff GitHub Action) on a TypeScript/Fastify backend
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
**Version & Published Artifact**
- Bump `info.version` from `"0.1.0"` to `"1.0.0"` in `src/openapi/register-openapi.ts` (single source of truth for the version). Keep `openapi: 3.0.3`.
- The published artifact path is the already-committed `openapi/server-2.openapi.json`, produced by `pnpm run openapi:export`. This file is BOTH the artifact `web` consumes via `openapi-typescript` AND the committed baseline snapshot used for diffing. Do NOT introduce a second/duplicate artifact path.
- Regenerate and commit `openapi/server-2.openapi.json` so it reflects `1.0.0` plus every Phase 14–18 surface.

**CI Diff Classification (the core new work)**
- Add a CI gate that classifies the OpenAPI diff between the PR's code-generated spec and the committed baseline using **oasdiff via its official GitHub Action** — CI-only, no runtime/`package.json` dependency (honors the project's zero-new-runtime-dependency posture).
- Additive / backward-compatible changes → PASS (treated as a minor-level change). Breaking changes → FAIL the job UNLESS the same PR intentionally bumps the major version AND updates the committed baseline snapshot in the same change.
- Keep the existing `openapi:verify` drift check (regenerated-from-code must byte-equal the committed file) in `pnpm run verify` so the baseline can never silently go stale. The classification gate sits on top of, not instead of, the drift check.
- The diff base for breaking-change detection is the spec on the PR's base branch (the previously frozen contract).

**Freeze Gates (tests)**
- The existing CI (`.github/workflows/cd.yml`) ALREADY runs the postgres/rabbitmq/minio integration suite and the real-pg Steam64 leak-guard via `pnpm run verify`. Phase 19 RELIES ON and confirms this as the freeze gate (ROADMAP SC3) — verify-and-keep, do NOT rebuild a parallel CI path.
- Add a DB-free static "frozen-contract" test over the committed `openapi/server-2.openapi.json` that asserts: (a) no list/collection response schema carries `page`, `pageSize`, or `total` properties (cursor pagination only); (b) no full Steam64 (`/7656119\d{10}/`) appears anywhere in the artifact JSON; (c) `info.version === "1.0.0"`. This test runs in the fast unit suite (no services).

**Bump Policy (documented)**
- `1.0.0` is the frozen baseline. Going forward: additive change → minor bump; breaking change → major bump + committed-baseline-snapshot update in the same PR. Document this policy in README (contract section).

### Claude's Discretion
- Exact pinned oasdiff action version and flag set (fail-on=breaking, base/revision wiring).
- Placement/naming of the frozen-contract test file (follow existing `src/test/integration` vs unit conventions — prefer a DB-free unit/integration test that doesn't need services).
- Exact README wording for the bump policy.
- Whether the CI classification runs as a new step in the existing `verify` job or a separate job (pick the lower-friction option that still blocks merges).

### Deferred Ideas (OUT OF SCOPE)
- WR-04 / WR-05 winner-fix hardening — needs a dedicated follow-up phase.
- `18-SECURITY.md` threat-model verification — surface in milestone audit.
- Vite build/dev tooling migration — backlog phase 999.1.
- New endpoints, response-shape changes (this phase changes versioning + guards only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FREEZE-01 | OpenAPI contract version bumped `0.1.0` → `1.0.0` | Bump single source `src/openapi/register-openapi.ts:12`; regenerate artifact; semver-for-OpenAPI section below confirms `1.0.0` semantics. |
| FREEZE-02 | Published OpenAPI artifact path available for `web`'s `openapi-typescript` | Path `openapi/server-2.openapi.json` already exists and is committed; keep it stable (no new path). Drift gate `openapi:verify` keeps it current. |
| FREEZE-03 | CI classifies OpenAPI diffs vs committed baseline (additive pass, breaking fail unless major bump + baseline update) | `oasdiff/oasdiff-action/breaking@v0.0.56`, `fail-on: ERR`, git-revision base wiring (`origin/${{ github.base_ref }}:openapi/server-2.openapi.json`). CI-only, no runtime dep. |
| FREEZE-04 | PostgreSQL integration tests run in CI as a freeze gate | Already satisfied by `.github/workflows/cd.yml` job `verify` (docker-compose postgres/rabbitmq/minio + `pnpm run verify`). Verify-and-keep, do not rebuild. |
</phase_requirements>

## Summary

Phase 19 is a guardrail-only phase: zero API behavior changes. It does three concrete things — (1) bump `info.version` to `1.0.0` and regenerate the committed artifact, (2) add a CI breaking-change classification gate using the **oasdiff GitHub Action** (`oasdiff/oasdiff-action/breaking@v0.0.56`, CI-only, no runtime dependency), and (3) add a fast DB-free static test that asserts three frozen-contract invariants over the committed `openapi/server-2.openapi.json`. FREEZE-04 (PostgreSQL integration tests in CI) is already satisfied by the existing `verify` job and only needs to be confirmed.

The oasdiff action runs the Go CLI directly in the runner — no `package.json` entry, no Node dependency — which exactly honors the project's zero-new-runtime-dependency posture. Crucially, oasdiff supports a **git-revision base syntax** (`origin/<base_ref>:path`) so the workflow does NOT need to manually checkout the base branch and `git show` the old spec; the action resolves both base and revision itself. For a freeze gate where additive changes must pass freely, use `fail-on: ERR` (definite breaking changes only) rather than `fail-on: WARN` (which also fails on *potential*/ambiguous changes and would produce false-positive merge blocks).

**The single most important finding for the planner** is about the static frozen-contract test (assertion (a)). A naive "no `page`/`pageSize`/`total` anywhere" check will FAIL on the *current, correct* artifact, because: (1) the internal `/operations/*` endpoints legitimately still use offset pagination (`items`/`page`/`pageSize`/`total`) and are NOT part of the public `web` contract; and (2) `total` appears as a legitimate domain stat property (`stats.deaths.total`) on public stats endpoints. The assertion must be scoped to **public list endpoints' top-level pagination metadata only** — see Pitfall 1 and Code Examples.

**Primary recommendation:** Bump version + regenerate artifact; add a separate `contract-diff` CI job using `oasdiff/oasdiff-action/breaking@v0.0.56` with `fail-on: ERR` and git-revision base wiring; add a DB-free unit-suite test that scopes the pagination-metadata assertion to public `/stats/*` list-response top-level schemas (allowlist `/operations/*` and domain `total`). Confirm FREEZE-04 already met.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Version string source of truth | API / Backend (`register-openapi.ts`) | — | OpenAPI version is generated from Fastify swagger config; single literal. |
| Artifact generation/drift | API / Backend (`export-openapi.ts`, `verify-openapi.ts`) | — | Spec is derived from running app via `app.swagger()`. |
| Breaking-change classification | CI / Pipeline (GitHub Actions) | — | oasdiff is a CI-only Go binary; never imported into the app. |
| Frozen-contract invariants | Test tier (Vitest, DB-free) | — | Pure JSON-walk over committed artifact; no services. |
| PG integration freeze gate | CI / Pipeline (`cd.yml verify` job) | DB tier (docker-compose) | Already exists; spins up postgres/rabbitmq/minio. |
| Bump policy contract | Docs (README) | — | Human-facing compatibility contract for `web` + future contributors. |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `oasdiff/oasdiff-action/breaking` | `v0.0.56` | CI breaking-change detection between two OpenAPI specs | Official action of the oasdiff project; runs the oasdiff Go CLI in-runner, no account/token, no Node dep. [VERIFIED: github.com/oasdiff/oasdiff-action releases] |
| `@fastify/swagger` | `^9.7.0` (installed) | Generates the OpenAPI document consumed for artifact + version | Already the contract source; version literal lives in its config. [VERIFIED: package.json] |
| `openapi-typescript` | `^7.13.0` (installed, dev) | `web`-side type generation from the artifact | Already wired into `openapi:check`. [VERIFIED: package.json] |
| `vitest` | `^4.1.5` (installed) | Runs the DB-free frozen-contract test | Existing test runner; unit suite excludes integration/postgres files. [VERIFIED: package.json] |

### Supporting
| Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `actions/checkout` | `v6` (already used) | Checkout for the diff job; must use `fetch-depth: 0` (or fetch base ref) so the base-branch spec is resolvable | Needed only if using git-revision base syntax (recommended). [VERIFIED: cd.yml uses v6] |

### Alternatives Considered
Locked by CONTEXT — oasdiff is the chosen tool. `@redocly/cli` was the alternative floated in STATE pending-todos but is explicitly NOT to be re-litigated here.

**Installation:** No package install. The action is referenced directly in YAML. No change to `package.json` dependencies (honors zero-new-runtime-dependency posture).

**Version verification:**
- `oasdiff/oasdiff-action/breaking@v0.0.56` — latest release `v0.0.56`, published 2026-06-06 (two days before this research). [VERIFIED: github.com/oasdiff/oasdiff-action/releases]
- Pin to the exact tag `v0.0.56` (not a floating `@v0` major tag — the project releases frequently, ~daily in early June 2026, so pin precisely and let a future maintenance PR bump it).

## Package Legitimacy Audit

> No npm/PyPI/crates packages are installed by this phase. The only external dependency is a GitHub Action (Go binary), referenced in YAML. Registry-package legitimacy gate is N/A.

| Dependency | Type | Source Repo | Verdict | Disposition |
|---------|------|-------------|---------|-------------|
| `oasdiff/oasdiff-action` | GitHub Action | github.com/oasdiff/oasdiff-action (official oasdiff org) | OK | Approved — pin `@v0.0.56`, CI-only |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note: GitHub Actions are not covered by the npm `package-legitimacy check` seam. Verified via the official `oasdiff` GitHub organization and the action's documentation site `oasdiff.com`. Pin to an exact tag; consider pinning to a commit SHA for stricter supply-chain hygiene if project policy requires it.*

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
   PR opened against     │              GitHub Actions (CI)             │
   base branch  ───────► │                                             │
                         │  job: verify (EXISTING — FREEZE-04 gate)     │
                         │   ├─ docker compose up postgres/rabbitmq/    │
                         │   │   minio                                  │
                         │   └─ pnpm run verify                         │
                         │        ├─ format / lint / typecheck          │
                         │        ├─ test (unit) ◄── NEW frozen-contract│
                         │        │                    test runs here   │
                         │        ├─ test:integration (real-pg leak)    │
                         │        ├─ openapi:check (DRIFT gate:          │
                         │        │   regenerated == committed bytes)    │
                         │        └─ test:coverage                       │
                         │                                             │
                         │  job: contract-diff (NEW — FREEZE-03 gate)   │
                         │   ├─ checkout (fetch base ref)               │
                         │   └─ oasdiff breaking@v0.0.56                 │
                         │        base = origin/<base_ref>:openapi/...   │
                         │        revision = HEAD:openapi/...            │
                         │        fail-on = ERR                          │
                         │          ├─ additive  → exit 0 (PASS)         │
                         │          └─ breaking  → exit 1 (FAIL job)     │
                         └─────────────────────────────────────────────┘
                                   │                       │
                          both jobs required → merge blocked until green
                                   │
                                   ▼
        web consumes openapi/server-2.openapi.json via openapi-typescript
        (version 1.0.0 picked up automatically; no shape change)
```

### Pattern 1: Git-revision base wiring (avoid manual base checkout)
**What:** oasdiff accepts a `<git-ref>:<path>` syntax for the `base` input, resolving the old spec straight from git history. No `git show` step, no second checkout of the base branch.
**When to use:** Always, for PR diff gates — it's the documented idiom and the least-friction wiring.
**Example:**
```yaml
# Source: github.com/oasdiff/oasdiff-action/blob/main/README.md
- uses: oasdiff/oasdiff-action/breaking@v0.0.56
  with:
    base: 'origin/${{ github.base_ref }}:openapi/server-2.openapi.json'
    revision: 'HEAD:openapi/server-2.openapi.json'
    fail-on: ERR
```
Requires `actions/checkout` with `fetch-depth: 0` (full history) so `origin/<base_ref>` is present in the runner's git clone. On `push` events `github.base_ref` is empty — guard the job with `if: github.event_name == 'pull_request'`.

### Pattern 2: `fail-on: ERR` for a freeze gate (not WARN)
**What:** oasdiff classifies changes into ERR (definite breaking), WARN (potential/ambiguous breaking), INFO (non-breaking). `breaking` command reports ERR+WARN; `fail-on` sets the threshold that fails the job.
**When to use:** For "additive passes freely, breaking fails," use `fail-on: ERR`. Using `fail-on: WARN` would also fail on WARN-level changes oasdiff cannot *confirm* are breaking — producing false-positive merge blocks on legitimate additive evolution. [CITED: github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES.md]
**Example:** `fail-on: ERR` (see Pattern 1 YAML).

### Pattern 3: Static frozen-contract test as a pure JSON walk
**What:** Read the committed artifact, `JSON.parse`, walk it, assert invariants. No app boot, no DB — belongs in the fast unit suite (`pnpm test`, which excludes `src/test/integration/**` and `**/tests/postgres.test.ts`).
**When to use:** This phase's assertion (a)/(b)/(c). Place it as `src/openapi/<name>.test.ts` or a co-located unit test (NOT under `src/test/integration/` so it stays in the fast suite). Read the file via `node:fs/promises readFile` + `resolve("openapi/server-2.openapi.json")` (same path idiom as `export-openapi.ts`/`verify-openapi.ts`).

### Anti-Patterns to Avoid
- **Blanket substring/property scan for `page`/`pageSize`/`total`:** false-positives on `/operations/*` (legit offset pagination) and on `stats.deaths.total` (domain stat). See Pitfall 1.
- **Floating major tag `@v0`:** the action releases ~daily; pin the exact patch tag.
- **Duplicating the version literal:** keep `1.0.0` only in `register-openapi.ts`. `package.json` `version` is `private` and unrelated to the contract — CONTEXT does not ask to bump it; leave it unless the planner consciously decides otherwise (recommend leaving it `0.1.0` to keep a single contract-version source of truth).
- **Manual `git show base:spec` step:** unnecessary; use git-revision base syntax.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI breaking-change classification | A custom diff that compares old/new JSON for removed fields, narrowed enums, type changes, required-added, etc. | `oasdiff` action | Breaking-change semantics are subtle (required vs optional, response vs request direction, enum extension, format narrowing). oasdiff encodes hundreds of rules. [CITED: oasdiff BREAKING-CHANGES.md] |
| Base-spec retrieval in PR | A `git fetch` + `git show` shell step | oasdiff git-revision `base` syntax | Built-in, fewer moving parts. |
| Artifact drift detection | New byte-compare | Existing `openapi:verify` (already in `verify`) | Already solved and wired. |
| PG integration freeze gate | New CI job | Existing `cd.yml verify` job | Already runs docker-compose + `pnpm run verify`. |

**Key insight:** Every capability except the version bump and the static test is either already in the repo (drift gate, PG gate) or provided by the oasdiff action. The net-new code is tiny: one version literal, one regenerated JSON, one CI job, one test file, one README section.

## Common Pitfalls

### Pitfall 1: Naive pagination-metadata assertion fails on the current correct artifact
**What goes wrong:** A test asserting "no schema has properties named `page`/`pageSize`/`total`" (or a substring scan) FAILS even though the contract is correct.
**Why it happens:** Verified against the committed artifact:
- `/operations/ingest-staging` and `/operations/parse-jobs` top-level response `required: ["items","page","pageSize","total"]` — these are **internal operator endpoints using offset pagination**, NOT part of the public `web` cursor contract. They were never migrated by PAGE-03 (which targeted public `/stats/*` lists) and are out of scope here.
- Public `/stats/players`, `/stats/squads`, `/stats/leaderboards`, `/stats/players/{id}/weekly` contain a `total` property — but it is `...items.properties.stats.properties.deaths.properties.total` (a **domain statistic**, total deaths), not pagination metadata.
- Public list endpoints correctly use cursor metadata: top-level `required: ["hasMore","items","nextCursor"]`.
**How to avoid:** Scope assertion (a) precisely. Recommended scoping: for each **public list response** (path under `/stats/`, GET, 200, `application/json` schema whose top-level required array contains `items`), assert its **top-level** properties do NOT include `page`/`pageSize`/`total` (i.e. it must be the cursor shape). Do NOT recurse into item/nested schemas (that's where domain `total` lives), and explicitly exclude `/operations/*` (and any non-`/stats/` admin/moderation/operations paths). See Code Examples for a verified implementation.
**Warning signs:** Test fails listing `/operations/ingest-staging` or a `.deaths.total` path.

### Pitfall 2: oasdiff base ref unavailable in the runner
**What goes wrong:** `base: origin/<base_ref>:spec` errors with "couldn't find ref" / empty diff.
**Why it happens:** Default `actions/checkout` does a shallow clone (`fetch-depth: 1`); the base branch tip isn't in the local git object store.
**How to avoid:** Use `actions/checkout@v6` with `fetch-depth: 0` in the contract-diff job. Guard the job to PR events (`if: github.event_name == 'pull_request'`) since `github.base_ref` is empty on push.
**Warning signs:** Diff job passes trivially on every PR (empty base) — a silent false-negative.

### Pitfall 3: Drift gate and classification gate interaction (intentional, keep both)
**What goes wrong:** Confusion about overlapping gates; risk of removing the byte-equality drift check.
**Why it happens:** Two gates touch the same file. They are complementary:
- `openapi:verify` (in `pnpm run verify`): regenerated-from-code MUST byte-equal the committed file → guarantees the committed artifact is never stale vs the running app.
- `oasdiff breaking`: committed-on-base vs committed-on-PR → classifies whether the *contract evolution* is breaking.
**How to avoid:** Keep both. If a dev changes a route but forgets to regenerate, the drift gate catches it (the committed file no longer matches code). If a dev regenerates a breaking change, the classification gate catches it (unless they bump major + update baseline). Document this layering in the plan and README.
**Warning signs:** Someone proposes replacing `openapi:verify` with oasdiff — reject; they solve different problems.

### Pitfall 4: oasdiff false positives on `3.0.3` specs / version-only diffs
**What goes wrong:** Worry that bumping `info.version` 0.1.0→1.0.0 itself trips the breaking gate; or 3.0.3-specific noise.
**Why it happens:** `info.version` is metadata; oasdiff does NOT treat an `info.version` change as a breaking API change (it diffs paths/schemas/params, not the version string). The *first* PR that introduces the gate diffs `1.0.0` (PR) against whatever is on the base branch — if the base already has the regenerated `1.0.0` artifact merged, the diff is empty. Sequence matters: land the version bump + regenerated artifact, then the gate sees a stable baseline. oasdiff supports OpenAPI 3.0.x and 3.1.x; 3.0.3 is fully supported. Known CLI limitations (no `callback` checks, no request-`content` param checks) don't affect this contract.
**How to avoid:** Order the work so the regenerated `1.0.0` artifact is the committed baseline before/with the gate's introduction. On the introducing PR, base==main lacks the gate but the diff is base-spec vs PR-spec regardless, so a pure version+regeneration change yields no ERR-level findings.
**Warning signs:** Unexpected ERR findings on a no-op version bump → inspect whether the regenerated artifact accidentally changed a shape (it shouldn't; this phase makes no route changes).

## Code Examples

### Static frozen-contract test (verified against the real artifact)
```typescript
// Source: pattern verified by walking openapi/server-2.openapi.json this session.
// Place in fast unit suite, e.g. src/openapi/frozen-contract.test.ts
// (NOT under src/test/integration/ — keep it DB-free in `pnpm test`).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const STEAM64_PATTERN = /7656119\d{10}/u; // mirror the leak-guard pattern

type Json = Record<string, unknown>;

async function loadArtifact(): Promise<Json> {
  const raw = await readFile(resolve("openapi/server-2.openapi.json"), "utf8");
  return JSON.parse(raw) as Json;
}

describe("frozen contract", () => {
  it("pins info.version to 1.0.0", async () => {
    const spec = await loadArtifact();
    expect((spec["info"] as Json)?.["version"]).toBe("1.0.0"); // (c)
  });

  it("emits no full Steam64 anywhere in the artifact", async () => {
    const raw = JSON.stringify(await loadArtifact());
    expect(raw).not.toMatch(STEAM64_PATTERN); // (b)
  });

  it("public list endpoints use cursor metadata, never page/pageSize/total", async () => {
    const spec = await loadArtifact();
    const paths = spec["paths"] as Record<string, Json>;
    const FORBIDDEN = ["page", "pageSize", "total"];
    const offenders: string[] = [];

    for (const [path, ops] of Object.entries(paths)) {
      // (a) SCOPE: public stats surface only. /operations/* legitimately uses
      // offset pagination and is NOT part of the public web contract.
      if (!path.startsWith("/stats/")) continue;
      const get = (ops as Json)["get"] as Json | undefined;
      const schema = (((((get?.["responses"] as Json)?.["200"] as Json)
        ?.["content"] as Json)?.["application/json"] as Json)
        ?.["schema"] as Json) ?? undefined;
      if (!schema) continue;
      const props = schema["properties"] as Json | undefined;
      const required = schema["required"] as string[] | undefined;
      // Only assert on list responses (those exposing a top-level `items`).
      const isList = (props && "items" in props) || required?.includes("items");
      if (!isList) continue;
      // Assert TOP-LEVEL only — domain `total` (stats.deaths.total) lives nested.
      for (const key of FORBIDDEN) {
        if (props && key in props) offenders.push(`${path} -> ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```
*Verified facts the test relies on:* public `/stats/*` lists have top-level `required: ["hasMore","items","nextCursor"]`; `/operations/*` have `["items","page","pageSize","total"]`; the only `total` properties on `/stats/*` are nested under `...stats.deaths.total`; the artifact currently contains zero `7656119\d{10}` matches.

### CI contract-diff job (new job in cd.yml)
```yaml
# Source: github.com/oasdiff/oasdiff-action README (breaking action) + repo conventions
  contract-diff:
    name: Contract diff
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 0   # base ref must be present for the git-revision base

      - name: Classify OpenAPI breaking changes
        uses: oasdiff/oasdiff-action/breaking@v0.0.56
        with:
          base: 'origin/${{ github.base_ref }}:openapi/server-2.openapi.json'
          revision: 'HEAD:openapi/server-2.openapi.json'
          fail-on: ERR
```
*Make this job required (branch protection) so it blocks merge. Lower-friction alternative: a step inside the existing `verify` job — but a separate job parallelizes and keeps the heavy docker-compose job independent. Recommend a separate required job.*

### Version bump (single source of truth)
```typescript
// src/openapi/register-openapi.ts:12 — change "0.1.0" -> "1.0.0", keep openapi 3.0.3
info: { title: "server-2", version: "1.0.0" }
```
Then `pnpm run openapi:export` to regenerate and commit `openapi/server-2.openapi.json`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Tufin/oasdiff-action` | `oasdiff/oasdiff-action` (org renamed Tufin → oasdiff) | oasdiff became its own org | Use the `oasdiff/` namespace; `Tufin/` redirects but pin the canonical `oasdiff/`. [VERIFIED: github.com/oasdiff] |
| Manual `git show base:spec` shell step | git-revision `base:` syntax in the action | current | Fewer steps, fewer failure modes. |

**Deprecated/outdated:**
- `Tufin/oasdiff-action` namespace — superseded by `oasdiff/oasdiff-action` (same maintainers).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `package.json` `version` (`0.1.0`, `private`) should stay unchanged; only `register-openapi.ts` carries the contract version | Anti-Patterns | Low — if `web` or tooling reads `package.json` version (it doesn't; it consumes the artifact), this would mislead. CONTEXT names only `register-openapi.ts`. |
| A2 | The contract-diff job should be a *separate required* job rather than a step in `verify` | Code Examples | Low — both block merge if required; separate is the recommendation, not a hard requirement (CONTEXT leaves this to discretion). |

**Note:** oasdiff action ref/version, inputs, severity classification, additive-pass behavior, 3.0.3 support, git-revision base syntax, and the artifact's actual pagination/steam64/version state are all VERIFIED — not assumed.

## Open Questions

1. **Should `/operations/*` offset pagination be flagged for future migration?**
   - What we know: public `/stats/*` uses cursor; `/operations/*` still uses offset (`page`/`pageSize`/`total`). Out of scope for Phase 19 (operator-facing, not the public `web` contract).
   - What's unclear: whether a future phase wants operator endpoints on cursor too.
   - Recommendation: leave as-is; note in README/plan that the frozen-contract pagination assertion is intentionally scoped to public `/stats/*`. Do not migrate ops endpoints in this phase.

2. **Branch protection / required-status wiring.**
   - What we know: the gate only blocks merges if the job is a *required* status check in repo branch-protection settings.
   - What's unclear: whether branch protection is managed in-repo or via GitHub settings (not in the repo).
   - Recommendation: plan a `checkpoint:human-verify` task or a note instructing the maintainer to mark `Contract diff` (and `Verify`) as required status checks on the protected branch — otherwise the gate is advisory only.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GitHub Actions runner | contract-diff job | ✓ (CI) | ubuntu-latest | — |
| oasdiff action | FREEZE-03 | ✓ (fetched at job runtime) | v0.0.56 | — |
| docker-compose postgres/rabbitmq/minio | FREEZE-04 (existing) | ✓ (already in cd.yml) | — | — |
| Node 25 / pnpm | unit + integration suites | ✓ (cd.yml setup) | 25 / 11 | local shell is Node 22 (warning only; CI is 25) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none blocking. (Local dev runs Node 22 vs target 25 — emits engine warnings only; CI is authoritative.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | (vitest invoked via package scripts; unit suite excludes `src/test/integration/**` and `**/tests/postgres.test.ts`) |
| Quick run command | `pnpm test` (fast, DB-free unit suite — the new frozen-contract test runs here) |
| Full suite command | `pnpm run verify` (format→lint→typecheck→test→test:integration→openapi:check→ops checks→coverage) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FREEZE-01 | `info.version === "1.0.0"` in artifact | unit (static) | `pnpm test` (frozen-contract test) | ❌ Wave 0 — new test file |
| FREEZE-01/03 | regenerated artifact byte-equals committed | script | `pnpm run openapi:verify` | ✅ exists |
| FREEZE-02 | artifact path generates `web` types cleanly | script | `pnpm run openapi:check` | ✅ exists |
| FREEZE-03 | breaking changes fail, additive pass | CI | oasdiff `breaking@v0.0.56` job | ❌ Wave 0 — new CI job |
| FREEZE-03 (a) | public lists carry no page/pageSize/total | unit (static) | `pnpm test` (frozen-contract test) | ❌ Wave 0 — new test file |
| SEC (b) | no full Steam64 in artifact | unit (static) | `pnpm test` (frozen-contract test) | ❌ Wave 0 — new test file (complements existing real-pg leak-guard) |
| FREEZE-04 | PG integration tests run in CI | CI (existing) | `cd.yml verify` job → `pnpm run test:integration` | ✅ exists — verify-and-keep |

### Sampling Rate
- **Per task commit:** `pnpm test` (fast; runs frozen-contract test).
- **Per wave merge:** `pnpm run verify` (includes drift gate, integration, coverage).
- **Phase gate:** full `pnpm run verify` green + the new CI `contract-diff` job green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/openapi/frozen-contract.test.ts` (or co-located unit test) — covers FREEZE-01 (c), FREEZE-03 (a), SEC (b). DB-free, in fast suite.
- [ ] New `contract-diff` job in `.github/workflows/cd.yml` — covers FREEZE-03.
- [ ] No framework install needed — Vitest + scripts already present.

## Security Domain

> `security_enforcement: true`, ASVS level 2. This phase adds no runtime attack surface (CI + tests + version string only), but it *hardens* an existing control.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth changes. |
| V3 Session Management | no | — |
| V4 Access Control | no | No route/role changes. |
| V5 Input Validation | no | No new inputs. |
| V6 Cryptography | no | — |
| V8 Data Protection / V9 Information Disclosure | yes | Steam64 leak prevention — the static artifact Steam64 assertion (b) is a defense-in-depth layer on top of the existing real-pg `steamid-leak-guard.test.ts`. |
| V14 Configuration | yes | Supply-chain: pin the oasdiff action to an exact tag (`v0.0.56`); CI-only, no runtime dependency added. |

### Known Threat Patterns for {CI + contract artifact}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Full Steam64 leaks into the published contract artifact (e.g. via an example or enum) | Information Disclosure | Static `7656119\d{10}` assertion over the committed artifact JSON (verified zero matches today). |
| Malicious/compromised CI action | Tampering / Elevation | Pin `oasdiff/oasdiff-action/breaking@v0.0.56` (exact tag; SHA-pin optional for stricter policy). CI-only, no runtime/`package.json` reach. |
| Gate is advisory, not enforced | Tampering (silent contract drift) | Mark `Contract diff` + `Verify` as required status checks in branch protection (Open Question 2). |
| Stale baseline hides a breaking change | Tampering | Existing `openapi:verify` byte-equality drift gate ensures committed == code. |

## Sources

### Primary (HIGH confidence)
- github.com/oasdiff/oasdiff-action (README, releases) — action ref `oasdiff/oasdiff-action/breaking`, latest `v0.0.56` (2026-06-06), full input list, git-revision base syntax, no Node/package.json requirement.
- github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES.md — ERR/WARN/INFO severity model, additive=non-breaking, `breaking` reports ERR+WARN, `fail-on` threshold semantics.
- Local artifact `openapi/server-2.openapi.json` (walked this session) — verified pagination shapes, `total` domain-stat placement, zero Steam64, current `0.1.0`/`3.0.3`.
- Local files: `register-openapi.ts`, `export-openapi.ts`, `verify-openapi.ts`, `package.json` scripts, `.github/workflows/cd.yml`, `steamid-leak-guard.test.ts`.

### Secondary (MEDIUM confidence)
- oasdiff.com/docs/github-action — corroborating action usage (page partially timed out; superseded by README + releases which were fully read).

### Tertiary (LOW confidence)
- None relied upon for any claim.

## Project Constraints (from AGENTS.md / CLAUDE.md)
- **Zero new runtime dependencies:** honored — oasdiff is CI-only, no `package.json` change.
- **OpenAPI is the `web` contract:** the artifact path `openapi/server-2.openapi.json` MUST stay stable; `1.0.0` is a version-string change `web` picks up automatically (no shape change → generated client stays compatible).
- **Keep README current:** add the contract/bump-policy section (CONTEXT requires it; AGENTS.md requires README reflect scope/workflow changes).
- **Leave git tree clean / commit completed work:** `commit_docs: true` — commit RESEARCH.md and all phase artifacts.
- **GSD workflow for edits:** all changes flow through the phase plan/execute.
- **Project skills:** `solidstats-backend-ts-conventions` (test placement, TS strictness, lint rules — the new test must satisfy ESLint 10 `all` + Unicorn + Prettier and the repo's `no-magic-numbers`/`id-length` style as seen in the leak-guard file's eslint-disable header) and `solidstats-backend-ts-tests` (Vitest AAA, isolation, DB-free placement in the fast suite).

## Metadata

**Confidence breakdown:**
- Standard stack (oasdiff action ref/version/inputs): HIGH — verified against official repo README + releases dated 2 days ago.
- Architecture / CI wiring: HIGH — git-revision base + fail-on=ERR from official docs; cd.yml structure read directly.
- Pitfalls (pagination-metadata scoping): HIGH — verified by walking the actual committed artifact; the false-positive risk is concrete and reproduced.
- Static test pattern: HIGH — example derived from verified artifact structure.

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 for the contract-state findings (stable). oasdiff action releases frequently (~daily early June 2026) — re-confirm the pinned tag if planning slips more than ~2 weeks, though `v0.0.56` remains valid to pin regardless.
</content>
</invoke>
