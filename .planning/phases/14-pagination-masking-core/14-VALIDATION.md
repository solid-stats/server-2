---
phase: 14
slug: pagination-masking-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 (V8 coverage) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm run verify` |
| **Integration command** | `pnpm run test:integration` (Docker pg) |
| **Estimated runtime** | ~30s quick · ~2–4 min full |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm run test:integration` + `pnpm run openapi:check`
- **Before verification:** `pnpm run verify` must be green
- **Max feedback latency:** ~30 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| cursor-codec | 1 | PAGE-01 | base64url encode/decode round-trips; malformed/oversized token → 400, never throws Steam64 in message | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| keyset-builder | 1 | PAGE-02 | seek predicate in HAVING; expanded-OR with explicit NULL branches; stable across page boundary incl. shared values + NULL keys | unit + integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| sort-whitelist | 1 | PAGE-02 | unknown sort field rejected 400; default sort applied; cursor sort/order mismatch rejected | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| mixed-param-reject | 1 | PAGE-01 | request with both `page` and `cursor` → 400; leftover `page`/`pageSize` → 400 | unit + integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| steamid-mask | 1 | SEC-01, SEC-02 | mapper emits `...7890` masked form only; `7656119\d{10}` regex = 0 matches in body/cursor/logs/errors | unit + guard | `pnpm test` | ❌ W0 | ⬜ pending |
| migrate-endpoints | 2 | PAGE-03 | players/squads/bounty/leaderboards return `items`+`nextCursor`+`hasMore`; no `total`/`page`/`pageSize` in any response | integration | `pnpm run test:integration` | ❌ W0 | ⬜ pending |
| openapi-contract | 2 | PAGE-01, PAGE-03 | exported OpenAPI has no `total`/`page`/`pageSize`; `pnpm run openapi:check` green | contract | `pnpm run openapi:check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Unit test files co-located per unit (`cursor/cursor.test.ts`, keyset builder tests) following the RITE/AAA conventions
- [ ] Integration tests under `src/test/integration/` for cross-page-boundary keyset stability and the Steam64 zero-match guard
- [ ] A reusable `expectNoSteam64(payload)` test helper asserting `7656119\d{10}` finds zero matches (body, serialized cursor, captured log lines)

*Existing Vitest + integration infrastructure covers the framework; only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live log output carries no Steam64 | SEC-01 | pino redaction is runtime behavior | Hit `/stats/players/:id` against seeded data; grep captured logs for `7656119\d{10}` → expect zero |

*Most phase behaviors have automated verification; the log-redaction check is also covered by an automated captured-transport test where feasible.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
