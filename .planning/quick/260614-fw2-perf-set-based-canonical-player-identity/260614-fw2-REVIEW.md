---
phase: 260614-fw2-perf-set-based-canonical-player-identity
reviewed: 2026-06-14T04:53:06Z
depth: quick
files_reviewed: 3
files_reviewed_list:
  - src/modules/statistics/repository/repository.ts
  - src/modules/statistics/repository/tests/postgres.test.ts
  - src/modules/statistics/repository/tests/utilities.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Review — fix/perf-set-based-identity (task 260614-fw2)

**Scope:** `git diff 4ce6f1c..HEAD` — the set-based rewrite of `ensureNameFallbackIdentities()` plus its parity test and the `ScriptedClient` mock updates. Reviewed with `solidstats-server-ts-code-review` (server-ts-conventions + shared-backend-ts-standards), output per shared-review-standards.

**Gates:** typecheck / lint / vitest — not run (read-only review).

## API contract
✅ No public route, zod schema, or OpenAPI shape touched. Repository-internal change only; web client unaffected. Phase 1 gate N/A.

## Behavior-preservation verdict
The rewrite is **behaviorally equivalent to the old per-occurrence loop** on every axis I could verify statically:

- **Resolve predicate** (repository.ts:568-573) is byte-identical to the old per-occurrence `SELECT` predicate — `lower(cp.display_name) = lower(name)` OR (`lower(pn.nickname) = lower(name)` with the `observed_from is null or <= ts` / `observed_to is null or >= ts` null-bound window). The old `order by cp.created_at, cp.id limit 1` only ever fed a boolean existence check (`existing.rows[0]?.id !== undefined`), so collapsing it to `exists(...)` drops nothing. ✅
- **Ordered replay + `createdLowerNames` guard** (repository.ts:589-601) iterates `occurrences` in array order — the same order the old loop used (`uniqueNameOccurrences` order, NOT timestamp order) — and the guard keys on `name.toLowerCase()`. In the old loop a CP created at an earlier occurrence matched every later same-lower-name occurrence via the timestamp-independent `display_name` branch; the guard replicates exactly that, keyed on `lower(name)`. ✅
- **Skip already-matched** (repository.ts:592) skips pre-snapshot matches; only truly-missing names reach `toCreate`. No duplicate CP, none missed. ✅
- **Evidence / observed_from / observed_to** (repository.ts:629-632): evidence stays `{ source: "parser_artifact_name_fallback" }`, `observed_from` = occurrence timestamp, `observed_to` omitted → null. Matches old. ✅
- **Parameterization**: names/timestamps/ids/evidence all passed as typed array params (`$1::text[]`, `$2::timestamptz[]`, `$1::uuid[]`, `$4::jsonb[]`) — no interpolation, no injection surface. Empty-occurrence early return (repository.ts:554) and empty-`toCreate` early return (repository.ts:603) both prevent a malformed empty `unnest`/insert. ✅
- **Type safety**: no `any`/`as` introduced in production code; missing-id guard preserved as a count check (repository.ts:617). ✅

The one place the rewrite introduces a *new* assumption the old code never relied on is the RETURNING-vs-input ordering of the multi-row insert — see finding 1.

## Blockers 🔴
_none_

## High 🟠
1. `src/modules/statistics/repository/repository.ts:607-634` [correctness] — The CP↔nickname pairing relies on `INSERT ... SELECT FROM unnest(...) RETURNING id` returning rows in the SELECT's input order, then zips `created.rows[i]` against `toCreate[i]` for the `player_nicknames` insert. **PostgreSQL does not document any guarantee that `RETURNING` preserves the input/scan order of an `INSERT ... SELECT`** — order is only guaranteed with an explicit `ORDER BY`. In practice `unnest` + a single-table insert almost always returns in order, which is why the parity test passes, but a future plan change (parallel insert, trigger, reordered scan) could silently zip a nickname onto the wrong canonical player. Because CP `display_name` and the nickname `nickname` both derive from `occurrence.name`, a reorder produces a CP whose `display_name` is "Wraith" carrying a "Ghost" nickname — a real data-integrity defect, not just a cosmetic one. The old per-occurrence path was immune (each insert returned its own id). **Fix:** make the pairing order-independent. Carry `with ordinality` through the CP insert and join nicknames back by index, e.g.:
   ```sql
   with ins as (
     insert into canonical_players (display_name)
     select name from unnest($1::text[]) with ordinality as t(name, idx)
     order by idx
     returning id  -- still not ordered; better:
   )
   ```
   The robust form is a single CTE that inserts CPs, returns `id, display_name` (or a carried `idx`), and inserts nicknames in the same statement joining on the carried ordinality — so the id↔name link is in SQL, not positional JS zipping. At minimum add `order by idx` to the SELECT feeding the CP insert AND document/assert the assumption; ideally collapse both inserts into one CTE keyed on `with ordinality`.

## Medium 🟡
2. `src/modules/statistics/repository/repository.ts:617-618` [correctness/observability] — The count-mismatch guard throws the message `"canonical player fallback insert did not return id"`, but `created.rows.length !== toCreate.length` can also fire when the insert returns *more* rows than expected, and the message no longer matches the new failure mode (it's a count mismatch, not a single missing id). The thrown `Error` is also a bare `Error`, not a typed `AppError` per `[std: SKILL §B / error system]`. **Fix:** use a typed domain error and a message describing the actual invariant, e.g. `expected ${toCreate.length} canonical-player ids, got ${created.rows.length}`.

## Low 🔵
3. `src/modules/statistics/repository/repository.ts:589-590` [style] — Mixed `const` declaration list combining the `createdLowerNames` Set and the `toCreate` array in one statement reduces readability for two unrelated accumulators; splitting into two `const` lines reads cleaner. Cosmetic, no behavior impact.
4. `src/modules/statistics/repository/tests/utilities.ts:170,189` [naming] — `this.parameters.at(Number("-1"))` uses `Number("-1")` where the literal `-1` is clearer and avoids an unnecessary string parse. Pre-existing pattern carried into the new `matchedOccurrenceRows`/`insertedPlayerRows`; harmless but worth normalizing while the lines are being touched.

## Non-Findings Checked
- **Dropped `order by ... limit 1`** — verified the old ordering was never consumed (boolean existence only), so `exists(...)` is equivalent, not a regression. Don't "restore" the ORDER BY.
- **Timestamp vs array ordering of the `createdLowerNames` guard** — verified both old and new use `uniqueNameOccurrences` array order (not timestamp order) to choose which occurrence becomes the inserted CP, so the chosen `observed_from` is identical across both paths.
- **`observed_to` omission** — verified the column is left to its default (null) in both old and new inserts; no drift.
- **Empty-array `unnest`** — both early returns (occurrences.length and toCreate.length) prevent any empty-array insert from executing.

## Validation Gaps
- The new parity test (postgres.test.ts) is a testcontainers integration test; not executed in this read-only review. It asserts `setBased` equals `perReplay` and that "Ghost" collapses to one CP — good coverage — but it cannot catch finding 1 because the test environment's planner happens to return RETURNING rows in order. A test that interleaves names so a reorder would mis-pair (and asserts each nickname's `nickname == display_name`) would harden against finding 1.

## Verdict
**REQUEST CHANGES** — mandatory: finding 1 (make the CP↔nickname pairing order-independent rather than relying on undocumented RETURNING ordering) and finding 2 (typed error + accurate message). Findings 3-4 are optional nits.

---
_Reviewed: 2026-06-14T04:53:06Z_
_Reviewer: Claude (solidstats-server-ts-code-review)_
_Depth: quick_
