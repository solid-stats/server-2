-- 0013_correct_replay_timestamp_epoch_primary: correct replay_timestamp to the source-id epoch.
--
-- ROOT CAUSE: the staged replay_timestamp promoted into replays was a server-local wall-clock value
-- (≈UTC+1) wrongly stamped as UTC, or filename-sourced (the file-write/game-end event, not
-- game-start) -- a ~1 hour (or larger) skew. The Unix epoch encoded in source_replay_id (the sg.zone
-- id, e.g. `sg-zone-1624129684` -> 2021-06-19) is the only unambiguous true UTC instant the system
-- carries. The fetcher made that epoch the PRIMARY timestamp source; this migration mirrors the flip
-- on already-promoted rows.
--
-- CORRECTING, not filling (unlike 0011): the update is NOT gated on `replay_timestamp is null`. It
-- OVERWRITES every in-range-epoch row's replay_timestamp -- including non-null rows holding the old
-- wrong value -- with to_timestamp(epoch), a UTC instant. Rows whose source_replay_id has no in-range
-- epoch (`derived:*`, non-numeric, or out-of-range) are left untouched by the pattern + range guard.
--
-- The accepted epoch is the fetcher's authoritative window -- between 1420070400 (2015-01-01) and
-- 2051222400 (2035-01-01), inclusive. The pattern matches a trailing run of EXACTLY 10 digits (a
-- non-digit or string start, then 10 digits to the end), so a longer run is skipped before the
-- ::bigint cast rather than overflowing it. This is the SAME exact-10 anchor + bound the ingest-path
-- derivation applies in src/modules/ingest/replay-timestamp.ts, so backfilled and newly-promoted
-- replays accept/reject the SAME inputs and agree exactly.
--
-- DIVERGENCE from 0011: the bound is tightened from [1000000000, 2000000000] to
-- [1420070400, 2051222400]. Rows 0011 backfilled that fall inside the new window are rewritten to the
-- SAME to_timestamp(epoch) value (a no-op). Rows 0011 may have filled with an epoch in [1e9,
-- 1420070400) -- now out of the new window -- are not in scope here (no real data exists there).
--
-- Idempotent: both the WHERE set and the computed value are pure functions of source_replay_id, so
-- re-running yields identical to_timestamp(epoch) values.
--
-- IMPORTANT: a full `ops:stats:recalculate` SHOULD follow deploy so the corrected timestamps are
-- reflected in any time-bucketed aggregates.
--
-- down: there is no automatic revert (the migrate.ts runner is forward-only). No marker distinguishes
-- a corrected row from one that always had this value, so a precise revert is impossible. An
-- approximate revert is NOT meaningful here: the OLD value was wrong by design (server-local-as-UTC /
-- wrong event), so there is no correct prior value to restore -- a re-null is intentionally not
-- offered.

update replays
set replay_timestamp = to_timestamp(
      (substring(source_replay_id from '(?:\D|^)(\d{10})$'))::bigint
    ),
    updated_at = now()
where source_replay_id ~ '(\D|^)\d{10}$'
  and (substring(source_replay_id from '(?:\D|^)(\d{10})$'))::bigint
        between 1420070400 and 2051222400;
