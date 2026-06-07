---
status: testing
phase: 19-contract-freeze
source: [19-VERIFICATION.md]
started: 2026-06-08
updated: 2026-06-08
---

## Current Test

number: 1
name: Branch protection — mark `Contract diff` + `Verify` as required status checks
expected: |
  In GitHub → Settings → Branches → protection rule for `master`/`main`, "Require status
  checks to pass before merging" is enabled and BOTH `Verify` and `Contract diff` are listed
  as required. A PR introducing a breaking OpenAPI change (without a major bump + baseline
  update) is blocked from merging.
awaiting: user response

## Tests

### 1. Branch protection required-status wiring
expected: `Contract diff` and `Verify` are required status checks on the protected branch; a breaking-change PR is blocked from merge. (GitHub repository setting — cannot be code-tested.)
result: [pending]

### 2. CI freeze gate (live-DB half) green on a real PR
expected: On a pull request, the `Verify` job (docker-compose postgres/rabbitmq/minio → `pnpm run verify`, incl. `test:integration` real-pg Steam64 leak guard + coverage) passes, and the `contract-diff` job classifies the OpenAPI diff (additive → pass, breaking → fail). Locally only the DB-free steps were confirmed (format/lint/typecheck/test/openapi:check all green); the integration + coverage steps require CI services.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
