---
phase: 01-game-type-aware-statistics-parity
plan: 01
subsystem: db-schema
status: complete
tags: [migration, statistics, game-type, parity]
requires: []
provides:
  - replays.game_type
  - aggregate.game_type-dimension
  - aggregate.nullable-rotation-id
  - aggregate.nulls-not-distinct-uniqueness
  - player_stats.is_show
affects:
  - src/modules/statistics
tech-stack:
  added: []
  patterns:
    - additive immutable SQL migration (0008) under checksum-pinned migrate.ts
    - UNIQUE NULLS NOT DISTINCT (PG17) for the all-time bucket key
key-files:
  created:
    - src/infra/db/migrations/0008_game_type_aggregates.sql
  modified:
    - src/test/integration/schema.test.ts
decisions:
  - "Used UNIQUE NULLS NOT DISTINCT (not partial indexes) for D1 — PG17 confirmed running (postgres:17-alpine)"
  - "Forward-only .sql migration (no down) to match existing 0001–0007 pattern; migrate.ts has no down support"
metrics:
  duration: ~12m
  completed: 2026-06-14
  tasks: 2
  files: 2
requirements:
  - PARITY-F8-GAMETYPE-MIGRATION
---

# Phase 1 Plan 01: Migration 0008 — Game-Type-Aware Schema Summary

Added the canonical `game_type` dimension to the statistics schema via one immutable migration: nullable `replays.game_type`, `game_type` + nullable `rotation_id` on the four aggregate tables, `UNIQUE NULLS NOT DISTINCT` keys enforcing one all-time row per (entity, game_type), and `player_stats.is_show` — all pinned by the real-pg schema test.

## What Was Built

**Task 1 — `0008_game_type_aggregates.sql`** (commit `ba2795e`)
- `alter table replays add column game_type text` (D2 — nullable, NULL = excluded, no check constraint).
- For `player_stats`, `squad_stats`, `bounty_points`, `commander_side_stats`: added nullable `game_type text` and dropped `not null` on `rotation_id` (D1 — `rotation_id IS NULL` = all-time bucket).
- Replaced the rotation-only auto-named unique constraints (`<table>_rotation_id_<entity>_key`) with explicitly named game-type-aware `UNIQUE NULLS NOT DISTINCT` constraints:
  - `player_stats_rotation_player_type_key (rotation_id, player_id, game_type)`
  - `squad_stats_rotation_squad_type_key (rotation_id, squad_id, game_type)`
  - `bounty_points_rotation_player_type_key (rotation_id, player_id, game_type)`
  - `commander_side_stats_rotation_player_side_type_key (rotation_id, player_id, side, game_type)` (commander_side_stats had no explicit unique before — added per D1).
- `alter table player_stats add column is_show boolean not null default true` (D3 — existing rows stay shown).

**Task 2 — schema test extension** (commit `d7a557a`)
- Added a `0008 game-type-aware aggregate schema` describe block asserting: nullable `replays.game_type`; `game_type` + nullable `rotation_id` on all four aggregate tables; `player_stats.is_show` boolean NOT NULL default true; and a behavioral `23505` unique-violation check that inserts two all-time `player_stats` rows with the same `(NULL rotation_id, player_id, 'sg')` and asserts the second is rejected (proving NULLS NOT DISTINCT collapses the NULL rotation). The seeded `canonical_player` is cleaned up in a `finally` (cascade deletes the seeded stats rows).

## Verification

- `pnpm run db:migrate` applies 0008 cleanly on the DB; re-run is a checksum-stable no-op (no "checksum changed").
- Direct `information_schema` + `pg_constraint` inspection confirmed every column, nullability, default, and the four `UNIQUE NULLS NOT DISTINCT` definitions; the old rotation-only `_key` constraints are gone.
- `pnpm run test:schema` — 10/10 pass (6 original + 4 new).
- `pnpm run typecheck` clean, `pnpm run lint` clean.
- `pnpm run openapi:check` clean — public API/contract diff empty (no route/schema change), as required by the parity scope.
- `git diff` touches only `0008_game_type_aggregates.sql` + `schema.test.ts`; no existing migration edited.

## Deviations from Plan

None — plan executed as written. The plan's `<verify>` blocks call `psql`, which is not on PATH in this environment; equivalent verification was done via `pnpm run db:migrate` (the canonical migration path) plus a `pg`-driver `information_schema`/`pg_constraint` inspection and the real-pg `test:schema` suite. Results are identical to what the `psql` checks would assert.

## Notes for Later Plans

- The four aggregate tables now accept all-time rows with `rotation_id IS NULL`; recalc must set `game_type` on every row it writes (the column is nullable only to permit backfill/recompute, not as a steady-state value for kept replays).
- `is_show` exists on `player_stats` only (D3 — players-only); squad_stats intentionally has none.
- No backfill of existing rows was performed here — `game_type` stays NULL on pre-existing aggregate rows until the recalc/classification plan overwrites them.

## Self-Check: PASSED
- FOUND: src/infra/db/migrations/0008_game_type_aggregates.sql
- FOUND: src/test/integration/schema.test.ts (modified)
- FOUND commit: ba2795e (migration)
- FOUND commit: d7a557a (schema test)
