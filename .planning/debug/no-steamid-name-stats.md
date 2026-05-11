# Debug: no-SteamID replay stats stay empty

## Trigger

Controlled staging full-run on `2026-05-10` parsed 30 replays successfully, but
server-2 public stats still returned empty player and squad leaderboards.

## Evidence

- `parse_jobs`: 30 succeeded.
- `parser_results`: 30 current results.
- `parser_events`: 3720 normalized events.
- `replays_with_timestamp`: 30 after `replays-fetcher` started sending
  replay timestamps.
- `replays_with_rotation`: 30 after seeding the controlled-run rotation.
- `player_stats`: 0.
- `squad_stats`: 0.
- Parser artifact sample players currently have names but no SteamID.

## Current Hypothesis

`PgStatisticsRepository` resolves aggregate players only through
`canonical_players.display_name` or `player_steam_ids.steam_id`. With current
replays lacking SteamID and staging DB lacking pre-seeded canonical players,
`resolvedPlayers` drops every artifact player. The fix should resolve names via
manual `player_nicknames` history at replay time, and create a provisional
canonical player by observed name when no manual identity exists yet.
