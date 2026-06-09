---
phase: 16
slug: slug-resolution-history-provenance
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-07
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `16-RESEARCH.md` → Validation Architecture (lines 484-522).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + `@vitest/coverage-v8` |
| **Config file** | unit + integration as separate Vitest projects; integration under `src/test/integration/` and module `tests/` |
| **Quick run command** | `pnpm test` (unit) |
| **Full suite command** | `pnpm run verify` (format, lint, typecheck, test, test:integration, openapi:check, ops checks, coverage) |
| **Estimated runtime** | unit ~few s; full verify ~minutes (needs live PostgreSQL on :15432) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test` (unit) + targeted `pnpm run test:integration -- <file>`
- **After every plan wave:** Run `pnpm run test:integration` + `pnpm run openapi:check`
- **Before `/gsd:verify-work`:** `pnpm run verify` fully green (incl. 100% reachable-source coverage)
- **Max feedback latency:** unit < 10s

---

## Per-Requirement Verification Map

| Req | Behavior | Test Type | Automated Command | File / Status |
|-----|----------|-----------|-------------------|---------------|
| API-01 | `slugify` pure helper (ASCII-fold, Cyrillic translit, collapse/trim, id-fallback) | unit | `pnpm test -- slug` | ❌ W0 `routes/slug.test.ts` |
| API-01 | Backfill determinism: SQL `slug_base()` == TS `slugify` for fixture names; collision suffixing order-independent | integration | `pnpm run test:integration -- postgres` | ⚠ extend `tests/postgres.test.ts` |
| API-01 | partial-unique index rejects duplicate non-null slug; allows multiple nulls | integration | `pnpm run test:integration` | ❌ W0 |
| API-01 | resolve player/squad/rotation by UUID **and** slug; unknown → 404 (not 500) | integration (`app.inject`) | `pnpm run test:integration` | ⚠ extend `routes/tests/players.test.ts`, `squads.test.ts`; new rotations test |
| API-01 | `slug` present on summary/profile/rotation responses | integration | `pnpm run test:integration` | ⚠ extend |
| HIST-01 | name-history ordered ascending; open window `to=null`; `sourceReplayId` nullable | integration | `pnpm run test:integration` | ❌ W0 |
| HIST-02 | player + squad membership-history; counterpart `{id,slug,name/displayName}` only (no Steam64) | integration | `pnpm run test:integration` | ❌ W0 |
| HIST-01/02 | `withGaps` pure fn: between-gap, leading-gap, trailing-gap, open-last (no gap), adjacent (no gap), all-unknown bounds | unit | `pnpm test -- gaps` | ❌ W0 `routes/history-gaps.test.ts` |
| HIST-03 | provenance = max over returned rows; **null** when no rows; never `now()` | unit + integration | `pnpm test`; `pnpm run test:integration` | ❌ W0 |
| SEC-01/02 | Steam64 leak-guard extended to new history + rotation-detail endpoints | integration | `pnpm run test:integration -- steamid-leak-guard` | ⚠ extend `src/test/integration/steamid-leak-guard.test.ts` |
| contract | byte-identical legacy parity still green (Phase 15 gate) | integration | `pnpm run test:integration` | ✅ exists |
| contract | `openapi:check` green after regenerate+commit | CI | `pnpm run openapi:check` | ✅ exists |

---

## Wave 0 Requirements

- [ ] `src/modules/public-stats/routes/slug.test.ts` — slugify + looksLikeUuid + shortSuffix (API-01)
- [ ] `src/modules/public-stats/routes/history-gaps.test.ts` — `withGaps` pure fn edge cases (HIST-01/02)
- [ ] provenance unit tests (`maxTimestamp` null/aggregation) co-located with the mapper (HIST-03)
- [ ] integration: backfill determinism + partial-unique index behavior (extend `tests/postgres.test.ts`) (API-01)
- [ ] integration: new history + rotation-detail routes via `app.inject` (HIST-01/02, API-01)
- [ ] extend `src/test/integration/steamid-leak-guard.test.ts` route arrays (SEC-01/02)
- [ ] Framework install: none — Vitest already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | All phase behaviors have automated verification (pure helpers + integration via `app.inject` + real-pg harness). | — |

---

## Validation Sign-Off

- [ ] All requirements have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (unit)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
