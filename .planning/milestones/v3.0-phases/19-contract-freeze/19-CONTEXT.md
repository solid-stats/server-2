# Phase 19: Contract Freeze - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss — grey areas auto-decided by Claude (per autonomous mode + user preference to make backend calls directly) and recorded below as locked decisions.

<domain>
## Phase Boundary

Freeze the public OpenAPI contract at a stable `1.0.0` and protect it with CI gates so `web` can generate types safely. This phase changes versioning and adds guardrails/tests only — it does NOT change any API behavior, route, or response shape. All read/write surfaces from Phases 14–18 are already landed; this phase makes the contract trustworthy and hard to break accidentally.

In scope: version bump to `1.0.0`, a stable published artifact path, a CI OpenAPI breaking-change classification gate, reliance on the existing CI postgres-integration freeze gate, and a DB-free static "frozen-contract" test. Out of scope: new endpoints, response-shape changes, the deferred winner-fix hardening (WR-04/WR-05), and the Vite tooling migration (backlog 999.1).
</domain>

<decisions>
## Implementation Decisions

### Version & Published Artifact
- Bump `info.version` from `"0.1.0"` to `"1.0.0"` in `src/openapi/register-openapi.ts` (single source of truth for the version). Keep `openapi: 3.0.3`.
- The published artifact path is the already-committed `openapi/server-2.openapi.json`, produced by `pnpm run openapi:export`. This file is BOTH the artifact `web` consumes via `openapi-typescript` AND the committed baseline snapshot used for diffing. Do NOT introduce a second/duplicate artifact path.
- Regenerate and commit `openapi/server-2.openapi.json` so it reflects `1.0.0` plus every Phase 14–18 surface.

### CI Diff Classification (the core new work)
- Add a CI gate that classifies the OpenAPI diff between the PR's code-generated spec and the committed baseline using **oasdiff via its official GitHub Action** — CI-only, no runtime/`package.json` dependency (honors the project's zero-new-runtime-dependency posture).
- Additive / backward-compatible changes → PASS (treated as a minor-level change). Breaking changes → FAIL the job UNLESS the same PR intentionally bumps the major version AND updates the committed baseline snapshot in the same change.
- Keep the existing `openapi:verify` drift check (regenerated-from-code must byte-equal the committed file) in `pnpm run verify` so the baseline can never silently go stale. The classification gate sits on top of, not instead of, the drift check.
- The diff base for breaking-change detection is the spec on the PR's base branch (the previously frozen contract).

### Freeze Gates (tests)
- The existing CI (`.github/workflows/cd.yml`) ALREADY runs the postgres/rabbitmq/minio integration suite and the real-pg Steam64 leak-guard via `pnpm run verify`. Phase 19 RELIES ON and confirms this as the freeze gate (ROADMAP SC3) — verify-and-keep, do NOT rebuild a parallel CI path.
- Add a DB-free static "frozen-contract" test over the committed `openapi/server-2.openapi.json` that asserts: (a) no list/collection response schema carries `page`, `pageSize`, or `total` properties (cursor pagination only); (b) no full Steam64 (`/7656119\d{10}/`) appears anywhere in the artifact JSON; (c) `info.version === "1.0.0"`. This test runs in the fast unit suite (no services).

### Bump Policy (documented)
- `1.0.0` is the frozen baseline. Going forward: additive change → minor bump; breaking change → major bump + committed-baseline-snapshot update in the same PR. Document this policy in README (contract section) so future contributors and `web` know the compatibility contract.

### Claude's Discretion
- Exact pinned oasdiff action version and flag set (fail-on=breaking, base/revision wiring).
- Placement/naming of the frozen-contract test file (follow existing `src/test/integration` vs unit conventions — prefer a DB-free unit/integration test that doesn't need services).
- Exact README wording for the bump policy.
- Whether the CI classification runs as a new step in the existing `verify` job or a separate job (pick the lower-friction option that still blocks merges).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/openapi/register-openapi.ts:12` — `version: "0.1.0"` (the version to bump).
- `src/openapi/export-openapi.ts` — writes `openapi/server-2.openapi.json` via `createOpenApiSchema()`.
- `src/openapi/verify-openapi.ts` — fails if committed `openapi/server-2.openapi.json` != freshly generated (drift gate). Already wired into `pnpm run verify` and `openapi:check`.
- `openapi/server-2.openapi.json` — committed artifact (currently `0.1.0`, OpenAPI 3.0.3).
- `src/test/integration/steamid-leak-guard.test.ts` — existing Steam64 leak sweep (extended in Phase 18 to write-route bodies).

### Established Patterns
- npm scripts: `openapi:export`, `openapi:verify`, `openapi:check`; umbrella `verify` runs format→lint→typecheck→test→test:integration→openapi:check→ops checks→test:coverage.
- CI `.github/workflows/cd.yml` (job `verify`) spins up docker-compose postgres/rabbitmq/minio, runs `pnpm run verify`, then builds the image on non-PR events. Node 25, pnpm, frozen lockfile.
- Cursor pagination (no page/pageSize/total) established in Phase 14; Steam64 masking established in Phases 14/17.

### Integration Points
- `web` generates types from `openapi/server-2.openapi.json` via `openapi-typescript` — the artifact PATH must stay stable. The `1.0.0` bump is a version-string change web picks up automatically; no shape change, so generated-client compatibility is preserved.
- New CI step lands in `.github/workflows/cd.yml`.

</code_context>

<specifics>
## Specific Ideas

- `web` consumes `openapi/server-2.openapi.json` via `openapi-typescript`; keep that exact path stable (cross-app contract).
- oasdiff is the chosen breaking-change detector specifically because it runs as a CI action without adding a Node/runtime dependency to this repo.
</specifics>

<deferred>
## Deferred Ideas

- WR-04 / WR-05 winner-fix hardening (winner-side whitelist; no-op-as-success) — frozen by Phase 18 HIST-04; needs a dedicated follow-up phase, not in-scope here.
- `18-SECURITY.md` threat-model verification (`/gsd-secure-phase 18`) — security gate owed before milestone archive; surface in milestone audit.
- Vite build/dev tooling migration — backlog phase 999.1.
</deferred>
