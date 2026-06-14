-- 0009_delete_pre_phase_null_type_aggregates: drop orphaned pre-phase aggregate rows.
--
-- Migration 0008 added game_type to the four aggregate tables but left every existing row with
-- game_type IS NULL. The full-run rebuild only deletes the (rotation_id, game_type) bucket it
-- writes, so those pre-phase NULL-type rows survive every recalc. The public parity-sql hot path
-- (bucket = undefined) sums ALL player_stats rows for a player, so a migrated production DB would
-- double/triple-count: old NULL per-rotation rows + new sg per-rotation rows + new sg all-time row.
--
-- Every pre-phase aggregate row is rotation-scoped with a NULL game_type and will be re-derived
-- per-type by the next full recalc, so deleting all NULL-type rows is the correct one-time cleanup.
-- The recompute rewrites derived rows only and never touches audit_patches/moderation_actions, so
-- moderation audit patches are preserved (D2 / project constraint).
--
-- IMPORTANT: a full `ops:stats:recalculate` MUST follow deploy to repopulate the per-type buckets.

delete from player_stats where game_type is null;
delete from squad_stats where game_type is null;
delete from commander_side_stats where game_type is null;
delete from bounty_points where game_type is null;
