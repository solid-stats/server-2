---
phase: "12"
slug: legacy-public-export-contract
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-12
---

# Phase 12 Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run src/modules/statistics/export/tests/legacy-public-export.test.ts src/modules/statistics/repository/tests/legacy-export.test.ts src/operations/export-legacy-public-stats.test.ts` |
| Full suite command | `pnpm run verify` |
| Estimated runtime | ~35 seconds |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 12-01-01 | 12-01 | 1 | PUB-07 | Export deterministic player global statistics. | unit/repository | `pnpm vitest run src/modules/statistics/export/tests/legacy-public-export.test.ts src/modules/statistics/repository/tests/legacy-export.test.ts` | yes | green |
| 12-01-02 | 12-01 | 1 | PUB-08 | Export deterministic squad statistics. | unit/repository | `pnpm vitest run src/modules/statistics/export/tests/legacy-public-export.test.ts src/modules/statistics/repository/tests/legacy-export.test.ts` | yes | green |
| 12-01-03 | 12-01 | 1 | PUB-09 | Export rotation-scoped player and squad statistics. | unit/repository | `pnpm vitest run src/modules/statistics/export/tests/legacy-public-export.test.ts src/modules/statistics/repository/tests/legacy-export.test.ts` | yes | green |
| 12-01-04 | 12-01 | 1 | PUB-10 | Export `other_players`, `weapons`, and `weeks` detail surfaces. | unit/repository | `pnpm vitest run src/modules/statistics/export/tests/legacy-public-export.test.ts src/modules/statistics/repository/tests/legacy-export.test.ts` | yes | green |
| 12-01-05 | 12-01 | 1 | PUB-11 | Include public legacy fields, formulas, relationships, weapons, weekly buckets, and identity fields. | unit | `pnpm vitest run src/modules/statistics/export/tests/legacy-public-export.test.ts` | yes | green |
| 12-01-06 | 12-01 | 1 | PUB-12 | Include deterministic metadata for source database, command version, corpus scope, generated time, and contract version. | unit/operation | `pnpm vitest run src/operations/export-legacy-public-stats.test.ts` | yes | green |
| 12-02-01 | 12-02 | 2 | PUB-13 | Document normalization boundaries for parser-level non-public differences. | docs check | `pnpm run verify` | yes | green |
| 12-02-02 | 12-02 | 2 | API-05 | Preserve public API/OpenAPI compatibility for the operator export command. | contract check | `pnpm run openapi:check` | yes | green |

## Wave 0 Requirements

Existing Vitest, PostgreSQL repository tests, and OpenAPI verification covered all Phase 12 requirements.

## Manual-Only Verifications

All Phase 12 requirements have automated or documentation verification.

## Validation Sign-Off

- All tasks have automated verification.
- Sampling continuity preserved through focused Vitest runs and full `pnpm run verify`.
- No watch-mode flags used.
- `pnpm run verify` passed.
- Approval: approved 2026-05-12.
