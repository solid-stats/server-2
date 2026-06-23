---
phase: 260623-uvz-replay-timestamp-epoch-primary-semantics
quick_id: 260623-uvz
slug: replay-timestamp-epoch-primary-semantics
plan: 01
type: execute
wave: 1
depends_on: []
branch: quick/260623-uvz-replay-timestamp-epoch-primary
files_modified:
  - src/modules/ingest/replay-timestamp.ts
  - src/modules/ingest/replay-timestamp.test.ts
  - src/modules/ingest/service.test.ts
  - src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql
  - src/modules/ingest/repository/tests/postgres.test.ts
autonomous: true
requirements:
  - INGEST-EPOCH-TS

goal: >
  Mirror the replays-fetcher epoch-primary `replay_timestamp` semantics in server-2:
  flip the ingest derivation so an in-range Unix-epoch in `source_replay_id` is the
  PRIMARY timestamp source (falling back to the staged value only when no in-range
  epoch exists), converge the epoch bounds to the fetcher's exact window
  [1420070400, 2051222400], and ship a correcting backfill migration (0013) that
  overwrites ALL already-promoted rows holding the old wrong-timezone value — not just
  NULL rows. No schema change; read-path already treats the column as a true UTC instant.

premises:
  - claim: >
      resolveReplayTimestamp is currently STAGED-primary — it returns
      `input.replayTimestamp ?? deriveReplayTimestampFromSourceId(input.sourceReplayId)`,
      so the epoch only fills a NULL staged value and never corrects a present wrong one.
    src: src/modules/ingest/replay-timestamp.ts#L60-L68
    verify: grep -n 'input.replayTimestamp ??' src/modules/ingest/replay-timestamp.ts
  - claim: >
      The current ingest epoch bounds are [1_000_000_000, 2_000_000_000], NOT the
      fetcher's [1_420_070_400, 2_051_222_400] window — they must converge.
    src: src/modules/ingest/replay-timestamp.ts#L24-L25
    verify: grep -nE 'minEpochSeconds = 1_000_000_000|maxEpochSeconds = 2_000_000_000' src/modules/ingest/replay-timestamp.ts
  - claim: >
      The exactly-10-trailing-digits regex anchor is `/(?:^|\D)(?<epoch>\d{10})$/u`;
      both the old and the new window are 10-digit, so the regex stays unchanged and the
      numeric range is the authority.
    src: src/modules/ingest/replay-timestamp.ts#L27
    verify: grep -n 'trailingEpochPattern = ' src/modules/ingest/replay-timestamp.ts
  - claim: >
      The fetcher's authoritative window is 1420070400..2051222400 (2015-01-01..2035-01-01
      inclusive); anything else (non-numeric, `derived:`, out of range) keeps the staged value.
    src: ../replays-fetcher/.planning/quick/260623-qj5-fix-replay-timestamp-source-use-external/SERVER-2-HANDOFF.md#range-guard
    verify: grep -nE '1420070400|2051222400' ../replays-fetcher/.planning/quick/260623-qj5-fix-replay-timestamp-source-use-external/SERVER-2-HANDOFF.md
  - claim: >
      service.ts wraps every promotion through `withResolvedReplayTimestamp(record)` →
      `resolveReplayTimestamp(record)` before `createReplay`, so flipping the helper is
      sufficient — no service/repository change is needed for the precedence flip.
    src: src/modules/ingest/service.ts#L110-L113
    verify: grep -n 'withResolvedReplayTimestamp(record)' src/modules/ingest/service.ts
  - claim: >
      Migration 0011 backfilled ONLY NULL rows (`where replay_timestamp is null …`) with
      bounds [1000000000, 2000000000]; it is the file-style precedent for 0013.
    src: src/infra/db/migrations/0011_backfill_replay_timestamp_from_source_id.sql#L43-L51
    verify: grep -n 'where replay_timestamp is null' src/infra/db/migrations/0011_backfill_replay_timestamp_from_source_id.sql
  - claim: >
      The migration runner is forward-only, one transaction per `.sql`, checksum-pinned
      (a changed file after apply throws), sorted by filename; the current max migration is
      0012, so the new file is 0013.
    src: src/infra/db/migrate.ts#L36-L67
    verify: ls -1 src/infra/db/migrations/ | tail -1
  - claim: >
      The integration harness runs the REAL migrations via `runMigrations(config.databaseUrl)`
      in `beforeAll` and truncates `replays` (among others) `cascade` per test — so 0013 runs
      automatically and the existing "0011" test reads the real migration file (the style to mirror).
    src: src/modules/ingest/repository/tests/postgres.test.ts#L36-L44
    verify: grep -nE 'runMigrations\(|0011_backfill_replay_timestamp_from_source_id\.sql' src/modules/ingest/repository/tests/postgres.test.ts
  - claim: >
      The read-path (statistics + public-stats) uses `timestamptz` + `.toISOString()` with NO
      timezone-offset arithmetic anywhere — there is nothing to remove on read.
    src: src/modules/statistics + src/modules/public-stats
    verify: grep -rniE "at time zone|getTimezoneOffset|setHours|\\+01:00" src/modules/statistics src/modules/public-stats | grep -vE 'test|\.md'

carried_forward:
  - claim: >
      The exactly-10-trailing-digits anchor (not a greedy `\d{9,}$`) is what keeps the TS
      ingest path and the SQL backfill accepting/rejecting the SAME inputs — F12's review
      flagged the zero-padded greedy-strip trap (`00000000001500000000`). Keep the exact-10
      anchor in both 0013 and the helper; the range is the authority, the anchor the pre-filter.
    src: src/modules/ingest/replay-timestamp.test.ts#L38-L40

must_haves:
  truths:
    - "An in-range epoch in source_replay_id OVERRIDES a different present staged replayTimestamp at promotion (epoch-primary, not staged-primary)."
    - "When source_replay_id has no in-range epoch (derived:/non-numeric/out-of-range), the staged replayTimestamp is kept unchanged (fallback)."
    - "The accepted epoch window is [1420070400, 2051222400] inclusive in BOTH the ingest helper and migration 0013 — identical accept/reject sets."
    - "Migration 0013 overwrites replay_timestamp for ALL rows (not just NULL) whose source_replay_id is an in-range numeric epoch; derived:/out-of-range rows are untouched."
    - "Migration 0013 is idempotent — re-running yields identical to_timestamp(epoch) values."
    - "pnpm test (unit) and pnpm test:integration (real migration applied) are green with the new precedence and bounds."
  artifacts:
    - path: "src/modules/ingest/replay-timestamp.ts"
      provides: "Epoch-primary resolveReplayTimestamp + converged [1420070400,2051222400] bounds + rewritten invariant comment citing migration 0013"
      contains: "1_420_070_400"
    - path: "src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql"
      provides: "Correcting (not NULL-gated) backfill from source_replay_id epoch; bounds 1420070400..2051222400; 0011-style header + DOWN comment"
      contains: "to_timestamp"
    - path: "src/modules/ingest/replay-timestamp.test.ts"
      provides: "Epoch-primary precedence + new boundary (1420070400/2051222400 accepted, just-outside rejected) unit coverage"
      contains: "1420070400"
    - path: "src/modules/ingest/service.test.ts"
      provides: "Service-level proof that an in-range epoch id overrides a stale staged timestamp at promotion"
    - path: "src/modules/ingest/repository/tests/postgres.test.ts"
      provides: "Integration proof that 0013 overwrites a NON-NULL wrong timestamp for an in-range epoch row and leaves derived:/out-of-range rows unchanged"
      contains: "0013_correct_replay_timestamp_epoch_primary.sql"
  key_links:
    - from: "src/modules/ingest/service.ts"
      to: "src/modules/ingest/replay-timestamp.ts"
      via: "withResolvedReplayTimestamp(record) -> resolveReplayTimestamp(record) before createReplay — the flip propagates with no service change"
      pattern: "resolveReplayTimestamp"
    - from: "src/modules/ingest/repository/tests/postgres.test.ts"
      to: "src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql"
      via: "reads and executes the REAL 0013 file (mirroring the existing 0011 integration test) so SQL drift is caught"
      pattern: "0013_correct_replay_timestamp_epoch_primary\\.sql"
    - from: "src/modules/ingest/replay-timestamp.ts"
      to: "src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql"
      via: "shared invariant — identical exact-10-digit anchor + [1420070400,2051222400] bound so ingest and backfill agree"
      pattern: "1_420_070_400"
---

<objective>
Mirror the replays-fetcher `replay_timestamp` semantics change in server-2. The fetcher made the
Unix-epoch encoded in a replay's source id the PRIMARY timestamp source (a true UTC instant),
replacing the old filename/listing value that was server-local (≈UTC+1) wrongly stamped as UTC
[src: SERVER-2-HANDOFF.md#what-changed-and-why]. server-2 must (a) flip its ingest derivation to
the same epoch-primary precedence and converge the epoch bounds, and (b) correctingly backfill
already-promoted rows that still hold the old wrong value. No schema change.

Purpose: until server-2 mirrors the flip, `replays.replay_timestamp` is a mix of two conventions —
old rows ≈UTC+1-as-UTC, new rows true UTC — a ~1h (or larger, filename-sourced) skew on historical
rows. The ingest flip fixes newly-promoted rows; the 0013 backfill fixes the already-promoted ones.

Output:
- `replay-timestamp.ts` — epoch-primary `resolveReplayTimestamp`, bounds converged to
  [1_420_070_400, 2_051_222_400], invariant comment rewritten to cite migration 0013.
- `0013_correct_replay_timestamp_epoch_primary.sql` — a correcting (NOT NULL-gated) backfill.
- Rewritten unit + service + integration tests proving the new precedence, bounds, and overwrite.

SCOPE NOTE (for the plan-checker): the existing `replay-timestamp.test.ts` and `service.test.ts`
ASSERT THE OLD precedence/bounds (`replay-timestamp.test.ts#L54` "keeps the primary timestamp when
present"; `service.test.ts#L86` "keeps a present staging timestamp"; boundary cases at
`replay-timestamp.test.ts#L14-L15,#L42-L43`). This is a behavior FLIP, so those tests are
REWRITTEN, not merely extended — that is why each behavior change ships with its tests in the same
commit (keeping `verify` green per commit). The service is a pre-existing CLASS
(`IngestPromotionService`), not the conventions' factory shape — preserving it is in scope; a
factory refactor is OUT of scope for this quick task.

OUT OF SCOPE (confirmed N/A, not omissions):
- Read-path / timezone-offset removal — a grep of `src/modules/statistics` + `src/modules/public-stats`
  for offset arithmetic is EMPTY [src: premise#read-path]; nothing exists to remove.
- web double-offset — separate repo (`web`), separate hand-off item.
- Staging-table backfill — unnecessary: the ingest precedence flip makes pending staging rows
  promote with the corrected epoch-derived value [src: SERVER-2-HANDOFF.md#how-to-recompute].
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The cross-app hand-off that authorizes this change (read for the evidence table + range guard):
@../replays-fetcher/.planning/quick/260623-qj5-fix-replay-timestamp-source-use-external/SERVER-2-HANDOFF.md

# The files this plan changes (verify the anchors, do not re-explore broadly):
@src/modules/ingest/replay-timestamp.ts
@src/modules/ingest/service.ts
@src/modules/ingest/replay-timestamp.test.ts
@src/modules/ingest/service.test.ts
@src/modules/ingest/repository/tests/postgres.test.ts
@src/infra/db/migrate.ts

# The file-style precedent the 0013 migration mirrors (header block, idempotency proof, DOWN comment):
@src/infra/db/migrations/0011_backfill_replay_timestamp_from_source_id.sql

# Skills the executor MUST author THROUGH (read first, cite the rules relied on):
@.claude/skills/solidstats-server-ts-conventions/SKILL.md
@.claude/skills/solidstats-server-ts-conventions/references/schemas-and-data.md
@.claude/skills/solidstats-server-ts-tests/SKILL.md
@.claude/skills/solidstats-shared-testing-standards/SKILL.md
@.claude/skills/solidstats-shared-backend-ts-standards/references/correctness-and-quality.md
@.claude/skills/solidstats-shared-project-standards/SKILL.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Flip ingest derivation to epoch-primary + converge bounds + rewrite its unit/service tests</name>
  <files>src/modules/ingest/replay-timestamp.ts, src/modules/ingest/replay-timestamp.test.ts, src/modules/ingest/service.test.ts</files>
  <action>
Flip `resolveReplayTimestamp` in `src/modules/ingest/replay-timestamp.ts` to EPOCH-PRIMARY: return
`deriveReplayTimestampFromSourceId(input.sourceReplayId) ?? input.replayTimestamp`
[src: replay-timestamp.ts#L60-L68 — currently staged-primary]. An in-range epoch in the source id
now WINS over a present staged value; the staged value is the fallback used only when the id has no
in-range epoch (`derived:`, non-numeric, or out-of-range). Per the hand-off, the epoch is the only
unambiguous UTC instant the system carries, so it is strictly better than the filename/listing
value [src: SERVER-2-HANDOFF.md#what-changed-and-why].

Converge the epoch bounds from `[1_000_000_000, 2_000_000_000]` to the fetcher's exact window
`minEpochSeconds = 1_420_070_400` (2015-01-01) .. `maxEpochSeconds = 2_051_222_400` (2035-01-01),
inclusive [src: replay-timestamp.ts#L24-L25; SERVER-2-HANDOFF.md#range-guard]. Keep
`trailingEpochPattern` (`/(?:^|\D)(?<epoch>\d{10})$/u`) UNCHANGED — both windows are 10-digit, so
the exact-10-trailing-digits anchor stays the necessary pre-filter and the numeric range is the
authority [src: carried_forward — F12 greedy-strip trap]. Re-verify the existing reasoning comment
that the range bound keeps `epochSeconds * 1000` inside JS Date's valid range still holds for the
new max (`2_051_222_400 * 1000` ≈ 2.05e12 ms, far inside ±8.64e15) — no NaN guard needed.

Rewrite the header/invariant comment block (`replay-timestamp.ts#L1-L23`): it now describes
EPOCH-PRIMARY precedence (epoch wins, staged value is the fallback) and states the logic mirrors
migration **0013** (not 0011) with bounds 1420070400..2051222400, so ingest and the 0013 backfill
accept/reject the SAME inputs. Keep the exact-10-anchor-vs-greedy explanation (still load-bearing).
Do NOT leave the comment claiming "FALLBACK only, never replaces a present value" — that is the old
semantics and is now false. Comments are English, explain WHY, no commented-out code
[std: correctness → Comments & docs].

Rewrite `src/modules/ingest/replay-timestamp.test.ts` to assert the NEW behavior:
- `deriveReplayTimestampFromSourceId`: KEEP the accepted in-range cases that still hold
  (`sg-zone-1624129684` → `2021-06-19T19:08:04.000Z`). REPLACE the old boundary cases — assert the
  NEW boundaries are accepted INCLUSIVELY: `1420070400` → `2015-01-01T00:00:00.000Z` and
  `2051222400` → `2035-01-01T00:00:00.000Z` (compute the exact ISO with
  `new Date(n*1000).toISOString()` and pin the literal). Add just-outside REJECTED cases:
  `1420070399` and `2051222401` → null. The old `1000000000`/`2000000000` accepted cases become
  REJECTED (both now below the new lower / `2000000000` < new lower `1420070400`? — note
  `2_000_000_000 > 1_420_070_400` and `< 2_051_222_400`, so `2000000000` is now IN range and
  ACCEPTED; `1000000000` is below the new lower bound and REJECTED). Re-derive each old boundary
  case against the new window and move it to the correct accept/reject table — do not blindly copy.
  KEEP the exact-10-anchor reject cases (9-digit, 11+-digit, zero-padded-20-digit greedy trap,
  digits-not-at-end) — the anchor is unchanged [src: carried_forward].
- `resolveReplayTimestamp`: REWRITE the precedence tests. The old "keeps the primary timestamp when
  present" (`#L54`) becomes its OPPOSITE: an in-range epoch id OVERRIDES a DIFFERENT present staged
  value — `resolveReplayTimestamp({ replayTimestamp: '2026-05-09T00:00:00.000Z', sourceReplayId:
  'sg-zone-1624129684' })` now returns `'2021-06-19T19:08:04.000Z'` (the epoch), NOT the staged
  value. Keep: falls back to the staged value when the id has no in-range epoch
  (`derived:`/non-numeric/out-of-range); returns null only when neither an in-range epoch nor a
  staged value exists. Use `it.each` tables and AAA per [tests]/[testing-standards §A,§C].

Rewrite the two precedence tests in `src/modules/ingest/service.test.ts`:
- `#L86` "keeps a present staging timestamp instead of deriving from source_replay_id" — FLIP it: a
  pending record with an in-range epoch id (`sg-zone-1624129684`) AND a stale present staged
  timestamp must promote with the EPOCH-derived value (`createReplayRecord?.replayTimestamp ===
  '2021-06-19T19:08:04.000Z'`), proving the override at the service boundary.
- `#L65` "derives … when the staging timestamp is null" — keep (still true under epoch-primary), but
  confirm the assertion value is unchanged. Do NOT touch the conflict/duplicate/failed tests.
This needs NO change to `service.ts` itself — `withResolvedReplayTimestamp` already routes every
promotion through the helper [src: service.ts#L110-L113]; the behavior change propagates for free.

Run `pnpm run typecheck && pnpm run lint && pnpm test` — the unit suite must be green with the new
precedence/bounds before committing. `pnpm test` runs these two files (they match neither the
integration nor the postgres nor the golden exclude globs) [src: package.json test script].
  </action>
  <verify>
    <automated>grep -nE 'deriveReplayTimestampFromSourceId\(input\.sourceReplayId\) \?\?|deriveReplayTimestampFromSourceId\(\s*input\.sourceReplayId,?\s*\) \?\?' src/modules/ingest/replay-timestamp.ts && grep -nE 'minEpochSeconds = 1_420_070_400|maxEpochSeconds = 2_051_222_400' src/modules/ingest/replay-timestamp.ts && grep -n '0013' src/modules/ingest/replay-timestamp.ts && grep -n '1420070400' src/modules/ingest/replay-timestamp.test.ts && pnpm run typecheck && pnpm run lint && pnpm test 2>&1 | tail -8</automated>
  </verify>
  <done>
`resolveReplayTimestamp` is epoch-primary (`derive(...) ?? replayTimestamp`); bounds are
`1_420_070_400`..`2_051_222_400`; the regex anchor is unchanged; the header comment cites migration
0013 + the new bounds and no longer claims "fallback only". `replay-timestamp.test.ts` asserts the
new inclusive boundaries (1420070400/2051222400 accepted; 1420070399/2051222401 rejected) and
epoch-over-staged override; `service.test.ts` proves an in-range epoch id overrides a stale staged
timestamp at promotion. `pnpm typecheck`, `pnpm lint`, and `pnpm test` are green. `service.ts` is
unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Correcting backfill migration 0013 + integration proof it overwrites non-NULL wrong rows</name>
  <files>src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql, src/modules/ingest/repository/tests/postgres.test.ts</files>
  <action>
Create `src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql` — the next
forward-only migration (current max is 0012 [src: premise#runner]). Mirror 0011's file style
[src: 0011_backfill_replay_timestamp_from_source_id.sql] but with CORRECTING (not filling) intent:

- The `update replays set replay_timestamp = to_timestamp(<epoch>), updated_at = now()` runs for
  ALL rows whose `source_replay_id` is an in-range numeric epoch — it is NOT gated on
  `replay_timestamp is null`. That is the whole point: it OVERWRITES old wrong-timezone non-null
  values [src: SERVER-2-HANDOFF.md#how-to-recompute]. Use the SAME extraction as 0011 —
  `substring(source_replay_id from '(?:\D|^)(\d{10})$')::bigint` — and the SAME exact-10-trailing
  pattern guard `source_replay_id ~ '(\D|^)\d{10}$'`, with bounds `between 1420070400 and 2051222400`.
  `to_timestamp(epoch)` yields a UTC instant.
- `derived:*`, non-numeric, and out-of-range ids are left untouched (the pattern + range guard
  exclude them). The update is idempotent: re-running yields identical `to_timestamp(epoch)` values
  (the WHERE set and the computed value are pure functions of `source_replay_id`).
- Header comment block (English) explaining: ROOT CAUSE (old staged value was server-local ≈UTC+1
  wrongly stamped as UTC, or filename-sourced = wrong event; the epoch in source_replay_id is the
  true UTC instant), CORRECTING-not-filling intent (touches non-null rows, unlike 0011), the
  bounds, and the idempotency proof. Call out the DIVERGENCE from 0011: bounds tightened from
  [1e9, 2e9] to [1420070400, 2051222400]; rows 0011 backfilled that fall inside the new window are
  re-written to the SAME `to_timestamp(epoch)` (a no-op); rows 0011 may have filled OUTSIDE the new
  window are not in scope (no real data there). Also call out the shared invariant: this mirrors the
  ingest helper `src/modules/ingest/replay-timestamp.ts` exactly (same anchor + bounds), so backfill
  and newly-promoted replays agree.
- DOWN comment (documentary only — the migrate.ts runner is forward-only
  [src: migrate.ts#L36-L67]): note that, like 0011, no marker distinguishes a corrected row from one
  that always had this value, so a precise revert is impossible; an approximate revert is not
  meaningful here because the OLD value was wrong by design (do not offer a re-null revert — there is
  no correct prior value to restore).
- Match the existing SQL formatting (lowercase keywords, two-space indentation) of 0011. Do NOT
  reword/retouch 0011 — its checksum is pinned and a changed applied file throws at migrate
  [src: migrate.ts#L49].

Add an integration test to `src/modules/ingest/repository/tests/postgres.test.ts` mirroring the
existing "backfills NULL … by running the real migration 0011 file" test [src: postgres.test.ts#L192-L241]:
- Seed (via direct `pool.query` insert into `replays`, `/* eslint-disable */` block already present)
  three rows: (a) an in-range epoch id (`sg-zone-1624129684`) with a NON-NULL WRONG timestamp
  (e.g. `'2099-01-01T00:00:00.000Z'`, deliberately not the epoch value) — must be OVERWRITTEN to
  `2021-06-19T19:08:04.000Z`; (b) a `derived:`-prefixed (or non-numeric `sg-zone-replay`) id with a
  non-null timestamp — must be UNCHANGED; (c) an out-of-range epoch id (use a 10-digit run below the
  new lower bound, e.g. `sg-zone-1000000000` = 1e9 < 1420070400) with a non-null timestamp — must be
  UNCHANGED.
- Read the REAL 0013 file via `readFile(fileURLToPath(new URL('../../../../infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql', import.meta.url)))` and `pool.query` it (mirroring
  the 0011 test exactly), so SQL drift is caught. 0013 already ran in `beforeAll`'s `runMigrations`
  and the per-test `truncate replays cascade` cleared any seeded rows it touched, so re-executing the
  idempotent correcting UPDATE against these fresh rows asserts the SHIPPED SQL.
- Assert: row (a) → `2021-06-19T19:08:04.000Z`; rows (b) and (c) → their original non-null values,
  unchanged. Use the existing `requiredRecord`/helper idioms and AAA; one focused `it` with a strong
  oracle [std/testing-standards §A,§G]. Keep the existing 0011 test as-is.

Run `pnpm run typecheck && pnpm run lint && pnpm run test:integration` — the postgres integration
suite applies the real 0013 in `beforeAll` and must be green
[src: postgres.test.ts#L36-L38; package.json test:integration].
  </action>
  <verify>
    <automated>test -f src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql && grep -nE 'between 1420070400 and 2051222400' src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql && ! grep -nE 'where[[:space:]]+replay_timestamp[[:space:]]+is[[:space:]]+null' src/infra/db/migrations/0013_correct_replay_timestamp_epoch_primary.sql && grep -n '0013_correct_replay_timestamp_epoch_primary.sql' src/modules/ingest/repository/tests/postgres.test.ts && pnpm run typecheck && pnpm run lint && pnpm run test:integration 2>&1 | tail -12</automated>
  </verify>
  <done>
`0013_correct_replay_timestamp_epoch_primary.sql` exists, updates ALL in-range-epoch rows (NOT
NULL-gated — the `is null` guard is absent), uses the exact-10 pattern + `between 1420070400 and
2051222400`, is idempotent, and carries a 0011-style header + DOWN comment documenting the
correcting intent and the bounds-tightening divergence. The new integration test reads and executes
the REAL 0013 file and proves: a non-null WRONG in-range-epoch row is overwritten to the epoch
value, while a `derived:`/non-numeric row and an out-of-range-epoch row are left unchanged. 0011 is
untouched (checksum intact). `pnpm typecheck`, `pnpm lint`, and `pnpm test:integration` are green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| replays-fetcher staging → server-2 promotion | Staged `replay_timestamp` + `source_replay_id` cross into canonical `replays`; server-2 owns the derivation/correction (the fetcher must not write business tables). |
| migration file → live `replays` table | 0013 rewrites historical timestamps in place on already-promoted rows. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-uvz-01 | Tampering (data) | 0013 in-place overwrite of replay_timestamp | mitigate | Overwrite is a pure function of `source_replay_id` (`to_timestamp(epoch)`), idempotent, and scoped by the exact-10 pattern + [1420070400,2051222400] range — `derived:`/out-of-range rows are provably untouched; the integration test pins both the overwrite and the no-touch cases. The old value was wrong by design, so no correct prior value is lost. |
| T-uvz-02 | Tampering (drift) | ingest helper vs 0013 bounds divergence | mitigate | Helper and migration share the identical exact-10 anchor + numeric window; both the unit test (boundary accept/reject) and the integration test (real 0013 file) assert the same accept/reject set, catching drift. |
| T-uvz-03 | Denial of service / overflow | epoch → Date / ::bigint cast | accept | The exact-10-trailing-digits anchor rejects 11+-digit runs before the cast (no int8 overflow), and the range bound keeps `epoch*1000` far inside JS Date's valid range — existing reasoning re-verified for the new max. No unbounded external field is introduced. |
| T-uvz-SC | Tampering | npm/pip/cargo installs | accept | This task adds ZERO new dependencies (uses installed pg/vitest/tsx + a new `.sql` file) — no package-legitimacy gate required. |
</threat_model>

<verification>
## Quick-task checks

- `pnpm test` (unit) green: epoch-primary precedence + new inclusive boundaries
  (1420070400/2051222400 accepted, 1420070399/2051222401 rejected) + service-level override proof.
- `pnpm run test:integration` green: real `runMigrations` applies 0013 in `beforeAll`; the new test
  proves a non-null WRONG in-range-epoch row is overwritten to the epoch value while a
  `derived:`/non-numeric row and an out-of-range row stay unchanged; the existing 0011 test still
  passes (0011 file untouched, checksum intact).
- `pnpm run typecheck` + `pnpm run lint` clean across all changed files (no `eslint-disable` added
  beyond the file-level disables already present in the touched test files).
- `0013_*.sql` has NO `replay_timestamp is null` guard (negative-grep), uses
  `between 1420070400 and 2051222400`, and is idempotent by construction.
- Read-path unchanged and confirmed offset-free (premise#read-path grep empty) — nothing removed.
- Full `pnpm verify` should be run by the orchestrator before the PR (it chains format → lint →
  typecheck → test → test:integration → openapi:check → ops checks → test:coverage).
</verification>

<success_criteria>
- `resolveReplayTimestamp` is epoch-primary; ingest epoch bounds converged to
  [1_420_070_400, 2_051_222_400]; invariant comment rewritten to cite migration 0013.
- `0013_correct_replay_timestamp_epoch_primary.sql` correctingly overwrites ALL in-range-epoch rows
  (not NULL-gated), is idempotent, untouches `derived:`/out-of-range rows, and documents the
  correcting intent + bounds-tightening divergence from 0011 + the forward-only DOWN note.
- Unit, service, and integration tests REWRITTEN to assert the new precedence, the new inclusive
  boundaries, and the non-null overwrite; existing 0011 test and `service.ts` left intact.
- `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint` all green.
- Authored THROUGH the server-ts conventions + test skills with cited rules; zero new dependencies;
  read-path/web/staging-backfill explicitly confirmed out of scope.
</success_criteria>

<output>
Create `.planning/quick/260623-uvz-replay-timestamp-epoch-primary-semantics/260623-uvz-SUMMARY.md` when done.
</output>
