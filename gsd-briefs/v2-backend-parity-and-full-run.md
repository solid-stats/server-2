# server-2 v2 Milestone Brief: Backend Parity and Full-Run Readiness

**Created:** 2026-05-12
**Intended command:** `$gsd-new-milestone --auto @gsd-briefs/v2-backend-parity-and-full-run.md`
**Application:** `server-2`
**Primary role:** first implementation milestone in the cross-app sequence

## Cross-App Briefs

Read these sibling briefs before drafting the milestone:

- `/home/afgan0r/Projects/SolidGames/replays-fetcher/gsd-briefs/v2-backend-parity-and-full-run.md`
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/gsd-briefs/v2-backend-parity-and-full-run.md`
- `/home/afgan0r/Projects/SolidGames/infrastructure/gsd-briefs/v2-backend-parity-and-full-run.md`
- `/home/afgan0r/Projects/SolidGames/web/gsd-briefs/v2-backend-parity-and-full-run.md`

## Global Sequence

1. `server-2`: define and implement the parity foundation.
2. `replays-fetcher`: make full-corpus ingest resumable and observable enough to feed the parity gate.
3. `infrastructure`: run the controlled full corpus, snapshot legacy stats over SSH, and preserve diff evidence.
4. `web`: start product UI only after the backend data contract is stable enough to trust.

`replay-parser-2` is a contract-support dependency, not the first milestone. Change it only when `server-2` parity work proves that the existing parser artifact contract is insufficient.

## Goal

Make `server-2` able to prove that its public statistics match the legacy trusted `sg_stats` output closely enough to unblock `web` planning and later implementation.

The first milestone is not "build web". It is "make the backend explain and export trustworthy data".

## Source Evidence

- `.planning/research/v2-full-run-findings.md`
- `.planning/debug/no-steamid-name-stats.md`
- `docs/api-compatibility.md`
- `openapi/server-2.openapi.json`
- `/home/afgan0r/Projects/SolidGames/infrastructure/docs/diff-readiness.md`
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/quick/260502-k2u-old-new-year-edge-parity/SUMMARY.md`
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/quick/260502-nx9-old-new-year-edge-parity-second-sample/SUMMARY.md`

## Required Decisions Already Made

- Start with `server-2` parity tools and reports before the final full-corpus gate.
- Final review must use the full corpus, but early implementation can validate on the existing partial staging corpus.
- Legacy trusted public stats come from `sg_stats` on the server through an SSH/SCP snapshot.
- The comparison scope is legacy public stats, including legacy detail surfaces, not only the current narrow `/stats/*` API.
- Strict parity is expected. The only known acceptable public-data difference class is `deaths.byTeamkills` for documented duplicate-slot/respawn teamkill-death edge cases.
- Parser-level differences besides teamkill-death markers, such as retained `Throw`/`Binoculars` weapon rows or the old `teamkillers` merge edge, should be normalized in the legacy public export rather than treated as broad allowlisted failures.
- Death counters in `server-2` should use parser compact counters such as `players[].d`, `players[].td`, `players[].su`, `players[].nkd`, and `players[].ud` as replay-level counter evidence. `players[].kills[]` should not be the only death source.

## Problem To Solve

The staging full run produced thousands of parser results, but `server-2` could not prove aggregate freshness, rotation coverage, identity coverage, or public-stat parity. Current public stats row counts are not enough to know whether data is correct, skipped, stale, or missing required identity/rotation inputs.

There is also a contract gap: `server-2` currently maps parser kill rows into normalized events, but parser artifacts already expose compact player counters. A parity milestone must decide and implement the backend-facing interpretation of those counters before comparing to legacy public results.

## Suggested Milestone Phases

### Phase 1: Parser Counter Ingestion and Aggregate Semantics

Goal: `server-2` consumes parser compact player counters as the authoritative replay-level counter input for public stats.

Acceptance criteria:

- Parser artifact mapping preserves `d`, `td`, `tk`, `su`, `nkd`, `ud`, `vk`, `kfv`, and `kills[]` evidence.
- Aggregate calculation uses parser death counters rather than deriving all deaths from attacker kill rows.
- Tests cover enemy death, teamkill death, suicide, null-killer death, unknown death, vehicle kill, and kill relationship rows.
- The implementation keeps bounty inputs strict: teamkills and non-enemy kills do not award bounty points.

### Phase 2: Full-Run Recalculation and Coverage Report

Goal: an operator can prove what was recalculated and what was skipped.

Acceptance criteria:

- Add an idempotent backfill/recalculation command for all current parser results.
- Emit a full-run report with parser result count, recalculated count, skipped count, missing rotation count, missing timestamp count, missing identity count, changed aggregate rows, and failures.
- Expose or document an operator-readable status surface that does not require ad hoc SQL.
- The report distinguishes staged, promoted, parsed, parser-result-current, recalculated, skipped, and stale states.

### Phase 3: Rotation and No-SteamID Identity Readiness

Goal: public stats do not silently drop parsed replay data because rotations or no-SteamID identity evidence is missing.

Acceptance criteria:

- Every replay timestamp maps to exactly one rotation or a documented excluded range.
- Missing-rotation replays are listed in a report.
- No-SteamID players resolve through nickname history or provisional observed-name identity according to auditable rules.
- Unresolved observed nicknames are reported after recalculation.

### Phase 4: Legacy Public Export Contract

Goal: `server-2` can export comparable legacy public stats for the old-vs-new diff gate.

Acceptance criteria:

- Export player global stats, squad stats, rotation-scoped stats, and legacy detail surfaces needed by `web` planning: `other_players`, `weapons`, and `weeks`.
- The export can be run locally or in staging with deterministic output and metadata.
- Exported fields include enough legacy-compatible data for strict comparison: kills, kills from vehicle, vehicle kills, teamkills, deaths, KD, score, total played games, relationships, weapons, weekly buckets, and visible player/squad identity.
- Parser-level non-public differences are normalized in this export when necessary to preserve public legacy parity.

### Phase 5: Diff Harness Contract

Goal: `server-2` owns the new-stat export side and can participate in a reproducible old-vs-new comparison.

Acceptance criteria:

- Define the new export shape consumed by the diff tool.
- Define strict failures and the narrow known-difference policy.
- The diff report includes inputs, snapshot metadata, summary counts, strict failures, known teamkill-death differences, and `review_required`.
- The diff harness can compare a small sample, the existing partial corpus, and the final full-corpus output.

## Dependencies On Other Apps

- `replays-fetcher` must later provide a resumable full-corpus run. This milestone should not wait for that to start, but the final full-corpus gate depends on it.
- `infrastructure` must later provide controlled full-run orchestration, legacy `sg_stats` SSH snapshot capture, and evidence storage.
- `replay-parser-2` must preserve the compact counter contract. If `server-2` finds missing parser evidence, open a parser contract-support milestone.
- `web` must wait for the stable OpenAPI/public export contract before building public stats screens.

## Non-Goals

- Do not build `web` in this milestone.
- Do not change production traffic routing.
- Do not turn the legacy export into the only long-term API shape.
- Do not broaden the allowlist beyond documented teamkill-death public differences without a human decision.

## Recommended Next Command

Run `$gsd-new-milestone --auto @gsd-briefs/v2-backend-parity-and-full-run.md` in `server-2` first.
