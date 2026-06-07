-- Phase 17 (REPLAY-03): composite btree index on parser_events that backs the
-- events join (parser_result_id lookup) and the (occurred_at ASC NULLS FIRST,
-- id ASC) keyset order used by getReplayEvents.
--
-- migrate.ts contract: runs once in one begin/commit, sha256-checksummed.
-- Idempotent: create index if not exists; safe to re-run on a fresh DB.

create index if not exists idx_parser_events_result_occurred
  on parser_events (parser_result_id, occurred_at, id);
