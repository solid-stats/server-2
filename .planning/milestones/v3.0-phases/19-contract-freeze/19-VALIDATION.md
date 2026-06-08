---
phase: 19
slug: contract-freeze
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-08
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `19-RESEARCH.md` → Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | none dedicated — Vitest invoked via package scripts (`test` excludes `src/test/integration/**` and `**/tests/postgres.test.ts`) |
| **Quick run command** | `pnpm test` (fast, DB-free unit suite — the new frozen-contract test runs here) |
| **Full suite command** | `pnpm run verify` (format→lint→typecheck→test→test:integration→openapi:check→ops checks→coverage) |
| **Estimated runtime** | quick ~20s; full suite multi-minute (needs docker-compose services, CI-authoritative) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm run verify` (includes the `openapi:verify` drift gate)
- **Before `/gsd-verify-work`:** Full `pnpm run verify` green AND the new CI `contract-diff` job green
- **Max feedback latency:** ~20 seconds (quick suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | FREEZE-01 | T-19-V14 / — | `info.version` is `1.0.0`; regenerated artifact byte-equals committed | script | `pnpm run openapi:verify` | ✅ exists | ⬜ pending |
| 19-01-02 | 01 | 1 | FREEZE-01, FREEZE-03(a) | T-19-V9 | public `/stats/*` lists carry no `page`/`pageSize`/`total`; no `7656119\d{10}` in artifact; version === 1.0.0 | unit (static) | `pnpm test` (frozen-contract test) | ❌ W0 (new file) | ⬜ pending |
| 19-02-01 | 02 | 2 | FREEZE-02, FREEZE-03 | T-19-V14 | breaking changes fail CI; additive pass; oasdiff pinned `v0.0.56`, CI-only | CI | oasdiff `oasdiff/oasdiff-action/breaking@v0.0.56` job (`fail-on: ERR`) | ❌ W0 (new CI job) | ⬜ pending |
| 19-02-02 | 02 | 2 | FREEZE-04 | — | PG integration + real-pg leak-guard run in CI as freeze gate | CI (existing) | `cd.yml` verify job → `pnpm run test:integration` | ✅ exists (verify-and-keep) | ⬜ pending |
| 19-02-03 | 02 | 2 | FREEZE-02 | — | `Contract diff` + `Verify` marked as required status checks on protected branch | manual | `checkpoint:human-verify` (GitHub branch-protection setting) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/openapi/frozen-contract.test.ts` — DB-free static assertions for FREEZE-01 (version), FREEZE-03(a) (scoped `/stats/*` pagination), SEC (no Steam64). Runs in the fast `pnpm test` suite.
- [ ] New `contract-diff` job in `.github/workflows/cd.yml` — oasdiff breaking-change classification (FREEZE-02/03).
- [x] No framework install needed — Vitest + package scripts already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `Contract diff` + `Verify` jobs are required status checks on the protected branch | FREEZE-02 | Branch protection is a GitHub repository setting, not in-repo code — cannot be asserted by a test | In GitHub repo Settings → Branches → branch-protection rule for `master`/`main`, add `Contract diff` and `Verify` to required status checks; confirm a PR with a breaking change is blocked from merge |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (19-02-03 is the single, justified manual checkpoint — branch protection cannot be code-tested)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (frozen-contract test + contract-diff job)
- [x] No watch-mode flags (`pnpm test` = `vitest run`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-08
