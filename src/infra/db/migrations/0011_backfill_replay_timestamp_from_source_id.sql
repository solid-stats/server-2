-- 0011_backfill_replay_timestamp_from_source_id: derive replay_timestamp from source_replay_id.
--
-- Early replays (sg 187, mace 657, ~257 untyped; ~1101 total) carry a NULL replay_timestamp: they
-- predate the primary (non-epoch) date source the later replays had. The all-time stats scope now
-- excludes NULL-timestamp replays (the F11 guard `and r.replay_timestamp is not null` in
-- scopedCurrentResultsSql, PR #15), so every player silently loses the games/kills/deaths in those
-- replays.
--
-- The date IS recoverable: source_replay_id is the sg.zone id, a Unix epoch (seconds) suffix, e.g.
-- `sg-zone-1624129684` -> 2021-06-19. This one-time backfill sets replay_timestamp from that epoch
-- for every NULL-timestamp replay whose source_replay_id ends in a parseable epoch (a trailing run
-- of >= 9 digits). 9 digits is the smallest width that excludes an incidental short numeric suffix
-- (>= 1e8 seconds = year 1973, below any real replay).
--
-- This is a FALLBACK, never a replacement: the WHERE clause touches only rows where
-- replay_timestamp IS NULL, so a primary timestamp is never overwritten. Mirrors the ingest-path
-- derivation in src/modules/ingest/replay-timestamp.ts so backfilled and newly-promoted replays
-- agree. Behavior-preserving for derived stats until the next recalc; idempotent (re-running the
-- NULL-only update is a no-op once filled).
--
-- IMPORTANT: a full `ops:stats:recalculate` MUST follow deploy so the recovered replays are folded
-- back into the all-time buckets the F11 guard had been excluding.
--
-- down: there is no automatic revert (the migrate.ts runner is forward-only). To reverse, null out
-- the backfilled rows:
--   update replays set replay_timestamp = null
--   where promotion_evidence ->> 'replay_timestamp_source' = 'source_replay_id_epoch';
-- (no such marker is written, so a manual reversal would re-derive the affected ids instead.)

update replays
set replay_timestamp = to_timestamp(
      (substring(source_replay_id from '(\d{9,})$'))::bigint
    ),
    updated_at = now()
where replay_timestamp is null
  and source_replay_id ~ '\d{9,}$';
