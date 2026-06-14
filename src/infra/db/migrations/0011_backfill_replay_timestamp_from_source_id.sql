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
-- for every NULL-timestamp replay whose source_replay_id ends in a parseable epoch.
--
-- The accepted epoch is bounded to a plausible Unix-seconds range -- between 1000000000 (2001-09)
-- and 2000000000 (2033-05) -- which covers every real 10-digit sg.zone id and rejects shorter
-- (pre-2001) and longer (far-future / int8-overflow) digit runs alike. The pattern matches a
-- trailing run of EXACTLY 10 digits (a non-digit or string start, then 10 digits to the end), so a
-- longer run is skipped before the ::bigint cast rather than overflowing it. This is the SAME bound
-- the ingest-path derivation applies in src/modules/ingest/replay-timestamp.ts, so backfilled and
-- newly-promoted replays agree exactly.
--
-- This is a FALLBACK, never a replacement: the WHERE clause touches only rows where
-- replay_timestamp IS NULL, so a primary timestamp is never overwritten. Behavior-preserving for
-- derived stats until the next recalc; idempotent (re-running the NULL-only update is a no-op once
-- filled).
--
-- IMPORTANT: a full `ops:stats:recalculate` MUST follow deploy so the recovered replays are folded
-- back into the all-time buckets the F11 guard had been excluding.
--
-- down: there is no automatic revert (the migrate.ts runner is forward-only). No marker is written
-- to distinguish a backfilled row from a row that always had this timestamp, so a precise revert is
-- not possible. To approximately reverse, re-null the rows whose current replay_timestamp still
-- equals the epoch this migration would derive from their source_replay_id:
--   update replays
--   set replay_timestamp = null
--   where replay_timestamp is not null
--     and source_replay_id ~ '(\D|^)\d{10}$'
--     and (substring(source_replay_id from '(?:\D|^)(\d{10})$'))::bigint
--           between 1000000000 and 2000000000
--     and replay_timestamp = to_timestamp(
--           (substring(source_replay_id from '(?:\D|^)(\d{10})$'))::bigint
--         );

update replays
set replay_timestamp = to_timestamp(
      (substring(source_replay_id from '(?:\D|^)(\d{10})$'))::bigint
    ),
    updated_at = now()
where replay_timestamp is null
  and source_replay_id ~ '(\D|^)\d{10}$'
  and (substring(source_replay_id from '(?:\D|^)(\d{10})$'))::bigint
        between 1000000000 and 2000000000;
