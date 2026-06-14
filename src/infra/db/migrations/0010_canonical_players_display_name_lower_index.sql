-- 0010_canonical_players_display_name_lower_index: index lower(canonical_players.display_name).
--
-- The name-fallback identity resolve (statistics recalc, `ensureNameFallbackIdentities`) and the
-- `loadPlayerIdentities` join both probe `lower(canonical_players.display_name)` against the set of
-- observed parser names for a recalc bucket. A functional index on lower(nickname) already exists
-- (`idx_player_nicknames_nickname`, migration 0001), but the matching index on
-- lower(canonical_players.display_name) was never added — so the display_name half of every probe
-- is a sequential scan. On the F8 all-time `mace` bucket (~20735 replays in one recalc pass) that
-- is a seq scan per distinct observed name, the recalc hot spot the parity-driver flagged.
--
-- This is a behavior-preserving performance index only: it changes query plans, never results.
-- Run inside the migrate.ts transaction wrapper, so a plain (non-CONCURRENTLY) build is used; the
-- table is small relative to the recalc scan it accelerates. Idempotent via `if not exists`.

create index if not exists idx_canonical_players_display_name_lower
  on canonical_players (lower(display_name));
