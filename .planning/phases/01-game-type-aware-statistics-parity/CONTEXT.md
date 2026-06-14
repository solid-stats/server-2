# Phase 1 (Parity): Game-Type-Aware Statistics — Context

**Gathered:** 2026-06-14
**Status:** Decisions LOCKED — ready for planning
**Scope mode:** Parity-first (recalc → legacy-export / parity-sql only). Public stats HTTP API /
OpenAPI-web contract and replays-fetcher are OUT of scope this phase.

<domain>
## Task Boundary

Legacy `sg_stats` computes statistics **per game type** (`sg`/`mace`/`sm`) by `mission_name` prefix;
the new system aggregates ALL mission types into one bucket. New corpus by type: mace 20735, sg 2056,
sm 253, other 511; legacy `sg`=2098 ≈ new sg=2056 (sg coverage is excellent once type-filtered), but
current aggregates are 88% mace → not comparable to legacy per-type. This phase makes aggregates
game-type-aware with a **canonical persisted game_type**, so the new-side per-type legacy-export
matches legacy and unblocks F8 parity.

Spec source = legacy parser `sg-replay-parser` (see RESEARCH.md for exact rules). Findings: F8 in
`plans/product/PARITY-BASELINE-FINDINGS.md`. Builds on shipped F7 (set-based rotation recalc, master
`2930f10`) and quick-260614-fw2 (set-based identity, master `fa7c54b`/PR #11).
</domain>

<decisions>
## Implementation Decisions (LOCKED — do not revisit)

### D1 — all-time representation: nullable rotation_id + game_type in key
Add `game_type` to the four aggregate tables AND make `rotation_id` **nullable**; `rotation_id IS NULL`
is the **all-time** bucket for that game_type.
- `sg` gets BOTH per-rotation rows (rotation_id set, one per the 20 rotations) AND an all-time row
  (rotation_id NULL).
- `mace` / `sm` get ONLY all-time rows (rotation_id NULL) — no per-rotation.
- Uniqueness: `(rotation_id, player_id, game_type)` for player_stats/bounty_points,
  `(rotation_id, squad_id, game_type)` for squad_stats, and the commander triple + game_type. Because
  Postgres treats NULLs as distinct by default, enforce all-time uniqueness with **`UNIQUE NULLS NOT
  DISTINCT`** (PG 17/18 — confirm server version) OR two partial unique indexes
  (`... where rotation_id is null` / `... where rotation_id is not null`). Planner picks; prefer
  NULLS NOT DISTINCT if the running PG supports it.
- **Rejected:** a sentinel "all-time" rotation row (pollutes `rotations`, breaks the
  `starts_at<=ts<ends_at` assign and every rotation enumeration) and separate `*_all_time` tables
  (doubles table + recalc/export code). The dimension is a column, the all-time bucket is NULL rotation.

### D2 — canonical game_type on replays.game_type (NULL = excluded)
Add a nullable canonical column `replays.game_type text`. NULL ⇒ the replay is **excluded** from every
per-type bucket (no matching prefix, or `mission_name` starts with `sgs`, or mace with <10 players, or
sm before 2023-01-01, or on excludeReplays). Otherwise it holds `'sg' | 'mace' | 'sm'`.
- Populated by a **classification step inside recalc** (set-based in the spirit of F7's
  `assignRotationsForCurrentReplays`): derive from `mission_name` (read from the artifact /
  raw_snapshot) + the include/exclude config (D4) + the per-type filters (sm date, mace player-count).
  The mace `<10 players` rule needs the per-replay distinct-player count, which recalc already
  resolves — apply it in the classification step, not a pure mission_name UPDATE.
- Aggregation groups by `replays.game_type`; excluded (NULL) replays contribute to nothing.
- We deliberately collapse "no prefix" vs "mace<10" vs "sm<2023" all to NULL — parity does not need to
  distinguish *why* a replay is excluded, only that it is.

### D3 — persist is_show on player_stats
`filterPlayersByTotalPlayedGames` (legacy) marks each player `isShow: true/false` per scope (it does
NOT remove them). The legacy export uses this to split main players vs `otherPlayers`. Persist a
boolean `is_show` on `player_stats` (per rotation/all-time × game_type × player), computed at recalc
from the player's `totalPlayedGames` vs the threshold (≥20, or `ceil(15% of scope games)` when scope
games < 125). The scope's game count is known at recalc (per-rotation game count for sg rotations;
per-type total game count for all-time). legacy-export then reproduces the `otherPlayers` split by a
straight read of `is_show`.
- `is_show` is **players only** (the legacy filter is `filterPlayersByTotalPlayedGames`); squad_stats
  does NOT get is_show unless the planner finds the legacy export filters squads too (verify).
- **Rejected:** computing is_show at export time — it would re-derive per-scope game counts in the
  export SQL, splitting the threshold logic across layers.

### D4 — include/exclude as a versioned config module, not a DB seed
Mirror the legacy `includeReplays.json` (3 entries: force a game type for prefix-less missions) and
`excludeReplays.json` (16 replay links: drop the replay entirely) as a typed **config module in the
statistics module** (spec-owned constants, committed + unit-tested). No migration/seed table.
- `excludeReplays` keyed by **source replay link/id** → map to server-2's promoted replay source
  metadata; matched replays get `game_type = NULL`.
- `includeReplays` keyed by **mission display name** → applied in classification when the mission has
  no clear prefix, forcing the configured type.
- **Rejected:** a DB seed/table for 19 static parser-spec constants (needs a migration + admin tooling
  for no runtime-edit benefit). Promote to DB later only if runtime editability is needed.

### Claude's Discretion (planner decides)
- Exact unique-index form for D1 (NULLS NOT DISTINCT vs partial indexes) per the running PG version.
- Whether classification writes `replays.game_type` via a dedicated repo method called from the
  full-run service vs folded into the existing assign step — keep it set-based and drop-in like F7.
- Migration mechanics (backfill existing rows; the column is canonical so a one-time backfill +
  recompute is expected since recalc may overwrite derived results — moderation audit patches must be
  preserved per project constraints).
</decisions>

<canonical_refs>
## Must-verify during planning (not a decision — a correctness gate)

- **Rotations are an operational precondition, NOT server-2 code.** Rotations are entered ONLY via the
  admin API (`src/modules/admin/routes/rotations.ts` + `rotation-repository.ts`); server-2 does not
  seed or snap them, and this phase must add NO snap/seed code. Legacy `rotations.ts` has 20 hardcoded
  start dates, each snapped to `.startOf('isoWeek')` (Monday UTC), last open-ended. The 20 admin-entered
  windows in the parity DB must equal those legacy windows — **confirmed already correct in staging**
  (parity-driver ran recalc over them). The phase only adds a pure reference-check test pinning the
  legacy 20 windows and comparing against any rotations present; correctness remains operational.
- **Behavior of existing single-replay audit path** (`*ForParserResult`) and the
  `ops:stats:recalculate` report shape must be preserved (game_type added, not a rewrite).
- **legacy-public-export contract**: it already exposes `playerGlobalStats` / `rotationStats` /
  `squadStats` / `otherPlayers`. Per-type emission must extend it in a way the parity diff expects —
  confirm against the legacy export shape the parity-driver compares to.
- `pnpm verify` green; OpenAPI **contract diff stays empty** (public API untouched this phase).

## References
- server-2: `src/infra/db/migrations/0001_v1_domain_schema.sql` (aggregate tables, rotations),
  `src/modules/statistics/repository/repository.ts` (recalc/group/replace),
  `repository/full-run.ts` (`assignRotationsForCurrentReplays` — set-based ref),
  `export/legacy-public-export.ts`, `repository/legacy-export.ts`, `repository/parity-sql.ts`,
  `src/modules/public-stats/replay-mapper.ts` (`extractMapName` — mission source).
- legacy: `sg-replay-parser` — `0 - consts/gameTypesArray.ts`, `1 - replays/getReplays.ts`,
  `index.ts`, `1 - replays/workers/parseReplayWorker.ts`, `0 - utils/filterPlayersByTotalPlayedGames.ts`,
  `0 - utils/rotations.ts`, `config/{includeReplays,excludeReplays}.json`.
- Conventions: solidstats-server-ts-conventions (migrations, Kysely, error mapping);
  review solidstats-server-ts-code-review; tests solidstats-server-ts-tests.
</canonical_refs>
