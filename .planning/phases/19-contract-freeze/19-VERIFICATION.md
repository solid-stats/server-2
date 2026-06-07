---
phase: 19-contract-freeze
verified: 2026-06-08T02:05:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Branch protection — mark 'Contract diff' and 'Verify' as required status checks on the default branch (master), then open a deliberately breaking OpenAPI PR and confirm the merge button is blocked"
    expected: "Both 'Verify' and 'Contract diff' appear as required status checks; a breaking-change PR shows 'Contract diff' FAILING and merge is blocked"
    why_human: "GitHub repo Settings -> Branches lives outside the repository; it cannot be set or read via repo files, CLI, or API within phase scope. Without it the CI gates run but are advisory only (T-19-05). This is the planned checkpoint:human-verify (Task 3 of 19-02)."
  - test: "Confirm a CI run of the 'Verify' job is green (docker-compose postgres/rabbitmq/minio + pnpm run verify, including test:integration and test:coverage)"
    expected: "CI 'Verify' job passes: real-pg integration suite (incl. steamid-leak-guard) and coverage gate both green on Node 25"
    why_human: "No live PostgreSQL/RabbitMQ/S3 locally — the integration + coverage steps of pnpm run verify only run in CI. DB-free steps (format, lint, typecheck, pnpm test 4/4 frozen-contract, openapi:check) were confirmed green locally this session; the DB-dependent half is CI-authoritative."
---

# Phase 19: Contract Freeze Verification Report

**Phase Goal:** The OpenAPI contract is frozen at a stable `1.0.0` and protected by CI gates so `web` can generate types safely.
**Verified:** 2026-06-08T02:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All four ROADMAP success criteria are observably true in the codebase. All artifacts exist, are substantive, and are wired. The phase produces a code-complete contract freeze. Status is `human_needed` (not `passed`) solely because two checks are CI/GitHub-only and cannot be executed in the local verification environment: the branch-protection requirement (a planned `checkpoint:human-verify`) and the live-DB half of the `Verify` job. No gaps, no blockers.

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | `register-openapi.ts` carries `version: "1.0.0"` as single source of truth | ✓ VERIFIED | `src/openapi/register-openapi.ts:12` `version: "1.0.0"`; `openapi: "3.0.3"` unchanged (line 9) |
| 2  | Committed artifact `openapi/server-2.openapi.json` has `info.version == 1.0.0` | ✓ VERIFIED | `openapi/server-2.openapi.json:5` `"version": "1.0.0"` |
| 3  | `package.json` version stays `0.1.0` (single source of truth preserved) | ✓ VERIFIED | `package.json:3` `"version": "0.1.0"` (RESEARCH A1) |
| 4  | web can generate types from the unchanged artifact path (drift gate + codegen) | ✓ VERIFIED | `pnpm run openapi:check` exit 0; `openapi-typescript ... -> /tmp/server-2-openapi.d.ts` succeeded; drift gate `verify-openapi.ts` green |
| 5  | DB-free frozen-contract test asserts version, no full Steam64, scoped pagination — in fast suite, no docker | ✓ VERIFIED | `src/openapi/frozen-contract.test.ts` 4/4 pass via `vitest run` (77ms, no services); file at `src/openapi/` (outside integration globs); no `buildApp`/`Pool` imports |
| 6  | Pagination assertion scoped to `/stats/*`, incl. nested leaderboards cursor envelopes, non-vacuous | ✓ VERIFIED | `collectListSchemas` recurses one level into `/stats/leaderboards` sub-envelopes (WR-02 fix); `inspected > 0` floor + `LEADERBOARD_SUB_ENVELOPES >= 3` coverage proof; negative control asserts injected top-level AND nested `page` are reported (`inspected == 2`) |
| 7  | Zero full Steam64 anywhere in the artifact (raw-text sweep, no float64 round-trip) | ✓ VERIFIED | `grep -cE '7656119[0-9]{10}' openapi/server-2.openapi.json` = 0; test reads RAW file text (WR-03 fix) matching `/7656119\d{10}/u` |
| 8  | Separate `contract-diff` CI job classifies PR base vs HEAD via oasdiff | ✓ VERIFIED | `.github/workflows/cd.yml:61-77` `contract-diff` job; base `origin/${{ github.base_ref }}:openapi/server-2.openapi.json`, revision `HEAD:openapi/server-2.openapi.json` |
| 9  | oasdiff pinned to an IMMUTABLE commit SHA; additive passes / ERR breaking fails | ✓ VERIFIED | `oasdiff/oasdiff-action/breaking@5ffbc910f1d1742f0dd9bf846a7f86954353556b # v0.0.56` (WR-01 fix, full 40-char SHA); `fail-on: ERR` (line 77) |
| 10 | contract-diff runs only on `pull_request`, checks out full history (`fetch-depth: 0`) | ✓ VERIFIED | `if: github.event_name == 'pull_request'` (line 64); checkout `fetch-depth: 0` (line 70); YAML valid, `jobs = {contract-diff, image, verify}` |
| 11 | Existing `verify` job remains the PG integration freeze gate (verify-and-keep) | ✓ VERIFIED | `cd.yml` `verify` job runs `docker compose up -d postgres rabbitmq minio` + `pnpm run verify`; `package.json` `verify` chains `test:integration` → `src/test/integration` incl. `steamid-leak-guard.test.ts` (24KB, present); job byte-unchanged |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/openapi/register-openapi.ts` | version literal `1.0.0` | ✓ VERIFIED | `version: "1.0.0"` at line 12; no `0.1.0` remaining |
| `openapi/server-2.openapi.json` | published `1.0.0` artifact at stable path | ✓ VERIFIED | `info.version` `1.0.0`; 22 `/stats/*` + 7 `/operations/*` paths present (full 14–18 surface) |
| `src/openapi/frozen-contract.test.ts` | DB-free frozen-contract invariants, ≥40 lines | ✓ VERIFIED | 291 lines, 4 tests, no DB/app imports; runs in fast suite |
| `.github/workflows/cd.yml` | `contract-diff` job alongside verify/image | ✓ VERIFIED | Job present; verify/image intact; valid YAML |
| `README.md` | bump-policy section | ✓ VERIFIED | "Contract version and bump policy" section: additive→minor, breaking→major+baseline, two-gate layering, `/stats/*` scope note, PG freeze-gate sentence |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `register-openapi.ts` | `openapi/server-2.openapi.json` | `openapi:export` / drift gate | ✓ WIRED | `openapi:verify` byte-equality drift gate green inside `openapi:check` (exit 0) |
| `frozen-contract.test.ts` | `openapi/server-2.openapi.json` | `readFile(resolve(...))` | ✓ WIRED | Test reads the real committed artifact; 4/4 pass against live file |
| `cd.yml contract-diff` | artifact base vs revision | `oasdiff@5ffbc910...` git-revision | ✓ WIRED | Exact-SHA pin, base/revision git-revision syntax, `fail-on: ERR` |
| `cd.yml contract-diff` | base branch history | `checkout@v6 fetch-depth: 0` | ✓ WIRED | Full history + PR-only guard so `origin/${{ github.base_ref }}` resolves |
| `cd.yml verify` | PG integration suite | `pnpm run verify` → `test:integration` | ✓ WIRED | docker-compose services + verify chain including real-pg leak guard |

### Data-Flow Trace (Level 4)

Not applicable in the rendering sense — this phase ships a static contract artifact, a static test, CI config, and docs (no dynamic data-rendering components). The "data" is the committed artifact: confirmed it carries the real full 14–18 surface (22 `/stats/*` paths, 7 `/operations/*` paths) and version `1.0.0`, not a stub/empty document.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Frozen-contract test passes in fast suite | `vitest run src/openapi/frozen-contract.test.ts` | 4 passed (4) in 77ms, no services | ✓ PASS |
| Drift gate + web type generation | `pnpm run openapi:check` | exit 0; types written to `/tmp/server-2-openapi.d.ts` | ✓ PASS |
| Zero full Steam64 in artifact | `grep -cE '7656119[0-9]{10}' openapi/server-2.openapi.json` | 0 | ✓ PASS |
| Repo-wide lint clean | `eslint .` | exit 0, 0 errors | ✓ PASS |
| Formatting clean | `prettier --check .` | "All matched files use Prettier code style!" | ✓ PASS |
| Typecheck clean | `tsc --noEmit` | exit 0, 0 errors | ✓ PASS |
| Workflow YAML valid + jobs map | `yaml.safe_load(cd.yml)` | jobs = {contract-diff, image, verify} | ✓ PASS |
| PG integration suite (test:integration / test:coverage) | n/a | no live PostgreSQL/RabbitMQ/S3 locally | ? SKIP → human (CI-authoritative) |

### Probe Execution

No project probes apply to this phase (no `scripts/*/tests/probe-*.sh`; not a migration/tooling probe phase). Verification used the phase's own DB-free gate commands instead.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| FREEZE-01 | 19-01 | Bump contract version `0.1.0`→`1.0.0` | ✓ SATISFIED | Truths 1–3; register-openapi.ts + artifact both `1.0.0`, package.json unchanged |
| FREEZE-02 | 19-01 | Published OpenAPI artifact path for web `openapi-typescript` | ✓ SATISFIED | Truth 4; stable path `openapi/server-2.openapi.json`, `openapi:check` generates types |
| FREEZE-03 | 19-01, 19-02 | CI classifies diffs (additive pass / breaking fail) | ✓ SATISFIED | Truths 5–10; `contract-diff` oasdiff job (immutable SHA, ERR, PR-only, fetch-depth 0) + scoped non-vacuous frozen-contract test |
| FREEZE-04 | 19-01, 19-02 | PostgreSQL integration tests run in CI as freeze gate | ✓ SATISFIED | Truth 11; existing `verify` job + `pnpm run verify` → `test:integration` (real-pg leak guard), verify-and-keep |

All four PLAN-declared requirement IDs (FREEZE-01..04) are present in REQUIREMENTS.md (lines 53–56, mapped to Phase 19, lines 119–122) and accounted for. No orphaned requirements: REQUIREMENTS.md maps exactly these four IDs to Phase 19.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No `TBD`/`FIXME`/`XXX` debt markers in any phase-modified file; no stubs, no hardcoded-empty rendering values. Test reads the live artifact. |

### Human Verification Required

#### 1. Branch protection — required status checks

**Test:** In GitHub repo Settings → Branches → branch protection rule for `master`, enable "Require status checks to pass before merging" and add BOTH `Verify` and `Contract diff` as required checks. Then open a PR with a deliberately breaking OpenAPI change (e.g. remove a public field, `pnpm run openapi:export`) and confirm `Contract diff` FAILS and the merge button is blocked. Revert the experiment.
**Expected:** Both checks listed as required; breaking-change PR is merge-blocked.
**Why human:** GitHub repo settings live outside the repository; not settable/readable via repo files, CLI, or API within phase scope. Until done, the gates are advisory only (threat T-19-05). This is the planned `checkpoint:human-verify` (19-02 Task 3).

#### 2. CI Verify job green (live-DB half)

**Test:** Confirm a CI run of the `Verify` job passes on Node 25 — docker-compose postgres/rabbitmq/minio + `pnpm run verify` including `test:integration` (real-pg `steamid-leak-guard.test.ts`) and `test:coverage`.
**Expected:** Verify job green; real serialized responses and the no-full-SteamID guard pass; coverage gate met.
**Why human:** No live PostgreSQL/RabbitMQ/S3 in the local verification environment — the integration + coverage steps only run in CI. DB-free steps were confirmed green locally this session (format, lint exit 0, typecheck exit 0, `pnpm test` frozen-contract 4/4, `openapi:check` exit 0).

### Gaps Summary

No gaps. All 11 derived must-haves (covering all 4 ROADMAP success criteria and all 4 FREEZE requirements) are VERIFIED against the codebase. The three code-review warnings (WR-01 immutable-SHA pin, WR-02 nested leaderboards coverage, WR-03 raw-text Steam64 sweep) were all fixed and independently confirmed here. Status is `human_needed` rather than `passed` only because two verification items are inherently outside the local environment: the GitHub branch-protection setting (a planned human-verify checkpoint that converts the advisory gates into enforced merge blocks) and the live-DB half of the CI `Verify` job.

**Known follow-ups (NOT gaps, per phase context):**
- Branch-protection manual step (item 1 above) — GitHub setting, planned checkpoint.
- WR-04/WR-05 winner-fix hardening — frozen by Phase 18 HIST-04; deferred to a dedicated follow-up.
- `18-SECURITY.md` threat verification — owed before milestone archive; surface in milestone audit.

---

_Verified: 2026-06-08T02:05:00Z_
_Verifier: Claude (gsd-verifier)_
