---
phase: quick-260614-fw2
verified: 2026-06-14T11:56:00Z
status: human_needed
score: 4/5 must-haves verified (5th blocked only by RabbitMQ-down env, code correct)
overrides_applied: 0
human_verification:
  - test: "Run `pnpm verify` on a machine with RabbitMQ up (`docker compose up`)."
    expected: "Pipeline exits 0 (format, lint, typecheck, unit, integration incl. postgres.test.ts, openapi:check, ops:backup:check, ops:boundary:check, test:coverage all green). The only failure in this env was the pre-existing RabbitMQ-only `adapters.test.ts` connectivity smoke test (ECONNREFUSED 127.0.0.1:5673), which is unrelated to this change."
    why_human: "Full `pnpm verify` requires RabbitMQ on 127.0.0.1:5673, which is down in the verification environment. Every gate the verifier could run independently (typecheck, lint, the real-Postgres parity proof, the unit suite backing the rewritten mock, OpenAPI contract diff) passed; only the RabbitMQ-gated connectivity check blocks a 0-exit here."
---

# Quick Task 260614-fw2: Set-based canonical player identity resolution — Verification Report

**Task Goal:** Make canonical player identity resolution inside per-rotation statistics recalculation set-based (one batch resolve + batched inserts instead of a per-player sequential-query loop), keeping aggregate outputs (player_stats / squad_stats / commander_side_stats / bounty_points) AND the resulting fallback canonical_players / player_nicknames rows byte-identical to the previous per-replay path. Drop-in helper; legacy-public-export contract and ops:stats:recalculate audit path unchanged; OpenAPI contract untouched.

**Verified:** 2026-06-14T11:56:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Per-rotation recalc resolves all rotation players' canonical identities in O(1) DB round-trips (one batch resolve + two multi-row inserts), not one SELECT-plus-conditional-INSERT per occurrence. | ✓ VERIFIED | `ensureNameFallbackIdentities` (repository.ts L549-635) is fully set-based. `awk` count: exactly **3** `client.query` calls in the body (L560 resolve, L609 canonical insert, L621 nickname insert). The only `for` loop (L591) is a pure in-memory replay with **zero** queries inside. `git show 6ae1b1b^` confirms the OLD body was `for (const occurrence of occurrences) { SELECT cp.id ... limit 1; conditional 2× INSERT }` — that per-occurrence loop is GONE (`grep "select cp.id from canonical_players"` → not found). |
| 2 | Aggregates (player_stats / squad_stats / commander_side_stats / bounty_points) are byte-identical to the per-replay path on a rotation that creates new name-only fallback identities. | ✓ VERIFIED | Verifier **ran** the real-Postgres parity test (PG 15432 confirmed open): `vitest run postgres.test.ts -t "fallback"` → **5 passed, 0 failed**. Test L865 `expect(setBased.aggregates).toEqual(perReplay.aggregates)` passes; aggregates keyed by stable `display_name` (namedAggregateSnapshot, L1019) across the recreated-uuid fallback rows. |
| 3 | Resulting fallback canonical_players / player_nicknames rows (display_name, nickname, observed_from, observed_to, evidence JSON) are identical to the per-replay path; same name at two timestamps → exactly one fallback canonical player. | ✓ VERIFIED | Same test run. `fallbackIdentitySnapshot()` (L1056) selects display_name/nickname/observed_from/observed_to/evidence (excludes non-deterministic id/created_at) ordered deterministically. L866 `expect(setBased.fallbackRows).toEqual(perReplay.fallbackRows)` passes. L868-870 asserts `fallbackRows.filter(r => r.display_name === "Ghost")).toHaveLength(1)` — "Ghost" appears in both replays at 2026-02-01 & 2026-02-02 and collapses to one CP. Non-vacuous guards (L872-873) pass. |
| 4 | ensureNameFallbackIdentities stays drop-in: *ForParserResult single-replay audit path, *ForRotation path, legacy-public-export, and ops:stats:recalculate report shape unchanged. | ✓ VERIFIED | Call site `await ensureNameFallbackIdentities(client, parserResults)` at L510 unchanged; signature/name/file unchanged. `git diff 6ae1b1b^..HEAD --name-only` = only 3 files (repository.ts, postgres.test.ts, utilities.ts) — `loadPlayerIdentities`, `uniqueNameOccurrences`, `*ForParserResult`, ops/legacy paths NOT in diff. Full `postgres.test.ts` (14/14 passed, incl. all `*ForParserResult` audit-path tests) confirms drop-in for the single-replay path. |
| 5 | pnpm verify is green and the OpenAPI contract-diff is untouched. | ⚠️ HUMAN (contract part VERIFIED) | OpenAPI: `git diff 2930f10..HEAD -- openapi/` → **empty** (zero contract diff) ✓. Verifier ran independently: typecheck exit 0, lint (3 files + repo) exit 0, postgres.test.ts 14/14, mock-backed unit suite (index/bounty/commander) 34/34. Full `pnpm verify` cannot exit 0 here ONLY because RabbitMQ (5673) is down → pre-existing `adapters.test.ts` ECONNREFUSED. That file was not modified by this task and does not touch the statistics repository. **Needs user `pnpm verify` on a RabbitMQ-up host.** |

**Score:** 4/5 truths fully VERIFIED in-environment; Truth 5's code-level parts all VERIFIED, only the RabbitMQ-gated full-pipeline 0-exit deferred to the user.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/modules/statistics/repository/repository.ts` | Set-based `ensureNameFallbackIdentities` (batch resolve against pre-insert snapshot + ordered in-memory replay with createdLowerNames guard + two multi-row inserts) | ✓ VERIFIED | L549-635. Contains `ensureNameFallbackIdentities`. Predicate (L566-574) byte-matches original (`lower(cp.display_name) = lower(occ.name)` OR active-nickname-window). `createdLowerNames` guard (L596-599) replicates display-name match against just-created fallbacks. Error string `"canonical player fallback insert did not return id"` preserved (L618). Evidence JSON `{ source: "parser_artifact_name_fallback" }` preserved (L631). Wired (L510), substantive (87 lines), data flows (real SQL). |
| `src/modules/statistics/repository/tests/postgres.test.ts` | Extended parity test stressing fallback identity creation across ≥2 replays incl. same name at two timestamps, asserting aggregate AND fallback-row equality | ✓ VERIFIED | New `it(...)` L764-875 contains `parser_artifact_name_fallback`. Two name-only players (Ghost ×2 timestamps, Wraith ×1) + one steam-id player; kill/teamkill events wired; per-replay snapshot → reset (delete fallback nicknames + name-only CPs, null rotations) → set-based snapshot → equality asserts. Ran: passes against real PG. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| repository.ts `loadPlayerIdentities` | repository.ts `ensureNameFallbackIdentities` | awaits before batch identity SELECT, signature unchanged | ✓ WIRED | `ensureNameFallbackIdentities(client, parserResults)` at L510 — exact pattern match. |
| repository.ts `ensureNameFallbackIdentities` | repository.ts `uniqueNameOccurrences` | occurrence list reused verbatim for ordered replay (order/dedupe/empty-skip preserved) | ✓ WIRED | `uniqueNameOccurrences(parserResults)` at L553 — exact pattern match. `uniqueNameOccurrences` unchanged (not in task diff). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Fallback parity (aggregates + fallback rows byte-identical, same-name→1 CP) | `vitest run postgres.test.ts -t "fallback"` | 5 passed, 0 failed (real PG 15432) | ✓ PASS |
| Full repository integration incl. *ForParserResult audit paths | `vitest run postgres.test.ts` | 14 passed | ✓ PASS |
| Unit suite backing the rewritten ScriptedClient mock (incl. count-mismatch guard) | `vitest run index/bounty/commander.test.ts` | 34 passed | ✓ PASS |
| Typecheck | `pnpm run typecheck` | exit 0 | ✓ PASS |
| Lint (3 modified files + repo) | `pnpm run lint ...` | exit 0 | ✓ PASS |
| OpenAPI contract diff | `git diff 2930f10..HEAD -- openapi/` | empty | ✓ PASS |
| At-most-3-statements invariant | `awk` count of `client.query` in L549-635 | 3 | ✓ PASS |
| Full `pnpm verify` 0-exit | `pnpm verify` | blocked: RabbitMQ 5673 down (pre-existing adapters.test.ts) | ? SKIP → human |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PERF-FW2-IDENTITY | PLAN frontmatter | Set-based inner canonical identity resolution in per-rotation recalc (O(1) round-trips), eliminating the ~9ms-per-occurrence bottleneck | ✓ SATISFIED | Truth 1 (3 statements, no per-occurrence loop) + Truths 2/3 (byte-identical proof). Task-scoped quick-task requirement; not registered in `.planning/REQUIREMENTS.md` (expected for quick tasks — no orphan). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found (no TBD/FIXME/XXX/HACK/PLACEHOLDER/stub markers in any of the 3 modified files) | — | — |

### Human Verification Required

#### 1. Full `pnpm verify` on a RabbitMQ-up host

**Test:** On a machine with RabbitMQ running (`docker compose up`), run `pnpm verify`.
**Expected:** Pipeline exits 0 — format, lint, typecheck, unit, integration (incl. `postgres.test.ts`), `openapi:check`, `ops:backup:check`, `ops:boundary:check`, and `test:coverage` all green. No code change should be required.
**Why human:** The verification environment has RabbitMQ (127.0.0.1:5673) down, so the pre-existing dependency-connectivity smoke test `src/test/integration/adapters.test.ts` fails on `ECONNREFUSED` and prevents a 0-exit. That test was **not modified** by this task and does **not** touch the statistics repository — it is unrelated to this change. Every gate the verifier could run independently (typecheck, lint, the real-Postgres parity proof, the mock-backed unit suite, OpenAPI contract diff) already passes.

### Gaps Summary

**No gaps.** The goal is achieved in the codebase, proven by direct execution (not by trusting SUMMARY.md):

- The per-occurrence SELECT-plus-conditional-2-INSERT loop is **gone** (confirmed against `git show 6ae1b1b^`); replaced by exactly 3 DB statements (one `unnest ... with ordinality` resolve under the byte-identical original predicate + two `insert ... select * from unnest(...)` multi-row inserts).
- Byte-identical aggregates AND fallback canonical_players/player_nicknames rows are proven by the verifier-run real-Postgres parity test (5/5 fallback tests pass), including the same-name-two-timestamps → single-fallback case.
- Helper is a true drop-in: call site and signature unchanged, only 3 files touched, full `*ForParserResult` audit-path suite (14/14) passes.
- OpenAPI contract diff is empty.

The only open item is the full `pnpm verify` 0-exit, blocked solely by RabbitMQ being down in this environment (a pre-existing infra condition, not a defect in this change). Per the task's explicit instruction, this is surfaced as `human_needed` rather than a gap because the code itself is correct and every runnable code-level gate passes.

---

_Verified: 2026-06-14T11:56:00Z_
_Verifier: Claude (gsd-verifier)_
