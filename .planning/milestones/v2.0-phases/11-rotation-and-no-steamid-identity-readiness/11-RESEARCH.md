# Phase 11 Research: Rotation and No-SteamID Identity Readiness

**Status:** complete
**Completed:** 2026-05-12

## Existing Code

- Rotation assignment exists inside `PgStatisticsRepository` aggregate recalculation. It maps replay timestamps to the latest rotation where `starts_at <= timestamp` and `ends_at` is null or greater than the timestamp.
- Recalculation returns `missing_replay_timestamp` and `missing_rotation`, but it does not list all affected replays in an operator report.
- `rotations`, `replays`, `parser_results`, `canonical_players`, `player_nicknames`, and `player_steam_ids` already exist in the v1 schema.
- Parser-result identity resolution already supports:
  - SteamID matching when a known player SteamID exists.
  - Active nickname history by validity window.
  - Display-name fallback.
  - Provisional observed-name identity creation during aggregate recalculation.
- Moderation workflows can link Steam IDs, merge players, and split selected nickname/SteamID rows.
- Phase 10 added `ops:stats:coverage` and `ops:stats:recalculate`, plus full-run documentation.

## Implementation Direction

1. Add a readiness service that builds a JSON report with:
   - rotation coverage summary;
   - missing timestamp replay list;
   - missing rotation replay list;
   - overlapping rotation replay list;
   - rotation range replay counts;
   - no-SteamID identity resolution summary;
   - unresolved observed nickname list;
   - nickname-history conflict list.
2. Add a PostgreSQL read model for readiness evidence:
   - rotations ordered by range;
   - replays with timestamps and rotation-match counts;
   - current parser result snapshots;
   - canonical player display names and nickname validity windows.
3. Add `pnpm run ops:stats:readiness` as the supported operator report command.
4. Document identity rules and future SteamID migration behavior.

## Test Direction

- Unit-test readiness summary logic with in-memory fixtures for:
  - exact rotation mappings;
  - missing timestamps;
  - missing rotations;
  - overlapping rotations;
  - nickname-history match;
  - provisional observed-name match;
  - blank observed name;
  - ambiguous nickname conflict.
- Unit-test PostgreSQL readiness read model mapping with a scripted pool.
- Unit-test the CLI entrypoint with mocked repository/service construction.
- Preserve 100% V8 coverage.

## Boundaries

- Do not parse OCAP files.
- Do not crawl replay sources.
- Do not commit runtime SSH details.
- Do not mutate canonical identity outside the existing request/moderation workflow unless a later explicit import plan is approved.
- Do not add public API/OpenAPI shape for readiness until Phase 12 decides whether parity status becomes a `web` contract.
