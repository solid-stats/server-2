-- Phase 14 (PAGE-02/PAGE-03): composite indexes that keep the keyset (seek)
-- list queries non-degenerate. Each list endpoint orders by a sort key plus a
-- unique id tie-breaker; these indexes back the stored-column orderings and the
-- per-row JSONB stat extraction. The aggregate sort keys (kills/teamkills) are
-- runtime SUMs over player_stats/squad_stats JSONB and cannot be index-sought
-- directly, so the covering (entity_id, rotation_id) indexes below keep the
-- grouped scan + HAVING seek cheap.

-- Stored-column name sorts (players/squads list, ASC/DESC NULLS-aware):
create index if not exists idx_canonical_players_display_name_id
  on canonical_players (display_name, id);

create index if not exists idx_squads_name_id
  on squads (name, id);

-- Stored-column points sort (bounty list + bounty leaderboard), with the
-- bounty.id tie-breaker that ends every keyset tuple:
create index if not exists idx_bounty_points_points_id
  on bounty_points (points, id);

-- Covering indexes for the grouped-aggregate sort path (kills/teamkills): the
-- join is stats.<entity>_id = <entity>.id filtered by rotation_id. 0001 only
-- declares unique (rotation_id, <entity>_id); add the (<entity>_id, rotation_id)
-- order so the per-entity grouping scan stays index-driven.
create index if not exists idx_player_stats_player_rotation
  on player_stats (player_id, rotation_id);

create index if not exists idx_squad_stats_squad_rotation
  on squad_stats (squad_id, rotation_id);
