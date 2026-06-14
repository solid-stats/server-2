-- 0008_game_type_aggregates: make statistics aggregates game-type-aware (parity phase 1).
--
-- Adds the canonical game_type dimension required by every later plan in this phase:
--   * replays.game_type (D2): nullable canonical type; NULL = excluded from all buckets.
--   * game_type on the four aggregate tables (D1): the per-type dimension.
--   * rotation_id made nullable on the four aggregate tables (D1): rotation_id IS NULL is the
--     all-time bucket; sg keeps per-rotation rows, mace/sm get all-time-only rows.
--   * NULLS NOT DISTINCT uniqueness (PG17, confirmed) so a single all-time row per
--     (entity, game_type) is enforced and duplicate all-time rows are rejected.
--   * player_stats.is_show (D3): persisted is_show split; existing rows stay shown.

-- D2: canonical, nullable, no check constraint (classification writes 'sg'|'mace'|'sm' or NULL).
alter table replays
  add column game_type text;

-- D1: player_stats — add dimension, allow all-time bucket, game-type-aware uniqueness.
alter table player_stats
  add column game_type text;
alter table player_stats
  alter column rotation_id drop not null;
alter table player_stats
  drop constraint if exists player_stats_rotation_id_player_id_key;
alter table player_stats
  add constraint player_stats_rotation_player_type_key
  unique nulls not distinct (rotation_id, player_id, game_type);

-- D1: squad_stats.
alter table squad_stats
  add column game_type text;
alter table squad_stats
  alter column rotation_id drop not null;
alter table squad_stats
  drop constraint if exists squad_stats_rotation_id_squad_id_key;
alter table squad_stats
  add constraint squad_stats_rotation_squad_type_key
  unique nulls not distinct (rotation_id, squad_id, game_type);

-- D1: bounty_points.
alter table bounty_points
  add column game_type text;
alter table bounty_points
  alter column rotation_id drop not null;
alter table bounty_points
  drop constraint if exists bounty_points_rotation_id_player_id_key;
alter table bounty_points
  add constraint bounty_points_rotation_player_type_key
  unique nulls not distinct (rotation_id, player_id, game_type);

-- D1: commander_side_stats — no explicit unique existed; add the commander triple + game_type.
-- player_id is nullable here; NULLS NOT DISTINCT also collapses null player_id rows, matching the
-- existing one-row-per-(rotation, player, side) intent.
alter table commander_side_stats
  add column game_type text;
alter table commander_side_stats
  alter column rotation_id drop not null;
alter table commander_side_stats
  add constraint commander_side_stats_rotation_player_side_type_key
  unique nulls not distinct (rotation_id, player_id, side, game_type);

-- D3: is_show on player_stats; default keeps existing rows shown, recalc overwrites per scope.
alter table player_stats
  add column is_show boolean not null default true;
