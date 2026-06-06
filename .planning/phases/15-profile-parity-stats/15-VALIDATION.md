---
phase: 15
slug: profile-parity-stats
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `15-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + `@vitest/coverage-v8` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` (unit; excludes `*/tests/postgres.test.ts` + `src/test/integration`) |
| **Full suite command** | `pnpm run verify` (format, lint, typecheck, test, test:integration, openapi:check, coverage) |
| **Integration command** | `pnpm run test:integration` (real pg, `--no-file-parallelism`) |
| **Estimated runtime** | unit ~tens of seconds; integration adds real-pg startup |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test` (fast unit + byte-identical legacy-export guards).
- **After every plan wave:** Run `pnpm run test:integration` + `pnpm run openapi:check`.
- **Before `/gsd:verify-work`:** `pnpm run verify` must be green.
- **Max feedback latency:** unit < ~60s.

---

## Per-Task Verification Map

| Req ID | Behavior | Wave | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|------|------------|-----------------|-----------|-------------------|-------------|--------|
| INV | CLI legacy export stays byte-identical | 0/all | — | unscoped parity-sql == legacy constant | unit | `pnpm test` (`legacy-export.test.ts`, `legacy-public-export.test.ts`, `export-legacy-public-stats.test.ts`) | ✅ exists — must stay green | ⬜ pending |
| PARITY-01 | per-player weapons surface = legacy | 1 | T-leak-steam64 | targets `{id,displayName}` only; no Steam64 | integration (real pg) | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| PARITY-02 | vehicle stats (counters + vehicles group) | 1 | — | param `$1::uuid` scope | integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| PARITY-03 | relationships (killed/killers/teamkilled/teamkillers) | 1 | T-leak-steam64 | `{id,displayName}` only | integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| PARITY-04 | weekly buckets | 1 | — | scoped query, no seq-scan | integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| PARITY-05 | KD / score / total games on profile | 1 | — | pure formulas reused from export | unit (formulas) + integration (route) | `pnpm test` + `pnpm run test:integration` | ⚠️ formulas covered; route W0 | ⬜ pending |
| PARITY-06 | squad parity surfaces (KD/score/games + member sums) | 1 | T-leak-steam64 | masking choke-point | integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| SEC | regex `7656119\d{10}` finds zero over bodies/tokens/errors | 1 | T-leak-steam64 | masking enforced at mapper | integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/modules/public-stats/tests/postgres.test.ts` — add scoped parity cases (seed already present:
      `canonical_players`, `parser_events`, `player_stats`, `replays`).
- [ ] (if a new formula module is created) `src/modules/statistics/parity-formulas.test.ts` — otherwise
      formulas remain covered by `legacy-public-export.test.ts`.
- [ ] Optional assert-test: unscoped parity-sql builder output equals the legacy SQL constant (Pitfall 1).
- [ ] Regenerate + commit `openapi/server-2.openapi.json` (freeze gate, not a test).
- Framework install: not required (Vitest already configured).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | parity is fully automatable against real pg | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
