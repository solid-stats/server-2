---
phase: "09"
slug: parser-counter-ingestion-and-aggregate-semantics
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-12
---

# Phase 09 Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run src/modules/statistics/parser-artifact.test.ts src/modules/statistics/service/tests/aggregates.test.ts src/modules/statistics/repository/tests/bounty.test.ts` |
| Full suite command | `pnpm run verify` |
| Estimated runtime | ~35 seconds |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 09-01-01 | 09-01 | 1 | STAT-10 | Preserve compact parser counters `d`, `td`, `tk`, `su`, `nkd`, `ud`, `vk`, and `kfv`. | unit | `pnpm vitest run src/modules/statistics/parser-artifact.test.ts` | yes | green |
| 09-01-02 | 09-01 | 1 | STAT-11 | Preserve kill-row evidence for relationships, weapons, vehicles, and bounty inputs. | unit | `pnpm vitest run src/modules/statistics/parser-artifact.test.ts src/modules/statistics/service/tests/aggregates.test.ts` | yes | green |
| 09-01-03 | 09-01 | 1 | STAT-12 | Use parser death counters as aggregate death evidence when present. | unit | `pnpm vitest run src/modules/statistics/service/tests/aggregates.test.ts` | yes | green |
| 09-01-04 | 09-01 | 1 | STAT-13 | Cover enemy death, teamkill death, suicide, null-killer death, unknown death, vehicle kill, kills-from-vehicle, and relationship rows. | unit | `pnpm vitest run src/modules/statistics/parser-artifact.test.ts src/modules/statistics/service/tests/aggregates.test.ts` | yes | green |
| 09-02-01 | 09-02 | 2 | STAT-14 | Keep bounty calculation strict so teamkills and non-enemy kills do not award points. | unit | `pnpm vitest run src/modules/statistics/repository/tests/bounty.test.ts` | yes | green |
| 09-02-02 | 09-02 | 2 | STAT-15 | Document backend-facing compact counter and kill-row interpretation. | docs check | `pnpm run verify` | yes | green |

## Wave 0 Requirements

Existing Vitest infrastructure covered all Phase 09 requirements.

## Manual-Only Verifications

All Phase 09 requirements have automated or documentation verification.

## Validation Sign-Off

- All tasks have automated verification.
- Sampling continuity preserved through focused Vitest runs and full `pnpm run verify`.
- No watch-mode flags used.
- `pnpm run verify` passed.
- Approval: approved 2026-05-12.
